'use strict';

const express = require('express');
const router = express.Router();

const {
  loginHomeBay,
  registerHomeBay,
  forgotPasswordHomeBay,
  resetPasswordHomeBay,
} = require('../homebay/auth');
const { getHomeBayConfig, checkHomeBayHealth } = require('../homebay/config');
const { auditHomeBayRole } = require('../homebay/performance');
const { captureHomeBayRole, compareAgainstBaseline } = require('../homebay/visual');
const { ok, fail, errorHandler } = require('../utils/response');

const ALLOWED_ROLES = ['admin', 'agent', 'seller', 'buyer'];

/**
 * POST /api/homebay/login
 * Login to HomeBay as a specific role.
 *
 * Body: { role: "admin"|"agent"|"seller"|"buyer" }
 */
router.post('/login', async (req, res) => {
  const { role } = req.body;

  if (!role || !ALLOWED_ROLES.includes(role)) {
    return res.status(400).json(
      fail(`Invalid role. Must be one of: ${ALLOWED_ROLES.join(', ')}`)
    );
  }

  try {
    const result = await loginHomeBay(role);
    res.json(ok(result));
  } catch (err) {
    errorHandler(res, err, 'homebay/login');
  }
});

/**
 * POST /api/homebay/login/all
 * Login as all 4 HomeBay roles sequentially.
 * Runs a health check first — returns early if staging is unreachable.
 *
 * Body: none
 */
router.post('/login/all', async (req, res) => {
  try {
    const config = getHomeBayConfig();

    // Health check once before launching browsers — per user decision:
    // "Health check once at the start of a test run, not per-navigation"
    const health = await checkHomeBayHealth(config.baseUrl);
    if (!health.reachable) {
      return res.status(503).json(
        fail(`HomeBay staging is unreachable: ${health.error}`)
      );
    }

    // Login all 4 roles sequentially
    const results = [];
    for (const role of ALLOWED_ROLES) {
      const result = await loginHomeBay(role);
      results.push(result);
    }

    const successCount = results.filter((r) => r.success).length;

    res.json(ok({
      results,
      summary: {
        total: ALLOWED_ROLES.length,
        succeeded: successCount,
        failed: ALLOWED_ROLES.length - successCount,
        health,
      },
    }));
  } catch (err) {
    errorHandler(res, err, 'homebay/login/all');
  }
});

/**
 * POST /api/homebay/register
 * Register a new buyer account on HomeBay.
 *
 * Body: { email, password, dateOfBirth?, firstName?, lastName?, phone? }
 */
router.post('/register', async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json(fail('email and password are required'));
  }

  try {
    const result = await registerHomeBay(req.body);
    res.json(ok(result));
  } catch (err) {
    errorHandler(res, err, 'homebay/register');
  }
});

/**
 * POST /api/homebay/forgot-password
 * Submit the forgot-password form on HomeBay.
 *
 * Body: { email }
 */
router.post('/forgot-password', async (req, res) => {
  const { email } = req.body;

  if (!email) {
    return res.status(400).json(fail('email is required'));
  }

  try {
    const result = await forgotPasswordHomeBay(email);
    res.json(ok(result));
  } catch (err) {
    errorHandler(res, err, 'homebay/forgot-password');
  }
});

/**
 * POST /api/homebay/reset-password
 * Submit the reset-password form with a token from the reset email.
 *
 * Body: { token, newPassword }
 */
router.post('/reset-password', async (req, res) => {
  const { token, newPassword } = req.body;

  if (!token || !newPassword) {
    return res.status(400).json(fail('token and newPassword are required'));
  }

  try {
    const result = await resetPasswordHomeBay(token, newPassword);
    res.json(ok(result));
  } catch (err) {
    errorHandler(res, err, 'homebay/reset-password');
  }
});

/**
 * GET /api/homebay/health
 * Check whether HomeBay staging is reachable.
 */
router.get('/health', async (req, res) => {
  try {
    const config = getHomeBayConfig();
    const health = await checkHomeBayHealth(config.baseUrl);
    res.json(ok(health));
  } catch (err) {
    errorHandler(res, err, 'homebay/health');
  }
});

/**
 * GET /api/homebay/config
 * Show configured HomeBay roles — NO passwords.
 */
