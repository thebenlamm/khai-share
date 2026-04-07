'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { AuditContext } = require('../src/agent/audit-checks/context');
const { checkModules } = require('../src/agent/audit-checks');

const TEST_CONFIG = {
  baseUrl: 'https://example.com',
  profile: {},
  siteName: 'example.com',
};

// ===========================
// AuditContext tests
// ===========================

describe('AuditContext', () => {
  test('constructor sets baseUrl, profile, and empty results', () => {
    const ctx = new AuditContext(TEST_CONFIG);
    assert.equal(ctx.baseUrl, 'https://example.com');
    assert.deepEqual(ctx.profile, {});
    assert.deepEqual(ctx.results.categories, {});
    assert.deepEqual(ctx.results.summary, { total: 0, passed: 0, failed: 0, warnings: 0, skipped: 0 });
  });

  test('_addResult records pass and increments summary', () => {
    const ctx = new AuditContext(TEST_CONFIG);
    ctx._addResult('testCategory', 'some test', 'pass', 'detail here');

    assert.equal(ctx.results.summary.total, 1);
    assert.equal(ctx.results.summary.passed, 1);
    assert.equal(ctx.results.summary.failed, 0);
    assert.equal(ctx.results.categories.testCategory.passed, 1);
    assert.equal(ctx.results.categories.testCategory.tests.length, 1);
    assert.equal(ctx.results.categories.testCategory.tests[0].test, 'some test');
    assert.equal(ctx.results.categories.testCategory.tests[0].status, 'pass');
  });

  test('_addResult records fail and increments failed counter', () => {
    const ctx = new AuditContext(TEST_CONFIG);
    ctx._addResult('myCategory', 'failing test', 'fail', 'it broke');

    assert.equal(ctx.results.summary.total, 1);
    assert.equal(ctx.results.summary.failed, 1);
    assert.equal(ctx.results.summary.passed, 0);
    assert.equal(ctx.results.categories.myCategory.failed, 1);
  });

  test('_shouldRun returns true when categories is null (run all)', () => {
    const ctx = new AuditContext({ ...TEST_CONFIG, categories: null });
    assert.equal(ctx._shouldRun('publicPages'), true);
    assert.equal(ctx._shouldRun('ssl'), true);
  });

  test('_shouldRun returns false for excluded categories when filter is set', () => {
    const ctx = new AuditContext({ ...TEST_CONFIG, categories: ['ssl', 'cors'] });
    assert.equal(ctx._shouldRun('ssl'), true);
    assert.equal(ctx._shouldRun('cors'), true);
    assert.equal(ctx._shouldRun('publicPages'), false);
    assert.equal(ctx._shouldRun('seo'), false);
  });
});

// ===========================
// Check modules registry
// ===========================

describe('Check modules', () => {
  test('checkModules has exactly 14 entries', () => {
    const names = Object.keys(checkModules);
    assert.equal(names.length, 14);
  });

  test('all 14 required category names are present', () => {
    const expected = [
      'publicPages', 'redirects', 'securityHeaders', 'cookieSecurity',
      'cors', 'authBypass', 'sensitivePaths', 'apiEndpoints',
      'rateLimiting', 'ssl', 'seo', 'performance',
      'authenticated', 'authorization',
    ];
    for (const name of expected) {
      assert.ok(checkModules[name], `Missing module: ${name}`);
    }
  });

  test('each module exports a run function', () => {
    for (const [name, mod] of Object.entries(checkModules)) {
      assert.equal(typeof mod.run, 'function', `${name}.run is not a function`);
    }
  });

  test('each module can be required individually', () => {
    const individual = [
      require('../src/agent/audit-checks/publicPages'),
      require('../src/agent/audit-checks/redirects'),
      require('../src/agent/audit-checks/securityHeaders'),
      require('../src/agent/audit-checks/cookieSecurity'),
      require('../src/agent/audit-checks/cors'),
      require('../src/agent/audit-checks/authBypass'),
      require('../src/agent/audit-checks/sensitivePaths'),
      require('../src/agent/audit-checks/apiEndpoints'),
      require('../src/agent/audit-checks/rateLimiting'),
      require('../src/agent/audit-checks/ssl'),
      require('../src/agent/audit-checks/seo'),
      require('../src/agent/audit-checks/performance'),
      require('../src/agent/audit-checks/authenticated'),
      require('../src/agent/audit-checks/authorization'),
    ];
    for (const mod of individual) {
      assert.equal(typeof mod.run, 'function');
    }
  });
});

