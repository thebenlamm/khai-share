const express = require('express');
const router = express.Router();
const { WebsiteCrawler } = require('../agent/crawler');
const { PasswordRotator } = require('../agent/passwordRotator');
const fs = require('fs');
const path = require('path');
const { loadCredentials } = require('../utils/config');
const { safePath, safeId } = require('../utils/safePath');
const { ok, fail, errorHandler } = require('../utils/response');
const { detectRegressions } = require('../agent/regressionDetector');
const { manager: baselineManager } = require('./baselines');
const { JobStore, runAsyncJob } = require('../utils/jobStore');

// Store active tests with TTL-based eviction
const activeJobs = new JobStore();
const completedJobs = new JobStore();
const rotationJobs = new JobStore();

const REPORTS_DIR = path.join(__dirname, '../../reports');
const SCREENSHOTS_DIR = path.join(__dirname, '../../screenshots');

// Get available sites
router.get('/sites', (req, res) => {
  try {
    const credentials = loadCredentials();
    const sites = Object.keys(credentials.sites).map(name => ({
      name,
      baseUrl: credentials.sites[name].baseUrl,
      accounts: Object.keys(credentials.sites[name].accounts)
    }));
    res.json(ok({ sites }));
  } catch (error) {
    errorHandler(res, error, 'sites');
  }
});

// Start a new test
router.post('/test/start', async (req, res) => {
  const { site, account, maxDepth = 3, viewport = 'desktop', startPath = null, webhookUrl = null } = req.body;

  if (!site || !account) {
    return res.status(400).json(fail('Site and account are required'));
  }

  if (maxDepth !== undefined) {
    const depth = parseInt(maxDepth, 10);
    if (isNaN(depth) || depth < 1 || depth > 10) {
      return res.status(400).json(fail('maxDepth must be an integer between 1 and 10'));
    }
  }

  try {
    const credentials = loadCredentials();
    const siteConfig = credentials.sites[site];

    if (!siteConfig) {
      return res.status(404).json(fail(`Site ${site} not found in configuration`));
    }

    const accountConfig = siteConfig.accounts[account];
    if (!accountConfig) {
      return res.status(404).json(fail(`Account ${account} not found for site ${site}`));
    }

    const crawler = new WebsiteCrawler({
      baseUrl: siteConfig.baseUrl,
      accountType: account
    });

    const paymentConfig = credentials.payment || null;
    await crawler.init(paymentConfig, viewport);

    const testId = crawler.results.id;

    // Run test asynchronously
    runAsyncJob(activeJobs, testId, {
      crawler, site, account, startTime: new Date().toISOString()
    }, async (job) => {
      job.status = 'logging-in';
      job.phase = 'login';
      const loginSuccess = await crawler.login(accountConfig);

      if (!loginSuccess) {
        // Extract specific login error from crawler issues
        const loginIssues = crawler.results.issues.filter(
          i => i.type === 'login-failed' || i.type === 'login-error'
        );
        const errorDetail = loginIssues.length > 0
          ? loginIssues[0].message
          : 'Login failed (unknown reason)';

        // Flag for login-failed status override in runAsyncJob catch block
        job.loginError = errorDetail;

        // Still close browser and save results for debugging
        const results = await crawler.close();
        completedJobs.create(testId, { ...results });

        fs.mkdirSync(REPORTS_DIR, { recursive: true });
        const reportPath = path.join(REPORTS_DIR, `${testId}.json`);
        fs.writeFileSync(reportPath, JSON.stringify(results, null, 2));

        // Throw so runAsyncJob sets endTime + webhook; loginError flag overrides status to 'login-failed'
        throw new Error(errorDetail);
      }

      job.status = 'crawling';
      job.phase = 'crawl';
      const startUrl = startPath ? siteConfig.baseUrl + startPath : null;
      await crawler.crawl(startUrl, maxDepth);

      const results = await crawler.close();
      job.phase = 'complete';

      // Regression detection — runs automatically when a baseline exists for this site+account
      try {
        const baseline = baselineManager.getBaselineForSite(results.site, results.account);
        results.regressions = baseline
          ? detectRegressions(baseline, results.pages)
          : null;
      } catch (regErr) {
        console.error('[Khai] Regression detection error:', regErr);
        results.regressions = null;
      }

      completedJobs.create(testId, { ...results });

      // Save report
      fs.mkdirSync(REPORTS_DIR, { recursive: true });
      const reportPath = path.join(REPORTS_DIR, `${testId}.json`);
      fs.writeFileSync(reportPath, JSON.stringify(results, null, 2));

      return results;
    }, { operationType: 'test', operationId: testId, webhookUrl });

    const startResponse = { testId, message: 'Khai test started', site, account };
    if (webhookUrl) startResponse.webhookUrl = webhookUrl;
    res.json(ok(startResponse));

  } catch (error) {
    errorHandler(res, error, 'test/start');
  }
});

