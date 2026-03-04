'use strict';

/**
 * HomeBay Animation Testing Orchestrator
 *
 * Coordinates browser pool, authentication, and animation capture for HomeBay
 * testing infrastructure. Tests skeleton transitions during login and captures
 * animations on configured pages.
 *
 * Usage:
 *   const { testHomeBayAnimations } = require('./homebay/animationTest');
 *   const results = await testHomeBayAnimations('buyer');
 *
 * Returns structured results with screenshot paths and animation metadata.
 */

const pool = require('./pool').pool;
const { getHomeBayConfig } = require('./config');
const { fillReactInput, navigateTo, waitForHydration } = require('./navigate');
const { captureSkeletonTransition, getHomeBayAnimations } = require('./animations');
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
 * Load animation test configuration from config/homebay-animations.json
 */
function loadAnimationConfig() {
  const configPath = path.join(__dirname, '../../config/homebay-animations.json');
  if (!fs.existsSync(configPath)) {
    throw new Error('Animation config not found: config/homebay-animations.json');
  }
  return JSON.parse(fs.readFileSync(configPath, 'utf8'));
}

/**
 * Perform login on an existing page (inlined from auth.js to avoid nested pool acquisition).
 * Pattern copied from src/homebay/performance.js lines 85-140.
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

  console.log(`[HomeBayAnimation] Login successful as ${role}`);
}

/**
 * Test HomeBay animations for a specific role.
 *
 * Acquires browser from pool, logs in as specified role, captures skeleton
 * transition during login, then navigates to configured pages and detects
 * active animations.
 *
 * @param {string} role - 'admin' | 'agent' | 'seller' | 'buyer'
 * @param {Object} options - Optional configuration
 * @param {string} options.outputDir - Base directory for screenshots (default: screenshots/animations)
 * @param {boolean} options.captureLogin - Whether to capture skeleton transition (default: true)
 * @param {Array} options.customPages - Override pages from config
 * @returns {Promise<{role, timestamp, login, pages}>}
 *
 * @example
 *   const results = await testHomeBayAnimations('buyer');
 *   // {
 *   //   role: 'buyer',
 *   //   timestamp: '2026-03-04T13:00:00Z',
 *   //   login: {
 *   //     skeletonStates: ['skeleton-visible', 'skeleton-fading', 'content-hydrated'],
 *   //     screenshots: ['path/to/skeleton-visible.png', ...]
 *   //   },
 *   //   pages: [
 *   //     { url: 'https://staging.homebay.com/auctions', animations: {...}, screenshots: [...] }
 *   //   ]
 *   // }
 */
async function testHomeBayAnimations(role, options = {}) {
  const animConfig = loadAnimationConfig();
  const homeBayConfig = getHomeBayConfig();

  // Validate role exists in config
  if (!animConfig.roles[role]) {
    throw new Error(`Role not found in animation config: ${role}`);
  }

  // Validate credentials
  const account = homeBayConfig.accounts && homeBayConfig.accounts[role];
  if (!account) {
    throw new Error('HomeBay credentials not configured');
  }

  const timestamp = new Date().toISOString();
  const outputRootDir = options.outputDir || animConfig.outputRoot || 'screenshots/animations';
  const outputDir = path.join(outputRootDir, `${role}-${timestamp.replace(/[:.]/g, '-')}`);

  const results = {
    role,
    timestamp,
    login: {
      skeletonStates: [],
      screenshots: [],
    },
    pages: [],
  };

  return await pool.withSlot(async (slot) => {
    const { page } = slot;

    try {
      // Navigate to login page first (before login to capture skeleton)
      console.log(`[HomeBayAnimation] Starting animation test for role: ${role}`);
      await navigateTo(page, `${homeBayConfig.baseUrl}/login`, 'input#email');

      // Capture skeleton transition during login (if enabled)
      const captureLogin = options.captureLogin !== undefined ? options.captureLogin : animConfig.captureLogin;
      if (captureLogin) {
        console.log(`[HomeBayAnimation] Capturing skeleton transition during login`);
        const loginOutputDir = path.join(outputDir, 'login');
        const skeletonStates = await captureSkeletonTransition(page, loginOutputDir);

        // Build screenshot paths
        const screenshots = skeletonStates.map(state =>
          path.join(loginOutputDir, `${state}.png`)
        );

        results.login.skeletonStates = skeletonStates;
        results.login.screenshots = screenshots;

        console.log(`[HomeBayAnimation] Captured ${skeletonStates.length} login states`);
      }

      // Now perform full login (skeleton already captured)
      console.log(`[HomeBayAnimation] Authenticating as ${role}`);
      // Navigate again to login page (previous navigation was used for skeleton capture)
      await navigateTo(page, `${homeBayConfig.baseUrl}/login`, 'input#email');
      await _performLogin(page, role, homeBayConfig);

      // Test configured pages
      const pagesToTest = options.customPages || animConfig.roles[role].pages || [];
      console.log(`[HomeBayAnimation] Testing ${pagesToTest.length} page(s)`);

      for (let i = 0; i < pagesToTest.length; i++) {
        const pageConfig = pagesToTest[i];
        const fullUrl = `${homeBayConfig.baseUrl}${pageConfig.path}`;

        console.log(`[HomeBayAnimation] Testing page: ${pageConfig.name} (${pageConfig.path})`);

        try {
          // Navigate to page
          await page.goto(fullUrl, { waitUntil: 'networkidle2', timeout: 30000 });

          // Wait a moment for animations to start
          await page.waitForTimeout(1000);

          // Detect active animations
          const animations = await getHomeBayAnimations(page);

          // Check if any animations detected
          const hasAnimations =
            animations.skeleton.length > 0 ||
            animations.countdown.length > 0 ||
            animations.modal.length > 0;

          const pageResult = {
            name: pageConfig.name,
            url: fullUrl,
            path: pageConfig.path,
            animations,
            screenshots: [],
          };

          // Take screenshot if animations detected
          if (hasAnimations) {
            const screenshotDir = path.join(outputDir, 'pages');
            fs.mkdirSync(screenshotDir, { recursive: true });

            const screenshotPath = path.join(screenshotDir, `${pageConfig.name.replace(/\s+/g, '-').toLowerCase()}-${i}.png`);
            await page.screenshot({ path: screenshotPath });
            pageResult.screenshots.push(screenshotPath);

            console.log(`[HomeBayAnimation] Captured animation on ${pageConfig.name}`);
          } else {
            console.log(`[HomeBayAnimation] No animations detected on ${pageConfig.name}`);
          }

          results.pages.push(pageResult);
        } catch (err) {
          console.error(`[HomeBayAnimation] Error testing page ${pageConfig.name}:`, err.message);
          results.pages.push({
            name: pageConfig.name,
            url: fullUrl,
            path: pageConfig.path,
            error: err.message,
            animations: { skeleton: [], countdown: [], modal: [] },
            screenshots: [],
          });
        }
      }

      console.log(`[HomeBayAnimation] Animation test complete for ${role}: ${results.pages.length} page(s) tested`);
      return results;
    } catch (error) {
      console.error(`[HomeBayAnimation] Test failed for ${role}:`, error.message);
      results.error = error.message;
      return results;
    }
  });
}

module.exports = { testHomeBayAnimations };
