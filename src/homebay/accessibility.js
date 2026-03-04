const { AccessibilityAgent } = require('../agent/accessibility');
const { pool } = require('./pool');
const { getHomeBayConfig } = require('./config');
const { fillReactInput, navigateTo, waitForHydration } = require('./navigate');
const fs = require('fs');
const path = require('path');

const ROLE_LABELS = {
  admin: 'Admin',
  agent: 'Agent',
  seller: 'Seller',
  buyer: 'Buyer'
};

/**
 * Load accessibility audit configuration
 * @returns {Object} Parsed config from config/homebay-a11y.json
 */
function loadA11yConfig() {
  const configPath = path.join(__dirname, '../../config/homebay-a11y.json');
  if (!fs.existsSync(configPath)) {
    throw new Error(`Accessibility config not found at ${configPath}`);
  }
  return JSON.parse(fs.readFileSync(configPath, 'utf8'));
}

/**
 * Perform login as specified role (inline auth to avoid nested pool acquisition)
 * @private
 * @param {Object} page - Puppeteer page instance
 * @param {string} role - Role to login as (admin, agent, seller, buyer)
 * @param {Object} config - HomeBay config with baseUrl and accounts
 */
async function _performLogin(page, role, config) {
  const account = config.accounts[role];
  if (!account) {
    throw new Error(`No credentials found for role: ${role}`);
  }

  // Navigate to login page
  await navigateTo(page, config.baseUrl + '/login');

  // Wait for hydration (HomeBay shows .animate-pulse while auth store loads)
  await waitForHydration(page);

  // Fill login form with React-compatible input handling
  await fillReactInput(page, 'input#email', account.username);
  await fillReactInput(page, 'input#password', account.password);

  // Submit form
  await page.click('button[type="submit"]');

  // Wait for navigation (role-agnostic selector for dashboard/auction list)
  await page.waitForSelector('.dashboard, .auction-list', { timeout: 10000 });

  // Handle role selector modal if multi-role account
  const modalVisible = await page.$('.role-selector-modal');
  if (modalVisible) {
    await page.click(`button[data-role="${role}"]`);
    await page.waitForSelector('.dashboard, .auction-list', { timeout: 5000 });
  }

  console.log(`[HomeBay Accessibility] Successfully authenticated as ${role}`);
}

/**
 * Audit HomeBay accessibility for a specific role
 * Logs in as the role, audits configured critical pages, returns violations grouped by severity
 *
 * @param {string} role - Role to audit as (admin, agent, seller, buyer)
 * @returns {Promise<Object>} Audit results with violations, incomplete, passes, and summary
 */
async function auditHomeBayRole(role) {
  const a11yConfig = loadA11yConfig();
  const homebayConfig = getHomeBayConfig();
  const roleConfig = a11yConfig.roles[role];

  if (!roleConfig) {
    throw new Error(`No accessibility config for role: ${role}`);
  }

  return await pool.withSlot(async (slot) => {
    const { page } = slot;

    // CRITICAL: Bypass CSP before any navigation (HomeBay has strict CSP headers)
    await page.setBypassCSP(true);

    // Authenticate as role (inline, not imported from auth.js)
    await _performLogin(page, role, homebayConfig);

    // Create AccessibilityAgent with role-specific exclusions
    const agent = new AccessibilityAgent({
      tags: roleConfig.tags || ['wcag2a', 'wcag2aa'],
      excludeSelectors: roleConfig.globalExclude || []
    });

    const results = [];

    for (const pageConfig of roleConfig.criticalPages) {
      const fullUrl = `${homebayConfig.baseUrl}${pageConfig.path}`;

      // Merge page-specific exclusions with global
      const pageExclusions = [
        ...(roleConfig.globalExclude || []),
        ...(pageConfig.excludeSelectors || [])
      ];

      // Create page-specific agent if exclusions differ
      const pageAgent = pageExclusions.length > (roleConfig.globalExclude?.length || 0)
        ? new AccessibilityAgent({
            tags: roleConfig.tags || ['wcag2a', 'wcag2aa'],
            excludeSelectors: pageExclusions
          })
        : agent;

      console.log(`[HomeBay Accessibility] Auditing ${pageConfig.name} (${pageConfig.path}) as ${role}`);

      const result = await pageAgent.auditPage(page, fullUrl, pageConfig.name);

      results.push({
        id: pageConfig.id,
        name: pageConfig.name,
        path: pageConfig.path,
        violations: result.violations,
        violationsBySeverity: result.violationsBySeverity,
        incomplete: result.incomplete,
        passes: result.passes,
        inapplicable: result.inapplicable,
        summary: {
          critical: result.violationsBySeverity.critical.length,
          serious: result.violationsBySeverity.serious.length,
          moderate: result.violationsBySeverity.moderate.length,
          minor: result.violationsBySeverity.minor.length,
          needsReview: result.incomplete.length
        }
      });

      console.log(
        `[HomeBay Accessibility] ${pageConfig.name}: ` +
        `${result.violations.length} violations, ` +
        `${result.incomplete.length} need review, ` +
        `${result.passes.length} passed`
      );
    }

    return { role, results };
  });
}

module.exports = { auditHomeBayRole };
