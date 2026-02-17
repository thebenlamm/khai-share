const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const { safePath, safeId } = require('../utils/safePath');
const { ok, fail, errorHandler } = require('../utils/response');

const VisualRegression = require('../agent/visualRegression');
const FlowTester = require('../agent/flowTester');
const APIFuzzer = require('../agent/apiFuzzer');
const LighthouseAgent = require('../agent/lighthouse');
const LinkChecker = require('../agent/linkChecker');
const FormFuzzer = require('../agent/formFuzzer');
const AuditScheduler = require('../agent/scheduler');

// Shared state
const activeJobs = new Map();
const scheduler = new AuditScheduler();

const MAX_MAP_SIZE = 100;
const EVICTION_TTL_MS = 60 * 60 * 1000;

function evictStale(map) {
  if (map.size <= MAX_MAP_SIZE) return;
  const now = Date.now();
  for (const [key, val] of map) {
    if (now - (val._createdAt || 0) > EVICTION_TTL_MS) map.delete(key);
  }
  while (map.size > MAX_MAP_SIZE) {
    map.delete(map.keys().next().value);
  }
}

const SCREENSHOTS_DIR = path.join(__dirname, '../../screenshots');
const FLOWS_DIR = path.join(__dirname, '../../config/flows');

// ===========================
// Visual Regression
// ===========================

router.post('/visual/compare', async (req, res) => {
  const { baselineDir, currentDir, threshold } = req.body;

  // Validate directories are within screenshots/
  try {
    safePath(SCREENSHOTS_DIR, baselineDir || '');
    safePath(SCREENSHOTS_DIR, currentDir || '');
  } catch (e) {
    return res.status(400).json(fail('Directories must be within the screenshots directory'));
  }

  const resolvedBaseline = path.resolve(SCREENSHOTS_DIR, baselineDir || '');
  const resolvedCurrent = path.resolve(SCREENSHOTS_DIR, currentDir || '');

  const vr = new VisualRegression({ baselineDir: resolvedBaseline, currentDir: resolvedCurrent, threshold });
  try {
    const report = await vr.compare();
    res.json(ok(report));
  } catch (err) {
    errorHandler(res, err, 'visual/compare');
  }
});

router.post('/visual/set-baseline', (req, res) => {
  const { sourceDir, testId } = req.body;
  try {
    let count;
    if (testId) {
      safeId(testId);
      count = VisualRegression.saveBaselineFromTest(testId);
    } else if (sourceDir) {
      safePath(SCREENSHOTS_DIR, sourceDir);
      const resolved = path.resolve(SCREENSHOTS_DIR, sourceDir);
      const vr = new VisualRegression({ baselineDir: req.body.baselineDir });
      count = vr.setBaseline(resolved);
    } else {
      return res.status(400).json(fail('Either testId or sourceDir is required'));
    }
    res.json(ok({ message: 'Baseline set', files: count }));
  } catch (err) {
    errorHandler(res, err, 'visual/set-baseline');
  }
});

// ===========================
// Flow Testing
// ===========================

router.get('/flows/configs', (req, res) => {
  if (!fs.existsSync(FLOWS_DIR)) return res.json(ok({ configs: [] }));
  const configs = fs.readdirSync(FLOWS_DIR)
    .filter(f => f.endsWith('.json'))
    .map(f => {
      try {
        const config = JSON.parse(fs.readFileSync(path.join(FLOWS_DIR, f), 'utf8'));
        return { name: f.replace('.json', ''), flows: (config.flows || []).length, site: config.site };
      } catch { return null; }
    }).filter(Boolean);
  res.json(ok({ configs }));
});

router.post('/flows/run', async (req, res) => {
  const { site, flowName, accountConfig } = req.body;
  if (!site) return res.status(400).json(fail('site is required'));

  try {
    const configPath = safePath(FLOWS_DIR, `${safeId(site)}.json`);
    if (!fs.existsSync(configPath)) return res.status(404).json(fail(`No flow config for ${site}`));

    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    const jobId = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

    evictStale(activeJobs);
    activeJobs.set(jobId, { type: 'flow', status: 'running', site, startTime: new Date().toISOString(), _createdAt: Date.now() });

    (async () => {
      const ft = new FlowTester(config);
      try {
        await ft.init();
        if (accountConfig) await ft.login(accountConfig);
        const flows = config.flows || [];
        const targetFlows = flowName ? flows.filter(f => f.name === flowName) : flows;
        const results = [];
        for (const flow of targetFlows) {
          const result = await ft.runFlow(flow);
          results.push(result);
        }
        await ft.close();
        activeJobs.get(jobId).status = 'completed';
        activeJobs.get(jobId).results = results;
      } catch (err) {
        try { await ft.close(); } catch (_) {}
        activeJobs.get(jobId).status = 'error';
        activeJobs.get(jobId).error = 'Flow test failed';
      }
    })();

    res.json(ok({ jobId, message: 'Flow test started', site }));
  } catch (e) {
    res.status(400).json(fail('Invalid site name'));
  }
});

// ===========================
// API Fuzzing
// ===========================

router.post('/fuzz/api', async (req, res) => {
  const { baseUrl, endpoints, timeout, concurrency, headers } = req.body;
  if (!baseUrl || !endpoints) return res.status(400).json(fail('baseUrl and endpoints are required'));

  const jobId = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  evictStale(activeJobs);
  activeJobs.set(jobId, { type: 'api-fuzz', status: 'running', startTime: new Date().toISOString(), _createdAt: Date.now() });

  (async () => {
    const fuzzer = new APIFuzzer({ baseUrl, endpoints, timeout, concurrency, headers });
    try {
      const results = await fuzzer.fuzzAll();
      activeJobs.get(jobId).status = 'completed';
      activeJobs.get(jobId).results = results;
    } catch (err) {
      activeJobs.get(jobId).status = 'error';
      activeJobs.get(jobId).error = 'API fuzzing failed';
    }
  })();

  res.json(ok({ jobId, message: 'API fuzzing started', endpoints: endpoints.length }));
});

