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

module.exports = router;