// Get test status
router.get('/test/:testId/status', (req, res) => {
  const { testId } = req.params;
  const test = activeJobs.get(testId);

  if (!test) {
    return res.status(404).json(fail('Test not found'));
  }

  // For terminal states, crawler may be closed -- use completedJobs data
  if (test.status === 'login-failed' || test.status === 'error' || test.status === 'completed') {
    const completed = completedJobs.get(testId);
    return res.json(ok({
      testId,
      status: test.status,
      phase: test.phase || null,
      site: test.site,
      account: test.account,
      startTime: test.startTime,
      pagesScanned: completed ? completed.pages.length : 0,
      issuesFound: completed ? completed.issues.length : 0,
      summary: completed ? completed.summary : null,
      error: test.error || null,
      loginError: test.loginError || null,
      pendingPurchase: null,
      webhook: test.webhook || null
    }));
  }

  const results = test.crawler.results;
  const pendingPurchases = test.crawler.getPendingPurchases();

  // Approximate deduplicated count for in-progress status
  let dedupedIssueCount = results.issues.length;
  if (test.crawler.issueFingerprint) {
    const seen = new Set();
    dedupedIssueCount = 0;
    for (const issue of results.issues) {
      const fp = test.crawler.issueFingerprint(issue);
      if (!seen.has(fp)) {
        seen.add(fp);
        dedupedIssueCount++;
      }
    }
  }

  res.json(ok({
    testId,
    status: test.status,
    phase: test.phase || null,
    site: test.site,
    account: test.account,
    startTime: test.startTime,
    pagesScanned: results.pages.length,
    issuesFound: dedupedIssueCount,
    summary: results.summary,
    error: test.error || null,
    loginError: test.loginError || null,
    pendingPurchase: pendingPurchases.length > 0 ? pendingPurchases[0] : null
  }));
});

// Get test results
router.get('/test/:testId/results', (req, res) => {
  const { testId } = req.params;

  if (completedJobs.has(testId)) {
    const { _createdAt, ...data } = completedJobs.get(testId);
    return res.json(ok(data));
  }

  const test = activeJobs.get(testId);
  if (test) {
    return res.json(ok(test.crawler.results));
  }

  // Check saved reports
  try {
    const reportPath = safePath(REPORTS_DIR, `${safeId(testId)}.json`);
    if (fs.existsSync(reportPath)) {
      const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
      return res.json(ok(report));
    }
  } catch (e) {
    return res.status(400).json(fail('Invalid test ID'));
  }

  res.status(404).json(fail('Test results not found'));
});

// Get screenshot
router.get('/screenshot/:testId/:filename', (req, res) => {
  try {
    const { testId, filename } = req.params;
    const filepath = safePath(SCREENSHOTS_DIR, safeId(testId), safeId(filename));

    if (!fs.existsSync(filepath)) {
      return res.status(404).json(fail('Screenshot not found'));
    }

    res.sendFile(filepath);
  } catch (e) {
    res.status(400).json(fail('Invalid path'));
  }
});

