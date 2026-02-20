const { createBrowser } = require('../utils/browser');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const fs = require('fs');
const PurchaseTester = require('./purchaseTester');

// Issue types that are errors (fail the page). Everything else is a warning.
const ERROR_SEVERITY_TYPES = new Set([
  'http-error', 'js-error', 'request-failed', 'login-failed',
  'login-error', 'broken-image', 'navigation-error'
]);

// Issue types that are explicitly warnings (do NOT fail the page).
// New/unknown types default to ERROR for safety.
const WARNING_SEVERITY_TYPES = new Set([
  'console-error', 'resource-404', 'slow-page', 'form-missing-csrf'
  // a11y-* types handled via prefix check below
]);

class WebsiteCrawler {
  constructor(config) {
    this.config = config;
    this.browser = null;
    this.page = null;
    this.visited = new Set();
    this.purchaseTester = null;
    this.results = {
      id: uuidv4(),
      site: config.baseUrl,
      account: config.accountType,
      startTime: null,
      endTime: null,
      pages: [],
      issues: [],
      purchases: [],
      summary: { total: 0, passed: 0, failed: 0, warnings: 0, warnings_only: 0 }
    };
    this.screenshotDir = path.join(__dirname, '../../screenshots', this.results.id);
  }

  async init(paymentConfig = null, viewport = null) {
    fs.mkdirSync(this.screenshotDir, { recursive: true });

    // Viewport presets: mobile, tablet, desktop
    const viewports = {
      mobile: { width: 375, height: 812, isMobile: true, hasTouch: true },
      tablet: { width: 768, height: 1024, isMobile: true, hasTouch: true },
      desktop: { width: 1920, height: 1080 }
    };
    const vp = viewports[viewport] || viewports.desktop;

    const { browser, page } = await createBrowser({ viewport: vp });
    this.browser = browser;
    this.page = page;
    this.results.viewport = viewport || 'desktop';

    // Initialize purchase tester if payment config provided
    if (paymentConfig) {
      this.purchaseTester = new PurchaseTester(this.page, paymentConfig);
    }

    // Capture console errors
    this.page.on('console', msg => {
      if (msg.type() === 'error') {
        this.addIssue('console-error', msg.text(), this.page.url(), 'warning');
      }
    });

    // Capture page errors
    this.page.on('pageerror', error => {
      this.addIssue('js-error', error.message, this.page.url(), 'error');
    });

    // Capture failed requests
    this.page.on('requestfailed', request => {
      this.addIssue('request-failed', `${request.url()} - ${request.failure().errorText}`, this.page.url(), 'error');
    });

    // Capture 404 responses
    this.page.on('response', response => {
      if (response.status() === 404) {
        this.addIssue('resource-404', `${response.url()}`, this.page.url(), 'warning');
      }
    });
  }

  async login(accountConfig) {
    const loginUrl = this.config.baseUrl + accountConfig.loginUrl;
    console.log(`[Khai] Logging in at ${loginUrl}`);

    try {
      // Magic link auth: fetch token from API, navigate to login URL
      if (accountConfig.magicLinkAuth) {
        console.log(`[Khai] Using magic link auth: ${accountConfig.magicLinkAuth}`);
        const fetch = (await import('node-fetch')).default;
        const resp = await fetch(accountConfig.magicLinkAuth);
        const data = await resp.json();
        if (!data.loginUrl) {
          throw new Error('Magic link API did not return loginUrl');
        }
        console.log(`[Khai] Got magic link, navigating...`);
        await this.page.goto(data.loginUrl, { waitUntil: 'networkidle2', timeout: 30000 });
        await new Promise(resolve => setTimeout(resolve, 4000));
        await this.takeScreenshot('magic-link-login');
        const currentUrl = this.page.url();
        console.log(`[Khai] After magic link URL: ${currentUrl}`);
        if (currentUrl.includes('/login') && !currentUrl.includes('token')) {
          this.addIssue('login-failed', 'Magic link login may have failed - still on login page', loginUrl, 'error');
          return false;
        }
        console.log(`[Khai] Magic link login successful!`);
        return true;
      }

      // Skip login if configured (public/unauthenticated crawl)
      if (accountConfig.skipLogin) {
        console.log(`[Khai] Skipping login (public crawl)`);
        await this.page.goto(this.config.baseUrl, { waitUntil: 'networkidle2', timeout: 30000 });
        await new Promise(resolve => setTimeout(resolve, 2000));
        await this.takeScreenshot('public-start');
        return true;
      }

      await this.page.goto(loginUrl, { waitUntil: 'networkidle2', timeout: 30000 });

      // Wait extra time for SPA hydration
      await new Promise(resolve => setTimeout(resolve, 3000));
      await this.takeScreenshot('login-page');

      // Try multiple selectors for email field
      const emailSelectors = accountConfig.usernameField.split(',').map(s => s.trim());
      let emailInput = null;

      for (const selector of emailSelectors) {
        try {
          await this.page.waitForSelector(selector, { timeout: 5000 });
          emailInput = selector;
          console.log(`[Khai] Found email input: ${selector}`);
          break;
        } catch (e) {
          continue;
        }
      }

      if (!emailInput) {
        // Fallback: find any email or text input
        emailInput = await this.page.evaluate(() => {
          const inputs = document.querySelectorAll('input[type="email"], input[type="text"]');
          for (const input of inputs) {
            if (input.offsetParent !== null) { // is visible
              return `input[type="${input.type}"]`;
            }
          }
          return null;
        });
      }

      if (!emailInput) {
        throw new Error('Could not find email input field');
      }

      // Try multiple selectors for password field
      const passwordSelectors = accountConfig.passwordField.split(',').map(s => s.trim());
      let passwordInput = null;

      for (const selector of passwordSelectors) {
        try {
          await this.page.waitForSelector(selector, { timeout: 3000 });
          passwordInput = selector;
          console.log(`[Khai] Found password input: ${selector}`);
          break;
        } catch (e) {
          continue;
        }
      }

      if (!passwordInput) {
        passwordInput = 'input[type="password"]';
      }

      // Type credentials
      await this.page.type(emailInput, accountConfig.username, { delay: 50 });
      await this.page.type(passwordInput, accountConfig.password, { delay: 50 });

      await this.takeScreenshot('credentials-entered');

      // Find and click submit button
      const submitSelectors = accountConfig.submitButton.split(',').map(s => s.trim());
      let clicked = false;

      for (const selector of submitSelectors) {
        try {
          const btn = await this.page.$(selector);
          if (btn) {
            await Promise.all([
              btn.click(),
              this.page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 }).catch(() => {})
            ]);
            clicked = true;
            break;
          }
        } catch (e) {
          continue;
        }
      }

