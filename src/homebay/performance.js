'use strict';

const { pool } = require('./pool');
const { getHomeBayConfig } = require('./config');
const { fillReactInput, navigateTo, waitForHydration } = require('./navigate');
const fs = require('fs');
const path = require('path');

/**
 * Role label mapping for the HomeBay multi-role selector modal.
 */
const ROLE_LABELS = {
  admin: 'Admin Dashboard',
  agent: 'Agent/Seller Dashboard',
  buyer: 'Bidder Account',
  seller: 'Agent/Seller Dashboard',
};

/**
 * Load per-role critical page definitions from config/homebay-perf.json
 */
function loadPerformanceConfig() {
  const configPath = path.join(__dirname, '../../config/homebay-perf.json');
  if (!fs.existsSync(configPath)) {
    throw new Error('Performance config not found: config/homebay-perf.json');
  }
  return JSON.parse(fs.readFileSync(configPath, 'utf8'));
}

/**
 * Perform login on an existing page (inlined from auth.js to avoid nested pool acquisition).
 * @private
 */
async function _performLogin(page, role, config) {
  const account = config.accounts && config.accounts[role];
  if (!account) {
    throw new Error(`No credentials configured for role: ${role}`);
  }

  // Navigate to login page and wait for email input
  await navigateTo(page, `${config.baseUrl}/login`, 'input#email');

  // Wait for skeleton loader to disappear (auth store hydration)
  await waitForHydration(page);

  // Wait for real (non-disabled) input
  await page.waitForSelector('input#email:not([disabled])', { timeout: 15000 });

  // Fill credentials using native setter + event dispatch
  await fillReactInput(page, 'input#email', account.username);
  await fillReactInput(page, 'input#password', account.password);

  // Wait for submit button to become enabled
  await page.waitForFunction(
    () => !document.querySelector('button[type="submit"]').disabled,
    { timeout: 5000 }
  );

  // Submit the form
  await page.click('button[type="submit"]');

  // Wait for either: URL leaves /login OR role selector modal appears
  await page.waitForFunction(
    () => {
      const urlLeft = !window.location.pathname.startsWith('/login');
      const modalPresent = !!document.querySelector('h2, h3, [role="dialog"]') &&
        Array.from(document.querySelectorAll('h2, h3')).some(
          (el) => el.textContent.includes('Select Account Type')
        );
      return urlLeft || modalPresent;
    },
    { timeout: 15000 }
  );

  // Check if role selector modal appeared
  const modalVisible = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('h2, h3')).some(
      (el) => el.textContent.includes('Select Account Type')
    );
  });

  if (modalVisible) {
    const roleLabel = ROLE_LABELS[role];

    // Find and click the role button matching the label text
    const clicked = await page.evaluate((label) => {
      const buttons = Array.from(document.querySelectorAll('button'));
      const roleButton = buttons.find((btn) => {
        const labelEl = btn.querySelector('p.text-sm.font-medium');
        return labelEl && labelEl.textContent.trim() === label;
      });
      if (roleButton) {
        roleButton.click();
        return true;
      }
      return false;
    }, roleLabel);

    if (!clicked) {
      throw new Error(`Role selector button not found for role: ${role} (label: "${roleLabel}")`);
    }

    // Wait for URL to leave /login after role selection
    await page.waitForFunction(
      () => !window.location.pathname.startsWith('/login'),
      { timeout: 15000 }
    );
  }

  console.log(`[HomeBay Perf] Login successful as ${role}`);
}

/**
 * Audit HomeBay role's critical pages after authentication.
 *
 * Uses BrowserPool to acquire a slot, logs in as the specified role, then
 * audits each critical page defined in config/homebay-perf.json. Collects
 * Core Web Vitals (TTFB, FCP, LCP, CLS, INP) via injected PerformanceObservers.
 *
 * For pages marked expectInteraction: true, triggers a representative interaction
 * (first button click) before collecting INP, ensuring INP measurement is non-zero.
 *
 * @param {string} role - 'admin' | 'agent' | 'seller' | 'buyer'
 * @returns {Promise<{role, pages: Array<{name, path, metrics, scores}>}>}
 */