router.get('/config', (req, res) => {
  try {
    const config = getHomeBayConfig();
    const accountsConfigured = {};

    for (const role of ALLOWED_ROLES) {
      const account = config.accounts && config.accounts[role];
      accountsConfigured[role] = !!(account && account.username && account.password);
    }

    res.json(ok({
      baseUrl: config.baseUrl,
      roles: ALLOWED_ROLES,
      accountsConfigured,
    }));
  } catch (err) {
    // credentials.json may not exist yet — return helpful message rather than 500
    res.json(ok({
      baseUrl: null,
      roles: ALLOWED_ROLES,
      accountsConfigured: null,
      warning: err.message,
    }));
  }
});

/**
 * POST /api/homebay/perf/:role
 * Run performance audit for the specified role's critical pages.
 *
 * Body: {} (no parameters needed)
 * Returns: { role, pages: [{ name, path, url, metrics, scores }] }
 */
router.post('/perf/:role', async (req, res) => {
  const { role } = req.params;

  if (!ALLOWED_ROLES.includes(role)) {
    return res.status(400).json(
      fail(`Invalid role. Must be one of: ${ALLOWED_ROLES.join(', ')}`)
    );
  }

  try {
    console.log(`[API] Starting performance audit for role: ${role}`);
    const result = await auditHomeBayRole(role);
    console.log(`[API] Performance audit complete. ${result.pages.length} page(s) audited.`);
    res.json(ok(result));
  } catch (err) {
    console.error(`[API] Performance audit failed for ${role}:`, err);
    errorHandler(res, err, 'homebay/perf');
  }
});

/**
 * POST /api/homebay/visual/:role
 * Capture screenshots of critical pages for specified role after authentication.
 * Returns: { role, screenshots: [{ name, path, screenshotPath }] }
 */
router.post('/visual/:role', async (req, res) => {
  const { role } = req.params;
  const validRoles = ['admin', 'agent', 'seller', 'buyer'];

  if (!validRoles.includes(role)) {
    return res.status(400).json(fail(`Invalid role: ${role}. Must be one of: ${validRoles.join(', ')}`));
  }

  try {
    console.log(`[HomeBay Visual] Starting screenshot capture for role: ${role}`);
    const result = await captureHomeBayRole(role);
    console.log(`[HomeBay Visual] Capture complete: ${result.screenshots.length} screenshot(s)`);
    res.json(ok(result));
  } catch (err) {
    console.error(`[HomeBay Visual] Capture failed for ${role}:`, err);
    res.status(500).json(fail(err.message));
  }
});

/**
 * POST /api/homebay/visual/:role/compare
 * Compare current screenshots against baseline for specified role.
 * Returns: { status, role, totalCompared, matched, changed, missing, added, diffs, timestamp }
 */
router.post('/visual/:role/compare', async (req, res) => {
  const { role } = req.params;
  const validRoles = ['admin', 'agent', 'seller', 'buyer'];

  if (!validRoles.includes(role)) {
    return res.status(400).json(fail(`Invalid role: ${role}. Must be one of: ${validRoles.join(', ')}`));
  }

  try {
    console.log(`[HomeBay Visual] Starting comparison for role: ${role}`);
    const result = await compareAgainstBaseline(role);

    if (result.status === 'no-baseline') {
      console.log(`[HomeBay Visual] No baseline found for ${role}`);
      return res.status(404).json(fail(result.message));
    }

    console.log(`[HomeBay Visual] Comparison complete: ${result.changed} changed, ${result.matched} matched`);
    res.json(ok(result));
  } catch (err) {
    console.error(`[HomeBay Visual] Comparison failed for ${role}:`, err);
    res.status(500).json(fail(err.message));
  }
});

/**
 * POST /api/homebay/visual/:role/set-baseline
 * Copy current screenshots to baseline directory for specified role.
 * Returns: { message, files }
 */
router.post('/visual/:role/set-baseline', async (req, res) => {
  const { role } = req.params;
  const validRoles = ['admin', 'agent', 'seller', 'buyer'];

  if (!validRoles.includes(role)) {
    return res.status(400).json(fail(`Invalid role: ${role}. Must be one of: ${validRoles.join(', ')}`));
  }

  const fs = require('fs');
  const path = require('path');
  const SCREENSHOTS_DIR = path.join(__dirname, '../../screenshots');
  const currentDir = path.join(SCREENSHOTS_DIR, 'homebay-current', role);
  const baselineDir = path.join(SCREENSHOTS_DIR, 'homebay-baselines', role);

  try {
    if (!fs.existsSync(currentDir)) {
      return res.status(400).json(fail(`No current screenshots found for role ${role}. Run capture first.`));
    }

    // Create baseline directory
    fs.mkdirSync(baselineDir, { recursive: true });

    // Copy all PNG files from current to baseline
    const files = fs.readdirSync(currentDir).filter(f => f.endsWith('.png'));

    if (files.length === 0) {
      return res.status(400).json(fail(`No PNG files found in current directory for role ${role}.`));
    }

    for (const file of files) {
      fs.copyFileSync(
        path.join(currentDir, file),
        path.join(baselineDir, file)
      );
    }

    console.log(`[HomeBay Visual] Baseline set for ${role}: ${files.length} file(s)`);
    res.json(ok({ message: `Baseline set for role ${role}`, files: files.length }));
  } catch (err) {
    console.error(`[HomeBay Visual] Set baseline failed for ${role}:`, err);
    res.status(500).json(fail(err.message));
  }
});