      if (!clicked) {
        // Try pressing Enter
        await this.page.keyboard.press('Enter');
        await this.page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 }).catch(() => {});
      }

      await new Promise(resolve => setTimeout(resolve, 2000));
      await this.takeScreenshot('after-login');

      // Check if login was successful
      const currentUrl = this.page.url();
      console.log(`[Khai] After login URL: ${currentUrl}`);

      if (currentUrl.includes('/login') && !currentUrl.includes('callback')) {
        this.addIssue('login-failed', 'Login may have failed - still on login page', loginUrl, 'error');
        return false;
      }

      console.log(`[Khai] Login successful!`);
      return true;
    } catch (error) {
      this.addIssue('login-error', error.message, loginUrl, 'error');
      await this.takeScreenshot('login-error');
      return false;
    }
  }

  async crawl(startUrl = null, maxDepth = 3, currentDepth = 0) {
    if (!this.results.startTime) {
      this.results.startTime = new Date().toISOString();
    }

    const url = startUrl || this.config.baseUrl;

    const normalizedUrl = url.split('#')[0].replace(/\/+$/, '') || url.split('#')[0];
    if (this.visited.has(normalizedUrl) || currentDepth > maxDepth) {
      return;
    }

    if (!this.isInternalUrl(url)) {
      return;
    }

    this.visited.add(normalizedUrl);
    console.log(`Crawling: ${url} (depth: ${currentDepth})`);

    const pageResult = {
      url,
      status: null,
      loadTime: null,
      issues: [],
      screenshot: null,
      links: []
    };

    try {
      const startTime = Date.now();
      const response = await this.page.goto(url, {
        waitUntil: 'networkidle2',
        timeout: 30000
      });
      pageResult.loadTime = Date.now() - startTime;
      pageResult.status = response ? response.status() : null;

      // Take screenshot
      const screenshotName = this.urlToFilename(url);
      await this.takeScreenshot(screenshotName);
      pageResult.screenshot = `${screenshotName}.png`;

      // Check status code
      if (pageResult.status >= 400) {
        this.addIssue('http-error', `HTTP ${pageResult.status}`, url, 'error');
        pageResult.issues.push({ type: 'http-error', message: `HTTP ${pageResult.status}` });
      }

      // Check for slow pages
      if (pageResult.loadTime > 5000) {
        this.addIssue('slow-page', `Page took ${pageResult.loadTime}ms to load`, url, 'warning');
        pageResult.issues.push({ type: 'slow-page', message: `${pageResult.loadTime}ms load time` });
      }

      // Run accessibility checks
      await this.checkAccessibility(url, pageResult);

      // Check for broken images
      await this.checkImages(url, pageResult);

      // Check forms
      await this.checkForms(url, pageResult);

      // Check for checkout/payment pages
      if (this.purchaseTester) {
        const isCheckout = await this.purchaseTester.detectCheckoutPage();
        if (isCheckout) {
          pageResult.isCheckout = true;
          const purchase = await this.purchaseTester.createPurchaseRequest(this.config.baseUrl);
          this.results.purchases.push(purchase);
          console.log(`⚠️ Checkout page detected! Purchase ID: ${purchase.id}`);
        }
      }

      // Get all links
      const links = await this.page.evaluate(() => {
        return Array.from(document.querySelectorAll('a[href]'))
          .map(a => a.href)
          .filter(href => href && !href.startsWith('javascript:') && !href.startsWith('mailto:') && !href.startsWith('tel:'));
      });

      pageResult.links = links;

      // Merge event-handler issues (js-error, request-failed, console-error, resource-404)
      // that were captured by page.on() listeners into pageResult.issues
      const pageUrl = this.page.url();
      for (const issue of this.results.issues) {
        if (issue.url === pageUrl || issue.url === url) {
          const alreadyTracked = pageResult.issues.some(
            i => i.type === issue.type && i.message === issue.message
          );
          if (!alreadyTracked) {
            pageResult.issues.push({ type: issue.type, message: issue.message });
          }
        }
      }

      this.results.pages.push(pageResult);
      this.results.summary.total++;

      // Three-tier classification: pass / warnings-only / fail
      // Unknown issue types default to error (safer than defaulting to warning)
      const isWarningType = (type) =>
        WARNING_SEVERITY_TYPES.has(type) || type.startsWith('a11y-');
      const hasErrors = pageResult.issues.some(i => !isWarningType(i.type));

      if (pageResult.issues.length === 0) {
        this.results.summary.passed++;
      } else if (!hasErrors) {
        this.results.summary.passed++;
        this.results.summary.warnings_only++;
      } else {
        this.results.summary.failed++;
      }

      // Crawl child pages (deduplicated, normalized, filtered to internal only)
      const uniqueLinks = [...new Set(
        links.map(l => l.split('#')[0].replace(/\/+$/, '') || l.split('#')[0])
             .filter(l => !this.visited.has(l) && this.isInternalUrl(l))
      )];
      for (const link of uniqueLinks) {
        await this.crawl(link, maxDepth, currentDepth + 1);
      }

    } catch (error) {
      this.addIssue('navigation-error', error.message, url, 'error');
      pageResult.issues.push({ type: 'navigation-error', message: error.message });
      this.results.pages.push(pageResult);
      this.results.summary.total++;
      this.results.summary.failed++;
    }
  }

  async checkAccessibility(url, pageResult) {
    try {
      const issues = await this.page.evaluate(() => {
        const problems = [];

        // Check images without alt
        document.querySelectorAll('img').forEach(img => {
          if (!img.alt && !img.getAttribute('aria-label')) {
            problems.push({ type: 'missing-alt', element: img.src || 'unknown image' });
          }
        });

        // Check buttons/links without text
        document.querySelectorAll('button, a').forEach(el => {
          const text = el.textContent?.trim() || el.getAttribute('aria-label');
          if (!text && !el.querySelector('img')) {
            problems.push({ type: 'empty-interactive', element: el.outerHTML.substring(0, 100) });
          }
        });

        // Check form inputs without labels
        document.querySelectorAll('input, select, textarea').forEach(input => {
          const id = input.id;
          const hasLabel = id && document.querySelector(`label[for="${id}"]`);
          const hasAriaLabel = input.getAttribute('aria-label') || input.getAttribute('aria-labelledby');
          if (!hasLabel && !hasAriaLabel && input.type !== 'hidden' && input.type !== 'submit') {
            problems.push({ type: 'unlabeled-input', element: input.outerHTML.substring(0, 100) });
          }
        });

        // Check heading hierarchy
        const headings = Array.from(document.querySelectorAll('h1, h2, h3, h4, h5, h6'));
        let lastLevel = 0;
        headings.forEach(h => {
          const level = parseInt(h.tagName[1]);
          if (level > lastLevel + 1 && lastLevel !== 0) {
            problems.push({ type: 'heading-skip', element: `Jumped from h${lastLevel} to h${level}` });
          }
          lastLevel = level;
        });

        return problems;
      });

      issues.forEach(issue => {
        this.addIssue(`a11y-${issue.type}`, issue.element, url, 'warning');
        pageResult.issues.push({ type: `a11y-${issue.type}`, message: issue.element });
      });
    } catch (error) {
      console.error('Accessibility check error:', error.message);
    }
  }

  async checkImages(url, pageResult) {
    try {
      // Scroll to bottom to trigger lazy-loaded images
      await this.page.evaluate(async () => {
        await new Promise((resolve) => {
          let totalHeight = 0;
          const distance = 300;
          const timer = setInterval(() => {
            const scrollHeight = document.body.scrollHeight;
            window.scrollBy(0, distance);
            totalHeight += distance;
            if (totalHeight >= scrollHeight) {
              clearInterval(timer);
              window.scrollTo(0, 0); // Scroll back to top
              resolve();
            }
          }, 100);
        });
      });

      // Wait for images to load after scrolling
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Wait for all images to complete loading
      await this.page.evaluate(async () => {
        const images = Array.from(document.querySelectorAll('img'));
        await Promise.all(images.map(img => {
          if (img.complete) return Promise.resolve();
          return new Promise((resolve) => {
            img.addEventListener('load', resolve);
            img.addEventListener('error', resolve);
            // Timeout after 3 seconds
            setTimeout(resolve, 3000);
          });
        }));
      });

      const brokenImages = await this.page.evaluate(() => {
        return Array.from(document.querySelectorAll('img'))
          .filter(img => {
            // Skip placeholder/loading images
            if (img.src.includes('data:') || img.src.includes('placeholder')) return false;
            // Check if image failed to load
            return !img.complete || img.naturalWidth === 0;
          })
          .map(img => img.src);
      });

      brokenImages.forEach(src => {
        this.addIssue('broken-image', src, url, 'error');
        pageResult.issues.push({ type: 'broken-image', message: src });
      });
    } catch (error) {
      console.error('Image check error:', error.message);
    }
  }

  async checkForms(url, pageResult) {
    try {
      const formIssues = await this.page.evaluate(() => {
        const problems = [];

        document.querySelectorAll('form').forEach((form, index) => {
          // Check for CSRF token
          const hasCSRF = form.querySelector('input[name*="csrf"]') ||
                          form.querySelector('input[name*="token"]') ||
                          form.querySelector('input[name="_token"]');

          if (!hasCSRF && form.method?.toLowerCase() === 'post') {
            problems.push({ type: 'missing-csrf', element: `Form ${index + 1}` });
          }

          // Check for required fields without validation
          form.querySelectorAll('input[required], select[required], textarea[required]').forEach(input => {
            if (!input.getAttribute('pattern') && !input.type.match(/email|url|tel|number/)) {
              // Just a note, not necessarily an issue
            }
          });
        });

        return problems;
      });

      formIssues.forEach(issue => {
        this.addIssue(`form-${issue.type}`, issue.element, url, 'warning');
        pageResult.issues.push({ type: `form-${issue.type}`, message: issue.element });
      });
    } catch (error) {
      console.error('Form check error:', error.message);
    }
  }

  addIssue(type, message, url, severity = 'warning') {
    this.results.issues.push({
      id: uuidv4(),
      type,
      message,
      url,
      severity,
      timestamp: new Date().toISOString()
    });

    if (severity === 'warning') {
      this.results.summary.warnings++;
    }
  }

  async takeScreenshot(name) {
    try {
      const filepath = path.join(this.screenshotDir, `${name}.png`);
      await this.page.screenshot({ path: filepath, fullPage: true });
      return filepath;
    } catch (error) {
      console.error('Screenshot error:', error.message);
      return null;
    }
  }

  urlToFilename(url) {
    return url
      .replace(/https?:\/\//, '')
      .replace(/[^a-zA-Z0-9]/g, '_')
      .substring(0, 100);
  }

  isInternalUrl(url) {
    try {
      const baseHost = new URL(this.config.baseUrl).host;
      const checkHost = new URL(url).host;
      return baseHost === checkHost;
    } catch {
      return false;
    }
  }

  async close() {
    this.results.endTime = new Date().toISOString();
    if (this.browser) {
      await this.browser.close();
    }
    return this.results;
  }

  // Purchase testing methods
  getPendingPurchases() {
    if (!this.purchaseTester) return [];
    return this.purchaseTester.getPendingPurchases();
  }

  async fillPaymentAndRequestConfirmation(cardKey = 'primary') {
    if (!this.purchaseTester) return null;

    const cardConfig = this.purchaseTester.config.cards?.[cardKey];
    if (!cardConfig) return null;

    await this.purchaseTester.fillPaymentForm(cardConfig);
    await this.takeScreenshot('payment-filled');

    return this.purchaseTester.createPurchaseRequest(this.config.baseUrl);
  }

  async confirmPurchase(purchaseId, confirmed) {
    if (!this.purchaseTester) return null;

    const result = await this.purchaseTester.confirmPurchase(purchaseId, confirmed);

    if (confirmed && result) {
      await this.takeScreenshot(`purchase-${result.status}`);
    }

    // Update results
    const purchaseIndex = this.results.purchases.findIndex(p => p.id === purchaseId);
    if (purchaseIndex >= 0) {
      this.results.purchases[purchaseIndex] = result;
    }

    return result;
  }
}

module.exports = WebsiteCrawler;
