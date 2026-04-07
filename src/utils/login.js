'use strict';

/**
 * Shared login utility for all Khai agents.
 *
 * Handles all 5 auth variants:
 *  1. Magic link   — accountConfig.magicLinkAuth is set
 *  2. Skip login   — accountConfig.skipLogin is true
 *  3. Twilio       — page lands on twilio.com after navigation
 *  4. Login trigger — accountConfig.loginTrigger button exists
 *  5. Standard     — email/password/submit with multi-selector fallbacks
 */

/**
 * Perform login using whatever auth variant the accountConfig specifies.
 *
 * @param {import('puppeteer').Page} page         - Puppeteer Page object
 * @param {string}                   baseUrl       - Site base URL, e.g. "https://example.com"
 * @param {object}                   accountConfig - Credential config from credentials.json
 *   @param {string}  accountConfig.loginUrl        - Login path, e.g. "/login"
 *   @param {string}  accountConfig.username        - Username / email
 *   @param {string}  accountConfig.password        - Password
 *   @param {string}  accountConfig.usernameField   - Comma-separated CSS selectors for email input
 *   @param {string}  accountConfig.passwordField   - Comma-separated CSS selectors for password input
 *   @param {string}  accountConfig.submitButton    - Comma-separated CSS selectors for submit button
 *   @param {string}  [accountConfig.magicLinkAuth] - URL to fetch magic link token from
 *   @param {boolean} [accountConfig.skipLogin]     - Skip auth entirely for public crawls
 *   @param {string}  [accountConfig.loginTrigger]  - Selector like "button:has-text('Admin Portal Login')"
 * @param {object}   [options]                     - Optional callbacks
 *   @param {function} [options.screenshotFn]       - screenshotFn(name) called for each screenshot
 *   @param {object}   [options.logger]             - Logger with .log() method; defaults to console
 *   @param {function} [options.addIssueFn]         - addIssueFn(type, message, url, severity) for crawlers
 *
 * @returns {Promise<{success: boolean, error?: string}>}
 */