async function auditHomeBayRole(role) {
  const perfConfig = loadPerformanceConfig();
  const roleConfig = perfConfig.roles[role];

  if (!roleConfig) {
    throw new Error(`No performance config for role: ${role}`);
  }

  const homeBayConfig = getHomeBayConfig();
  const { baseUrl } = homeBayConfig;
  const criticalPages = roleConfig.criticalPages || [];

  if (criticalPages.length === 0) {
    return { role, pages: [] };
  }

  return await pool.withSlot(async (slot) => {
    const { page } = slot;

    // Authenticate as role (inlined from auth.js to reuse same page)
    console.log(`[HomeBay Perf] Logging in as ${role}...`);
    await _performLogin(page, role, homeBayConfig);

    const results = [];

    for (const pageConfig of criticalPages) {
      const { path: pagePath, name, expectInteraction } = pageConfig;
      const fullUrl = `${baseUrl}${pagePath}`;

      console.log(`[HomeBay Perf] Auditing: ${name} (${pagePath})`);

      // Create CDP session for performance tracking
      const client = await page.createCDPSession();
      await client.send('Performance.enable');

      // Inject PerformanceObservers BEFORE navigation (same as LighthouseAgent)
      await page.evaluateOnNewDocument(() => {
        window.__perf = { lcp: 0, cls: 0, fcp: 0, inp: 0 };

        // LCP observer
        new PerformanceObserver((list) => {
          const entries = list.getEntries();
          if (entries.length) window.__perf.lcp = entries[entries.length - 1].startTime;
        }).observe({ type: 'largest-contentful-paint', buffered: true });

        // CLS observer
        new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) {
            if (!entry.hadRecentInput) window.__perf.cls += entry.value;
          }
        }).observe({ type: 'layout-shift', buffered: true });

        // FCP observer
        new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) {
            if (entry.name === 'first-contentful-paint') {
              window.__perf.fcp = entry.startTime;
            }
          }
        }).observe({ type: 'paint', buffered: true });

        // INP observer (from Plan 01)
        new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) {
            if (entry.interactionId && entry.duration > window.__perf.inp) {
              window.__perf.inp = entry.duration;
            }
          }
        }).observe({ type: 'event', buffered: true, durationThreshold: 40 });
      });

      // Navigate to target page (already authenticated)
      await page.goto(fullUrl, { waitUntil: 'networkidle2', timeout: 60000 });

      // Trigger interaction if expected (for INP measurement)
      if (expectInteraction) {
        try {
          await page.waitForSelector('button', { timeout: 5000 });
          await page.click('button:first-of-type');
          await page.waitForTimeout(500); // Let INP settle
        } catch (err) {
          console.warn(`[HomeBay Perf] Could not trigger interaction on ${name}: ${err.message}`);
        }
      }

      // Allow observers to finalize (same as LighthouseAgent)
      await page.waitForTimeout(2000);

      // Collect metrics from page context
      const perfData = await page.evaluate(() => window.__perf);

      // Collect Navigation Timing
      const timing = await page.evaluate(() => {
        const nav = performance.getEntriesByType('navigation')[0] || {};
        return {
          ttfb: nav.responseStart || 0,
          domInteractive: nav.domInteractive || 0,
          domComplete: nav.domContentLoadedEventEnd || 0,
          loadTime: nav.loadEventEnd || 0,
        };
      });

      // Collect CDP metrics
      const cdpMetrics = await client.send('Performance.getMetrics');
      const cdpMap = {};
      for (const m of cdpMetrics.metrics) {
        cdpMap[m.name] = m.value;
      }

      const metrics = {
        ttfb: Math.round(timing.ttfb),
        fcp: Math.round(perfData.fcp || 0),
        lcp: Math.round(perfData.lcp || 0),
        cls: parseFloat((perfData.cls || 0).toFixed(4)),
        inp: Math.round(perfData.inp || 0),
        domInteractive: Math.round(timing.domInteractive),
        domComplete: Math.round(timing.domComplete),
        loadTime: Math.round(timing.loadTime),
        jsHeapSize: Math.round((cdpMap['JSHeapUsedSize'] || 0) / 1024),
        domNodes: cdpMap['Nodes'] || 0,
      };

      // Score using 2026 thresholds
      const scores = scoreMetrics(metrics);

      results.push({ name, path: pagePath, url: fullUrl, metrics, scores });

      await client.detach();
    }

    console.log(`[HomeBay Perf] Completed ${results.length} page(s) for role ${role}`);
    return { role, pages: results };
  });
}

/**
 * Score Core Web Vitals using 2026 thresholds.
 * Mirrors LighthouseAgent._scoreMetrics() logic.
 */
function scoreMetrics(m) {
  const score = (value, goodThreshold, poorThreshold) => {
    if (value <= goodThreshold) return 'good';
    if (value <= poorThreshold) return 'needs-improvement';
    return 'poor';
  };

  return {
    lcp: score(m.lcp, 2500, 4000),
    cls: score(m.cls, 0.1, 0.25),
    ttfb: score(m.ttfb, 800, 1800),
    fcp: score(m.fcp, 1800, 3000),
    inp: score(m.inp, 200, 500),
  };
}

module.exports = { auditHomeBayRole };