// List all tests
router.get('/tests', (req, res) => {
  const tests = [];

  activeJobs.forEach((test, id) => {
    tests.push({
      id,
      status: test.status,
      site: test.site,
      account: test.account,
      startTime: test.startTime
    });
  });

  // Saved reports
  if (fs.existsSync(REPORTS_DIR)) {
    fs.readdirSync(REPORTS_DIR).forEach(file => {
      if (file.endsWith('.json')) {
        const id = file.replace('.json', '');
        if (!activeJobs.has(id)) {
          try {
            const report = JSON.parse(fs.readFileSync(path.join(REPORTS_DIR, file), 'utf8'));
            tests.push({
              id,
              status: 'completed',
              site: report.site,
              account: report.account,
              startTime: report.startTime,
              endTime: report.endTime
            });
          } catch (e) {
            // Skip invalid files
          }
        }
      }
    });
  }

  res.json(ok({ tests }));
});

// Stop a test
router.post('/test/:testId/stop', async (req, res) => {
  const { testId } = req.params;
  const test = activeJobs.get(testId);

  if (!test) {
    return res.status(404).json(fail('Test not found'));
  }

  try {
    await test.crawler.close();
    test.status = 'stopped';
    res.json(ok({ message: 'Test stopped', testId }));
  } catch (error) {
    errorHandler(res, error, 'test/stop');
  }
});

// Delete a test report
router.delete('/test/:testId', (req, res) => {
  try {
    const testId = safeId(req.params.testId);

    activeJobs.delete(testId);
    completedJobs.delete(testId);

    const reportPath = safePath(REPORTS_DIR, `${testId}.json`);
    if (fs.existsSync(reportPath)) {
      fs.unlinkSync(reportPath);
    }

    const screenshotDir = safePath(SCREENSHOTS_DIR, testId);
    if (fs.existsSync(screenshotDir)) {
      fs.rmSync(screenshotDir, { recursive: true });
    }

    res.json(ok({ message: 'Test deleted', testId }));
  } catch (e) {
    res.status(400).json(fail('Invalid test ID'));
  }
});

// Add a note to an issue
router.post('/test/:testId/issue/:issueId/note', (req, res) => {
  const { testId, issueId } = req.params;
  const { note } = req.body;

  const results = completedJobs.get(testId);
  if (!results) {
    return res.status(404).json(fail('Test not found'));
  }

  const issue = results.issues.find(i => i.id === issueId);
  if (!issue) {
    return res.status(404).json(fail('Issue not found'));
  }

  if (!issue.notes) {
    issue.notes = [];
  }
  issue.notes.push({
    text: note,
    timestamp: new Date().toISOString()
  });

  try {
    const reportPath = safePath(REPORTS_DIR, `${safeId(testId)}.json`);
    const { _createdAt, ...data } = results;
    fs.writeFileSync(reportPath, JSON.stringify(data, null, 2));
  } catch (e) {
    // Report save is best-effort
  }

  res.json(ok({ message: 'Note added', issue }));
});

// =====================================
// PURCHASE TESTING ENDPOINTS
// =====================================

router.get('/purchases/pending', (req, res) => {
  const allPending = [];

  activeJobs.forEach((test, testId) => {
    const pending = test.crawler.getPendingPurchases();
    pending.forEach(p => {
      allPending.push({ ...p, testId });
    });
  });

  res.json(ok({ purchases: allPending }));
});

router.post('/purchases/:purchaseId/confirm', async (req, res) => {
  const { purchaseId } = req.params;
  const { confirm } = req.body;

  let foundTest = null;
  let foundTestId = null;

  activeJobs.forEach((test, testId) => {
    const pending = test.crawler.getPendingPurchases();
    if (pending.some(p => p.id === purchaseId)) {
      foundTest = test;
      foundTestId = testId;
    }
  });

  if (!foundTest) {
    return res.status(404).json(fail('Purchase not found'));
  }

  try {
    const result = await foundTest.crawler.confirmPurchase(purchaseId, confirm);
    res.json(ok({
      message: confirm ? 'Purchase confirmed' : 'Purchase cancelled',
      purchase: result,
      testId: foundTestId
    }));
  } catch (error) {
    errorHandler(res, error, 'purchases/confirm');
  }
});