// ===========================
// publicPages check integration
// ===========================

describe('publicPages check', () => {
  test('passes when mock request returns expected status 200', async () => {
    const ctx = new AuditContext({
      baseUrl: 'https://example.com',
      profile: {
        publicPages: [{ path: '/', expectedStatus: 200 }],
      },
      siteName: 'example.com',
    });

    // Stub _request to return 200
    ctx._request = async () => ({
      status: 200,
      headers: {},
      body: 'Welcome',
      redirectUrl: null,
      timing: 50,
    });

    const { run } = require('../src/agent/audit-checks/publicPages');
    await run(ctx);

    assert.ok(ctx.results.categories.publicPages, 'publicPages category should exist');
    assert.equal(ctx.results.categories.publicPages.passed, 1);
    assert.equal(ctx.results.categories.publicPages.failed, 0);
  });

  test('fails when actual status does not match expected status', async () => {
    const ctx = new AuditContext({
      baseUrl: 'https://example.com',
      profile: {
        publicPages: [{ path: '/dashboard', expectedStatus: 200 }],
      },
      siteName: 'example.com',
    });

    // Stub _request to return 404
    ctx._request = async () => ({
      status: 404,
      headers: {},
      body: 'Not Found',
      redirectUrl: null,
      timing: 20,
    });

    const { run } = require('../src/agent/audit-checks/publicPages');
    await run(ctx);

    assert.equal(ctx.results.categories.publicPages.failed, 1);
    assert.equal(ctx.results.categories.publicPages.passed, 0);
  });
});

// ===========================
// securityHeaders check integration
// ===========================

describe('securityHeaders check', () => {
  test('records failures for missing required headers', async () => {
    const ctx = new AuditContext({
      baseUrl: 'https://example.com',
      profile: {},
      siteName: 'example.com',
    });

    // Stub _request to return empty headers (no security headers set)
    ctx._request = async () => ({
      status: 200,
      headers: {},
      body: '',
      redirectUrl: null,
      timing: 30,
    });

    const { run } = require('../src/agent/audit-checks/securityHeaders');
    await run(ctx);

    assert.ok(ctx.results.categories.securityHeaders, 'securityHeaders category should exist');
    // Default required: x-frame-options, x-content-type-options, strict-transport-security
    // All missing -> all fail
    assert.ok(ctx.results.categories.securityHeaders.failed > 0,
      `Expected at least one failure, got ${ctx.results.categories.securityHeaders.failed}`);
  });

  test('passes for present required headers', async () => {
    const ctx = new AuditContext({
      baseUrl: 'https://example.com',
      profile: {},
      siteName: 'example.com',
    });

    ctx._request = async () => ({
      status: 200,
      headers: {
        'x-frame-options': 'DENY',
        'x-content-type-options': 'nosniff',
        'strict-transport-security': 'max-age=31536000; includeSubDomains',
      },
      body: '',
      redirectUrl: null,
      timing: 30,
    });

    const { run } = require('../src/agent/audit-checks/securityHeaders');
    await run(ctx);

    // All 3 required headers present -> 3 passes for required
    assert.ok(ctx.results.categories.securityHeaders.passed >= 3,
      `Expected at least 3 passes, got ${ctx.results.categories.securityHeaders.passed}`);
  });
});
