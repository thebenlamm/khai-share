'use strict';

const { pool } = require('./pool');
const { getHomeBayConfig } = require('./config');
const { fillReactInput, navigateTo, waitForHydration } = require('./navigate');
const VisualRegression = require('../agent/visualRegression');
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
 * Screenshots base directory
 */
const SCREENSHOTS_DIR = path.join(__dirname, '../../screenshots');

/**
 * Load per-role critical page definitions from config/homebay-visual.json
 */
function loadVisualConfig() {
  const configPath = path.join(__dirname, '../../config/homebay-visual.json');
  if (!fs.existsSync(configPath)) {
    throw new Error('Visual config not found: config/homebay-visual.json');
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

  console.log(`[HomeBay Visual] Login successful as ${role}`);
}

/**
 * Capture screenshots of critical pages for a specific HomeBay role.
 *
 * Uses BrowserPool to acquire a slot, logs in as the specified role, then
 * captures full-page screenshots of each critical page defined in
 * config/homebay-visual.json. Masks dynamic content (timestamps, avatars, etc.)
 * before capture to ensure stable visual comparisons.
 *
 * @param {string} role - 'admin' | 'agent' | 'seller' | 'buyer'
 * @returns {Promise<{role, screenshots: Array<{name, path, screenshotPath}>}>}
 */
async function captureHomeBayRole(role) {
  const visualConfig = loadVisualConfig();
  const roleConfig = visualConfig.roles[role];
  if (!roleConfig) throw new Error(`No visual config for role: ${role}`);

  const homeBayConfig = getHomeBayConfig();
  const { baseUrl } = homeBayConfig;
  const criticalPages = roleConfig.criticalPages || [];
  if (criticalPages.length === 0) return { role, screenshots: [] };

  return await pool.withSlot(async (slot) => {
    const { page } = slot;

    // Authenticate as role (inline, not imported)
    console.log(`[HomeBay Visual] Logging in as ${role}...`);
    await _performLogin(page, role, homeBayConfig);

    const screenshots = [];

    for (const pageConfig of criticalPages) {
      const { path: pagePath, name, waitForSelector, maskSelectors } = pageConfig;
      const fullUrl = `${baseUrl}${pagePath}`;

      console.log(`[HomeBay Visual] Capturing: ${name} (${pagePath})`);

      // Navigate to target page
      await page.goto(fullUrl, { waitUntil: 'networkidle2', timeout: 60000 });

      // Wait for specific element if configured
      if (waitForSelector) {
        await page.waitForSelector(waitForSelector, { timeout: 10000 });
      }

      // Disable animations to prevent mid-transition captures
      await page.addStyleTag({
        content: '* { animation-duration: 0s !important; transition-duration: 0s !important; }'
      });

      // Hide dynamic content (timestamps, avatars, badges)
      if (maskSelectors && maskSelectors.length > 0) {
        await page.evaluate((selectors) => {
          selectors.forEach(sel => {
            document.querySelectorAll(sel).forEach(el => {
              el.style.visibility = 'hidden'; // Not display:none - preserves layout
            });
          });
        }, maskSelectors);
      }

      // Wait for any remaining animations/content to settle
      await page.waitForTimeout(1000);

      // Capture full-page screenshot
      const screenshotPath = path.join(
        SCREENSHOTS_DIR,
        'homebay-current',
        role,
        `${pageConfig.id || name.toLowerCase().replace(/\s+/g, '-')}.png`
      );
      fs.mkdirSync(path.dirname(screenshotPath), { recursive: true });
      await page.screenshot({ path: screenshotPath, fullPage: true });

      screenshots.push({ name, path: pagePath, screenshotPath });
    }

    console.log(`[HomeBay Visual] Captured ${screenshots.length} screenshot(s) for role ${role}`);
    return { role, screenshots };
  });
}

/**
 * Compare current screenshots against baseline for a specific role.
 *
 * Uses the existing VisualRegression class to perform pixel-level comparison
 * of screenshots in homebay-current/{role}/ against homebay-baselines/{role}/.
 * Generates diff images highlighting changes in homebay-diffs/{role}/.
 *
 * @param {string} role - 'admin' | 'agent' | 'seller' | 'buyer'
 * @returns {Promise<{status, role?, totalCompared?, matched?, changed?, missing?, added?, diffs?, timestamp?}>}
 */
async function compareAgainstBaseline(role) {
  const baselineDir = path.join(SCREENSHOTS_DIR, 'homebay-baselines', role);
  const currentDir = path.join(SCREENSHOTS_DIR, 'homebay-current', role);
  const diffDir = path.join(SCREENSHOTS_DIR, 'homebay-diffs', role);

  // Check if baseline exists
  if (!fs.existsSync(baselineDir)) {
    return {
      status: 'no-baseline',
      message: `No baseline found for role ${role}. Run setBaseline first.`,
    };
  }

  // Use existing VisualRegression class (already handles padding, diff generation)
  const vr = new VisualRegression({
    baselineDir,
    currentDir,
    diffDir,
    threshold: 0.1  // 10% tolerance for anti-aliasing
  });

  const report = await vr.compare();

  return {
    status: 'compared',
    role,
    totalCompared: report.totalCompared,
    matched: report.matched,
    changed: report.changed,
    missing: report.missing,
    added: report.added,
    diffs: report.diffs,
    timestamp: report.timestamp,
  };
}

module.exports = { captureHomeBayRole, compareAgainstBaseline };