/**
 * GET /api/homebay/visual/:role/baseline
 * List baseline screenshots for specified role.
 * Returns: { exists, files, count }
 */
router.get('/visual/:role/baseline', (req, res) => {
  const { role } = req.params;
  const validRoles = ['admin', 'agent', 'seller', 'buyer'];

  if (!validRoles.includes(role)) {
    return res.status(400).json(fail(`Invalid role: ${role}. Must be one of: ${validRoles.join(', ')}`));
  }

  const fs = require('fs');
  const path = require('path');
  const SCREENSHOTS_DIR = path.join(__dirname, '../../screenshots');
  const baselineDir = path.join(SCREENSHOTS_DIR, 'homebay-baselines', role);

  try {
    if (!fs.existsSync(baselineDir)) {
      return res.json(ok({ exists: false, files: [], count: 0 }));
    }

    const files = fs.readdirSync(baselineDir).filter(f => f.endsWith('.png'));
    res.json(ok({ exists: true, files, count: files.length }));
  } catch (err) {
    console.error(`[HomeBay Visual] List baseline failed for ${role}:`, err);
    res.status(500).json(fail(err.message));
  }
});

/**
 * POST /api/homebay/dryrun/:form
 * Run dry-run form validation tests for the specified form.
 * Tests form validation without submitting to the server (no database writes).
 *
 * Params: form - Form name from config/homebay-dryrun.json (e.g., "register", "login")
 * Body: {} (no parameters needed - uses test cases from config)
 * Returns: { form, totalTests, passed, failed, results[] }
 */
router.post('/dryrun/:form', async (req, res) => {
  const fs = require('fs');
  const path = require('path');
  const { DryRunTester } = require('../homebay/dryrun');

  try {
    // Load dry-run test configuration
    const configPath = path.join(__dirname, '../../config/homebay-dryrun.json');
    if (!fs.existsSync(configPath)) {
      return res.status(404).json(fail('Dry-run config not found: config/homebay-dryrun.json'));
    }

    const dryrunConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    const formName = req.params.form;
    const formConfig = dryrunConfig[formName];

    if (!formConfig) {
      return res.status(404).json(fail(`Form '${formName}' not found in dry-run config. Available forms: ${Object.keys(dryrunConfig).join(', ')}`));
    }

    // Authenticate if required
    if (formConfig.role) {
      console.log(`[Khai] Dry-run test for ${formName} requires auth as ${formConfig.role}`);
      const authResult = await loginHomeBay(formConfig.role);
      if (!authResult.success) {
        return res.status(400).json(fail(`Auth failed: ${authResult.error}`));
      }
    }

    // Run all test cases for this form
    console.log(`[Khai] Running ${formConfig.tests.length} dry-run test(s) for form: ${formName}`);
    const config = getHomeBayConfig();
    const results = [];

    for (const test of formConfig.tests) {
      console.log(`[Khai] Running test: ${test.name}`);
      const tester = new DryRunTester({ baseUrl: config.baseUrl });
      const result = await tester.testFormValidation(
        formConfig.role,
        formConfig.url,
        test.formData,
        test.expectedErrors
      );
      results.push({
        name: test.name,
        passed: result.passed,
        html5Valid: result.html5Valid,
        reactErrors: result.reactErrors,
        foundErrors: result.foundErrors,
        expectedErrors: test.expectedErrors,
        interceptedRequests: result.interceptedRequests
      });
    }

    // Calculate summary
    const passCount = results.filter(r => r.passed).length;
    const failCount = results.length - passCount;

    console.log(`[Khai] Dry-run tests complete: ${passCount}/${results.length} passed`);

    return res.json(ok({
      form: formName,
      totalTests: results.length,
      passed: passCount,
      failed: failCount,
      results
    }));

  } catch (error) {
    console.error('[Khai] Error in /api/homebay/dryrun:', error);
    return res.status(500).json(fail('Internal server error'));
  }
});

module.exports = router;