// ===========================
// Form Fuzzing
// ===========================

router.post('/fuzz/forms', async (req, res) => {
  const { baseUrl, pages, accountConfig } = req.body;
  if (!baseUrl || !pages) return res.status(400).json(fail('baseUrl and pages are required'));

  const jobId = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  evictStale(activeJobs);
  activeJobs.set(jobId, { type: 'form-fuzz', status: 'running', startTime: new Date().toISOString(), _createdAt: Date.now() });

  (async () => {
    const ff = new FormFuzzer({ baseUrl });
    try {
      await ff.init();
      if (accountConfig) await ff.login(accountConfig);
      for (const page of pages) {
        await ff.fuzzPage(baseUrl + page);
      }
      const results = await ff.close();
      activeJobs.get(jobId).status = 'completed';
      activeJobs.get(jobId).results = results;
    } catch (err) {
      try { await ff.close(); } catch (_) {}
      activeJobs.get(jobId).status = 'error';
      activeJobs.get(jobId).error = 'Form fuzzing failed';
    }
  })();

  res.json(ok({ jobId, message: 'Form fuzzing started', pages: pages.length }));
});

// ===========================
// Lighthouse (Performance)
// ===========================

router.post('/lighthouse', async (req, res) => {
  const { pages, viewport } = req.body;
  if (!pages || !pages.length) return res.status(400).json(fail('pages array is required'));

  const jobId = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  evictStale(activeJobs);
  activeJobs.set(jobId, { type: 'lighthouse', status: 'running', startTime: new Date().toISOString(), _createdAt: Date.now() });

  (async () => {
    const lh = new LighthouseAgent({ pages, viewport });
    try {
      await lh.init();
      const results = await lh.auditAll();
      await lh.close();
      activeJobs.get(jobId).status = 'completed';
      activeJobs.get(jobId).results = results;
    } catch (err) {
      try { await lh.close(); } catch (_) {}
      activeJobs.get(jobId).status = 'error';
      activeJobs.get(jobId).error = 'Lighthouse audit failed';
    }
  })();

  res.json(ok({ jobId, message: 'Lighthouse audit started', pages: pages.length }));
});

// ===========================
// Link Checker
// ===========================

router.post('/links/check', async (req, res) => {
  const { baseUrl, maxPages, concurrency, timeout } = req.body;
  if (!baseUrl) return res.status(400).json(fail('baseUrl is required'));

  const jobId = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  evictStale(activeJobs);
  activeJobs.set(jobId, { type: 'link-check', status: 'running', startTime: new Date().toISOString(), _createdAt: Date.now() });

  (async () => {
    const lc = new LinkChecker({ baseUrl, maxPages, concurrency, timeout });
    try {
      await lc.init();
      const results = await lc.crawlAndCheck();
      await lc.close();
      activeJobs.get(jobId).status = 'completed';
      activeJobs.get(jobId).results = results;
    } catch (err) {
      try { await lc.close(); } catch (_) {}
      activeJobs.get(jobId).status = 'error';
      activeJobs.get(jobId).error = 'Link check failed';
    }
  })();

  res.json(ok({ jobId, message: 'Link check started', baseUrl }));
});

// ===========================
// Scheduler
// ===========================

router.get('/scheduler', (req, res) => {
  res.json(ok({ schedules: scheduler.getSchedules() }));
});

router.post('/scheduler', (req, res) => {
  try {
    const schedule = scheduler.addSchedule(req.body);
    res.json(ok({ message: 'Schedule created', schedule }));
  } catch (err) {
    errorHandler(res, err, 'scheduler');
  }
});

router.post('/scheduler/:id/start', (req, res) => {
  const started = scheduler.start(req.params.id);
  res.json(ok({ started }));
});

router.post('/scheduler/:id/stop', (req, res) => {
  const stopped = scheduler.stop(req.params.id);
  res.json(ok({ stopped }));
});

router.delete('/scheduler/:id', (req, res) => {
  scheduler.removeSchedule(req.params.id);
  res.json(ok({ message: 'Schedule removed' }));
});

router.get('/scheduler/:id/history', (req, res) => {
  const limit = parseInt(req.query.limit) || 10;
  res.json(ok({ history: scheduler.getHistory(req.params.id, limit) }));
});

// ===========================
// Job status (shared for all async jobs)
// ===========================

router.get('/jobs/:jobId', (req, res) => {
  const job = activeJobs.get(req.params.jobId);
  if (!job) return res.status(404).json(fail('Job not found'));
  const { results, _createdAt, ...meta } = job;
  res.json(ok(meta));
});

router.get('/jobs/:jobId/results', (req, res) => {
  const job = activeJobs.get(req.params.jobId);
  if (!job) return res.status(404).json(fail('Job not found'));
  if (job.status !== 'completed') return res.json(ok({ status: job.status, error: job.error }));
  res.json(ok(job.results));
});

router.get('/jobs', (req, res) => {
  const jobs = [];
  activeJobs.forEach((job, id) => {
    const { results, _createdAt, ...meta } = job;
    jobs.push({ id, ...meta });
  });
  jobs.sort((a, b) => new Date(b.startTime) - new Date(a.startTime));
  res.json(ok({ jobs }));
});

module.exports = router;
