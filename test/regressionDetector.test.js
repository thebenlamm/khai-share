'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

// Will fail until src/agent/regressionDetector.js is created
const { detectRegressions } = require('../src/agent/regressionDetector');

const makeBaseline = (pages, thresholds = { pageLoadTime: 3000 }) => ({
  id: 'test-baseline',
  site: 'example.com',
  account: 'admin',
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
  thresholds,
  snapshot: {
    capturedAt: '2026-01-01T00:00:00Z',
    pageCount: pages.length,
    pages,
  },
});

describe('detectRegressions', () => {
  test('null baseline returns safe empty result', () => {
    const result = detectRegressions(null, []);
    assert.equal(result.hasRegressions, false);
    assert.equal(result.summary.total, 0);
    assert.deepEqual(result.regressions, []);
  });

  test('null currentPages returns safe empty result', () => {
    const baseline = makeBaseline([{ url: '/home', title: 'Home', status: 200, loadTime: 500 }]);
    const result = detectRegressions(baseline, null);
    assert.equal(result.hasRegressions, false);
    assert.equal(result.summary.total, 0);
  });

  test('empty baseline pages returns safe empty result', () => {
    const baseline = makeBaseline([]);
    const result = detectRegressions(baseline, [{ url: '/home', title: 'Home', status: 200, loadTime: 500 }]);
    // No baseline pages means no comparisons — new pages ARE flagged as page_new
    assert.equal(result.hasRegressions, true);
    assert.equal(result.summary.newPages, 1);
  });

  test('identical pages return hasRegressions: false', () => {
    const pages = [
      { url: '/home', title: 'Home', status: 200, loadTime: 500 },
      { url: '/about', title: 'About', status: 200, loadTime: 400 },
    ];
    const baseline = makeBaseline(pages);
    const result = detectRegressions(baseline, pages);
    assert.equal(result.hasRegressions, false);
    assert.equal(result.summary.total, 0);
  });

  test('detects title_changed when both titles are non-null and differ', () => {
    const baseline = makeBaseline([{ url: '/home', title: 'Home', status: 200, loadTime: 500 }]);
    const current = [{ url: '/home', title: 'Welcome', status: 200, loadTime: 500 }];
    const result = detectRegressions(baseline, current);
    const reg = result.regressions.find(r => r.type === 'title_changed');
    assert.ok(reg, 'Should have title_changed regression');
    assert.equal(reg.url, '/home');
    assert.equal(reg.before, 'Home');
    assert.equal(reg.after, 'Welcome');
    assert.equal(result.summary.titleChanges, 1);
  });

  test('does NOT flag title_changed when baseline title is null', () => {
    const baseline = makeBaseline([{ url: '/home', title: null, status: 200, loadTime: 500 }]);
    const current = [{ url: '/home', title: 'Home', status: 200, loadTime: 500 }];
    const result = detectRegressions(baseline, current);
    assert.equal(result.summary.titleChanges, 0);
  });

  test('does NOT flag title_changed when current title is null', () => {
    const baseline = makeBaseline([{ url: '/home', title: 'Home', status: 200, loadTime: 500 }]);
    const current = [{ url: '/home', title: null, status: 200, loadTime: 500 }];
    const result = detectRegressions(baseline, current);
    assert.equal(result.summary.titleChanges, 0);
  });

  test('detects page_missing for URL in baseline but not in current', () => {
    const baseline = makeBaseline([
      { url: '/home', title: 'Home', status: 200, loadTime: 500 },
      { url: '/about', title: 'About', status: 200, loadTime: 400 },
    ]);
    const current = [{ url: '/home', title: 'Home', status: 200, loadTime: 500 }];
    const result = detectRegressions(baseline, current);
    const reg = result.regressions.find(r => r.type === 'page_missing');
    assert.ok(reg, 'Should have page_missing regression');
    assert.equal(reg.url, '/about');
    assert.equal(result.summary.missingPages, 1);
  });

  test('detects page_new for URL in current but not in baseline', () => {
    const baseline = makeBaseline([{ url: '/home', title: 'Home', status: 200, loadTime: 500 }]);
    const current = [
      { url: '/home', title: 'Home', status: 200, loadTime: 500 },
      { url: '/contact', title: 'Contact', status: 200, loadTime: 300 },
    ];
    const result = detectRegressions(baseline, current);
    const reg = result.regressions.find(r => r.type === 'page_new');
    assert.ok(reg, 'Should have page_new regression');
    assert.equal(reg.url, '/contact');
    assert.equal(result.summary.newPages, 1);
  });

  test('detects status_changed when status code differs', () => {
    const baseline = makeBaseline([{ url: '/home', title: 'Home', status: 200, loadTime: 500 }]);
    const current = [{ url: '/home', title: 'Home', status: 301, loadTime: 500 }];
    const result = detectRegressions(baseline, current);
    const reg = result.regressions.find(r => r.type === 'status_changed');
    assert.ok(reg, 'Should have status_changed regression');
    assert.equal(reg.before, 200);
    assert.equal(reg.after, 301);
    assert.equal(result.summary.statusChanges, 1);
  });

  test('detects timing_regression when loadTime exceeds threshold', () => {
    const baseline = makeBaseline(
      [{ url: '/home', title: 'Home', status: 200, loadTime: 500 }],
      { pageLoadTime: 3000 }
    );
    const current = [{ url: '/home', title: 'Home', status: 200, loadTime: 5000 }];
    const result = detectRegressions(baseline, current);
    const reg = result.regressions.find(r => r.type === 'timing_regression');
    assert.ok(reg, 'Should have timing_regression');
    assert.equal(reg.threshold, 3000);
    assert.equal(reg.actual, 5000);
    assert.equal(result.summary.timingRegressions, 1);
  });

  test('does NOT flag timing_regression when loadTime is within threshold', () => {
    const baseline = makeBaseline(
      [{ url: '/home', title: 'Home', status: 200, loadTime: 500 }],
      { pageLoadTime: 3000 }
    );
    const current = [{ url: '/home', title: 'Home', status: 200, loadTime: 2999 }];
    const result = detectRegressions(baseline, current);
    assert.equal(result.summary.timingRegressions, 0);
  });

  test('timing uses threshold not baseline loadTime', () => {
    // baseline loadTime is 2800, threshold is 3000; current is 2900 — should NOT flag
    const baseline = makeBaseline(
      [{ url: '/home', title: 'Home', status: 200, loadTime: 2800 }],
      { pageLoadTime: 3000 }
    );
    const current = [{ url: '/home', title: 'Home', status: 200, loadTime: 2900 }];
    const result = detectRegressions(baseline, current);
    assert.equal(result.summary.timingRegressions, 0);
  });

  test('combined: plan smoke test scenario', () => {
    // From plan's verify block
    const baseline = makeBaseline(
      [
        { url: '/home', title: 'Home', status: 200, loadTime: 1000 },
        { url: '/about', title: 'About', status: 200, loadTime: 800 },
      ],
      { pageLoadTime: 3000 }
    );
    const current = [
      { url: '/home', title: 'Welcome', status: 200, loadTime: 5000 },
      { url: '/contact', title: 'Contact', status: 200, loadTime: 500 },
    ];
    const result = detectRegressions(baseline, current);
    const types = result.regressions.map(r => r.type).sort();
    assert.equal(result.hasRegressions, true);
    assert.equal(result.summary.total, 4);
    assert.ok(types.includes('title_changed'));
    assert.ok(types.includes('page_missing'));
    assert.ok(types.includes('page_new'));
    assert.ok(types.includes('timing_regression'));
  });

  test('summary counts match regressions array length', () => {
    const baseline = makeBaseline(
      [
        { url: '/home', title: 'Home', status: 200, loadTime: 1000 },
        { url: '/about', title: 'About', status: 200, loadTime: 800 },
      ],
      { pageLoadTime: 3000 }
    );
    const current = [
      { url: '/home', title: 'Welcome', status: 200, loadTime: 5000 },
      { url: '/contact', title: 'Contact', status: 200, loadTime: 500 },
    ];
    const result = detectRegressions(baseline, current);
    const countedTotal = result.summary.titleChanges + result.summary.missingPages +
      result.summary.newPages + result.summary.statusChanges + result.summary.timingRegressions;
    assert.equal(countedTotal, result.summary.total);
    assert.equal(result.regressions.length, result.summary.total);
  });
});