router.post('/test/:testId/fill-payment', async (req, res) => {
  const { testId } = req.params;
  const { cardKey = 'primary' } = req.body;

  const test = activeJobs.get(testId);
  if (!test) {
    return res.status(404).json(fail('Test not found'));
  }

  try {
    const purchase = await test.crawler.fillPaymentAndRequestConfirmation(cardKey);

    if (!purchase) {
      return res.status(400).json(fail('No payment configuration available or not on checkout page'));
    }

    res.json(ok({
      message: 'Payment form filled - awaiting confirmation',
      purchase
    }));
  } catch (error) {
    errorHandler(res, error, 'fill-payment');
  }
});

router.get('/test/:testId/purchases', (req, res) => {
  const { testId } = req.params;

  const test = activeJobs.get(testId);
  if (test) {
    return res.json(ok({ purchases: test.crawler.results.purchases || [] }));
  }

  const completed = completedJobs.get(testId);
  if (completed) {
    return res.json(ok({ purchases: completed.purchases || [] }));
  }

  try {
    const reportPath = safePath(REPORTS_DIR, `${safeId(testId)}.json`);
    if (fs.existsSync(reportPath)) {
      const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
      return res.json(ok({ purchases: report.purchases || [] }));
    }
  } catch (e) {
    return res.status(400).json(fail('Invalid test ID'));
  }

  res.status(404).json(fail('Test not found'));
});

// =====================================
// PASSWORD ROTATION ENDPOINTS
// =====================================

router.post('/rotate-password', async (req, res) => {
  const { site, account, newPassword } = req.body;

  if (!site || !account || !newPassword) {
    return res.status(400).json(fail('Missing required fields: site, account, newPassword'));
  }

  try {
    const credentials = loadCredentials();
    const siteConfig = credentials.sites[site];
    if (!siteConfig) {
      return res.status(404).json(fail(`Site ${site} not found`));
    }

    const accountConfig = siteConfig.accounts[account];
    if (!accountConfig) {
      return res.status(404).json(fail(`Account ${account} not found for site ${site}`));
    }

    if (!accountConfig.changePasswordUrl) {
      return res.status(400).json(fail('No changePasswordUrl configured for this account'));
    }

    const rotator = new PasswordRotator();
    const rotationId = Date.now().toString(36);

    runAsyncJob(rotationJobs, rotationId, {
      site, startTime: new Date().toISOString()
    }, async () => {
      return await rotator.rotatePassword({
        site,
        loginUrl: siteConfig.baseUrl + accountConfig.loginUrl,
        changePasswordUrl: siteConfig.baseUrl + accountConfig.changePasswordUrl,
        username: accountConfig.username,
        currentPassword: accountConfig.password,
        newPassword,
        selectors: accountConfig.passwordRotationSelectors || {}
      });
    }, { operationType: 'rotation', operationId: rotationId });

    res.json(ok({
      rotationId,
      message: 'Password rotation started',
      site
    }));

  } catch (error) {
    errorHandler(res, error, 'rotate-password');
  }
});

router.get('/rotation/:rotationId/status', (req, res) => {
  const { rotationId } = req.params;
  const rotation = rotationJobs.get(rotationId);

  if (!rotation) {
    return res.status(404).json(fail('Rotation not found'));
  }

  // Flatten results into the response for backward compatibility
  const { _createdAt, results, ...meta } = rotation;
  res.json(ok({ ...meta, ...(results || {}) }));
});

router.get('/rotations', (req, res) => {
  const rotations = [];
  rotationJobs.forEach((rotation, id) => {
    const { _createdAt, ...data } = rotation;
    rotations.push({ id, ...data });
  });
  res.json(ok({ rotations }));
});

module.exports = router;