async function performLogin(page, baseUrl, accountConfig, options = {}) {
  const { screenshotFn, logger, addIssueFn } = options;
  const log = (msg) => (logger?.log ? logger.log(msg) : console.log(`[Login] ${msg}`));
  const screenshot = async (name) => { if (screenshotFn) { try { await screenshotFn(name); } catch (_) {} } };

  const loginUrl = baseUrl + accountConfig.loginUrl;
  log(`Logging in at ${loginUrl}`);

  try {
    // ------------------------------------------------------------------ //
    // 1. Magic link auth
    // ------------------------------------------------------------------ //
    if (accountConfig.magicLinkAuth) {
      log(`Using magic link auth: ${accountConfig.magicLinkAuth}`);
      const fetch = (await import('node-fetch')).default;
      const resp = await fetch(accountConfig.magicLinkAuth);
      const data = await resp.json();

      if (!data.loginUrl) {
        throw new Error('Magic link API did not return loginUrl');
      }

      log('Got magic link, navigating...');
      await page.goto(data.loginUrl, { waitUntil: 'networkidle2', timeout: 30000 });
      await new Promise(resolve => setTimeout(resolve, 4000));
      await screenshot('magic-link-login');

      const currentUrl = page.url();
      log(`After magic link URL: ${currentUrl}`);

      if (currentUrl.includes('/login') && !currentUrl.includes('token')) {
        addIssueFn?.('login-failed', 'Magic link login may have failed - still on login page', loginUrl, 'error');
        return { success: false, error: 'Magic link login failed' };
      }

      log('Magic link login successful!');
      return { success: true };
    }

    // ------------------------------------------------------------------ //
    // 2. Skip login (public / unauthenticated crawl)
    // ------------------------------------------------------------------ //
    if (accountConfig.skipLogin) {
      log('Skipping login (public crawl)');
      await page.goto(baseUrl, { waitUntil: 'networkidle2', timeout: 30000 });
      await new Promise(resolve => setTimeout(resolve, 2000));
      await screenshot('public-start');
      return { success: true };
    }

    // ------------------------------------------------------------------ //
    // 3. Standard / Twilio / Trigger flow
    // ------------------------------------------------------------------ //
    await page.goto(loginUrl, { waitUntil: 'networkidle2', timeout: 30000 });

    // Wait extra time for SPA hydration
    await new Promise(resolve => setTimeout(resolve, 3000));
    await screenshot('login-page');

    // Twilio two-step detection
    if (page.url().includes('twilio.com')) {
      log('Detected Twilio two-step login');
      return await _loginTwilio(page, accountConfig, options);
    }

    // Handle loginTrigger if present (e.g., "Admin Portal Login" button)
    if (accountConfig.loginTrigger) {
      log(`Looking for login trigger: ${accountConfig.loginTrigger}`);
      try {
        const triggerClicked = await page.evaluate((triggerText) => {
          // Extract text from selector like "button:has-text('Admin')"
          const textMatch = triggerText.match(/has-text\(['"](.+?)['"]\)/);
          if (textMatch) {
            const searchText = textMatch[1].toLowerCase();
            const buttons = Array.from(document.querySelectorAll('button, a'));
            const trigger = buttons.find(b => b.textContent.toLowerCase().includes(searchText));
            if (trigger) {
              trigger.click();
              return true;
            }
          }
          return false;
        }, accountConfig.loginTrigger);

        if (triggerClicked) {
          log('Clicked login trigger');
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
      } catch (e) {
        log(`Login trigger error: ${e.message}`);
      }
    }

    // Fill email/username — try each selector with a 5 s timeout, then fallback
    const emailSelectors = accountConfig.usernameField.split(',').map(s => s.trim());
    let emailInput = null;

    for (const selector of emailSelectors) {
      try {
        await page.waitForSelector(selector, { timeout: 5000 });
        emailInput = selector;
        log(`Found email input: ${selector}`);
        break;
      } catch (e) {
        continue;
      }
    }

    if (!emailInput) {
      // Fallback: find any visible email or text input
      emailInput = await page.evaluate(() => {
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

    await page.type(emailInput, accountConfig.username, { delay: 50 });

    // Fill password — try each selector with a 3 s timeout, then fallback
    const passwordSelectors = accountConfig.passwordField.split(',').map(s => s.trim());
    let passwordInput = null;

    for (const selector of passwordSelectors) {
      try {
        await page.waitForSelector(selector, { timeout: 3000 });
        passwordInput = selector;
        log(`Found password input: ${selector}`);
        break;
      } catch (e) {
        continue;
      }
    }

    if (!passwordInput) {
      passwordInput = 'input[type="password"]';
    }

    await page.type(passwordInput, accountConfig.password, { delay: 50 });

    // Click submit — try each selector, fallback to Enter key
    const submitSelectors = accountConfig.submitButton.split(',').map(s => s.trim());
    let clicked = false;

    for (const selector of submitSelectors) {
      try {
        const btn = await page.$(selector);
        if (btn) {
          await Promise.all([
            btn.click(),
            page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 }).catch(() => {})
          ]);
          clicked = true;
          break;
        }
      } catch (e) {
        continue;
      }
    }

    if (!clicked) {
      await page.keyboard.press('Enter');
      await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 }).catch(() => {});
    }

    await new Promise(resolve => setTimeout(resolve, 2000));
    await screenshot('after-login');

    // Verify we are no longer on the login page
    const currentUrl = page.url();
    log(`After login URL: ${currentUrl}`);

    if (currentUrl.includes('/login') && !currentUrl.includes('callback')) {
      addIssueFn?.('login-failed', 'Login may have failed - still on login page', loginUrl, 'error');
      return { success: false, error: 'Still on login page after submit' };
    }

    log('Login successful!');
    return { success: true };

  } catch (err) {
    await screenshot('login-error');
    return { success: false, error: err.message };
  }
}

/**
 * Twilio two-step login handler (extracted from actions.js loginTwilio method).
 *
 * @param {import('puppeteer').Page} page
 * @param {object}                   accountConfig
 * @param {object}                   options
 * @returns {Promise<{success: boolean, error?: string}>}
 */
async function _loginTwilio(page, accountConfig, options = {}) {
  const { screenshotFn, logger } = options;
  const log = (msg) => (logger?.log ? logger.log(msg) : console.log(`[Login] ${msg}`));
  const screenshot = async (name) => { if (screenshotFn) { try { await screenshotFn(name); } catch (_) {} } };

  log('Starting Twilio login flow');
  await screenshot('twilio-before-login');

  // Step 1: Enter email
  try {
    await page.waitForSelector('input', { timeout: 15000 });
    await new Promise(resolve => setTimeout(resolve, 2000));

    const emailInput = await page.evaluateHandle(() => {
      let input = document.querySelector('input[placeholder*="Email"]');
      if (!input) input = document.querySelector('input[type="email"]');
      if (!input) input = document.querySelector('input[name="email"]');
      if (!input) input = document.querySelector('input[autocomplete="email"]');
      if (!input) {
        const inputs = document.querySelectorAll('input:not([type="hidden"])');
        input = inputs[0];
      }
      return input;
    });

    if (emailInput) {
      await emailInput.click();
      await emailInput.type(accountConfig.username, { delay: 50 });
      const masked = (accountConfig.username || '').replace(/(.{2}).*(@.*)/, '$1***$2');
      log(`Entered email: ${masked}`);
    } else {
      log('Could not find email input');
      return { success: false, error: 'Twilio: could not find email input' };
    }
  } catch (e) {
    log(`Email input error: ${e.message}`);
    await screenshot('twilio-email-error');
    return { success: false, error: `Twilio email step: ${e.message}` };
  }

  await screenshot('twilio-email-entered');

  // Click Continue / Next
  try {
    const continueClicked = await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      const continueBtn = buttons.find(b =>
        b.textContent.toLowerCase().includes('continue') ||
        b.textContent.toLowerCase().includes('next')
      );
      if (continueBtn) {
        continueBtn.click();
        return true;
      }
      return false;
    });

    if (continueClicked) {
      log('Clicked Continue');
      await new Promise(resolve => setTimeout(resolve, 3000));
    }
  } catch (e) {
    log(`Continue button error: ${e.message}`);
  }

  await screenshot('twilio-after-email');

  // Step 2: Enter password
  try {
    await page.waitForSelector('input[type="password"]', { timeout: 10000 });
    const passwordInput = await page.$('input[type="password"]');
    if (passwordInput) {
      await passwordInput.click();
      await passwordInput.type(accountConfig.password, { delay: 50 });
      log('Entered password');
    }
  } catch (e) {
    log(`Password input error: ${e.message}`);
    return { success: false, error: `Twilio password step: ${e.message}` };
  }

  await screenshot('twilio-password-entered');

  // Click Login / Sign In / Continue
  try {
    const loginClicked = await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      const loginBtn = buttons.find(b =>
        b.textContent.toLowerCase().includes('log in') ||
        b.textContent.toLowerCase().includes('login') ||
        b.textContent.toLowerCase().includes('sign in') ||
        b.textContent.toLowerCase().includes('continue')
      );
      if (loginBtn) {
        loginBtn.click();
        return true;
      }
      return false;
    });

    if (loginClicked) {
      log('Clicked Login');
      await new Promise(resolve => setTimeout(resolve, 5000));
    }
  } catch (e) {
    log(`Login button error: ${e.message}`);
  }

  await screenshot('twilio-login-complete');
  log(`Twilio login complete, URL: ${page.url()}`);

  return { success: true };
}

module.exports = { performLogin };
