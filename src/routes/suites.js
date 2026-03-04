'use strict';

const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { SuiteRunner } = require('../agent/suiteRunner');
const { ok, fail } = require('../utils/response');
const { safePath, safeId } = require('../utils/safePath');

const SUITES_DIR = path.join(__dirname, '../../config/suites');
const REPORTS_DIR = path.join(__dirname, '../../reports/suites');
const activeJobs = new Map(); // In-memory job tracking

/**
 * Helper: evict jobs older than 1 hour
 */
function evictStale(jobs) {
  const cutoff = Date.now() - 3600000;
  for (const [id, job] of jobs.entries()) {
    if (job._createdAt < cutoff) jobs.delete(id);
  }
}

/**
 * Analyze suite history from history.jsonl
 * Streams JSONL line-by-line to avoid memory issues on large files
 * @param {string} suiteId - Suite identifier
 * @param {Object} options - { days: 30, limit: 100 }
 * @returns {Promise<Object>} { runs: [], trends: {} }
 */
async function analyzeSuiteHistory(suiteId, options = {}) {
  const historyPath = path.join(REPORTS_DIR, 'history.jsonl');
  if (!fs.existsSync(historyPath)) {
    return { runs: [], trends: null };
  }

  const { days = 30, limit = 100 } = options;
  const cutoff = Date.now() - (days * 24 * 60 * 60 * 1000);
  const runs = [];

  // Stream history.jsonl line by line
  const fileStream = fs.createReadStream(historyPath);
  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity
  });

  try {
    for await (const line of rl) {
      if (!line.trim()) continue;

      try {
        const entry = JSON.parse(line);
        if (entry.suiteId !== suiteId) continue;

        const timestamp = new Date(entry.timestamp).getTime();
        if (timestamp < cutoff) continue;

        runs.push(entry);
        if (runs.length >= limit) break;
      } catch (err) {
        console.error(`[Suites] Invalid JSON line in history.jsonl:`, err.message);
        // Continue processing next line
      }
    }
  } finally {
    rl.close();
    fileStream.destroy();
  }

  // Compute trends if we have enough data
  const trends = runs.length >= 2 ? computeTrends(runs) : null;

  return { runs: runs.reverse(), trends };  // Most recent first
}

/**
 * Compute simple trend metrics from run history
 * @param {Array} runs - Array of history entries
 * @returns {Object} Trend metrics
 */
function computeTrends(runs) {
  const passRates = runs.map(r => r.passRate);
  const durations = runs.map(r => r.duration);

  // Detect flaky runs: passRate between 0 and 100%
  const flakyRuns = runs.filter(r => r.passRate > 0 && r.passRate < 100);

  const average = (arr) => arr.reduce((a, b) => a + b, 0) / arr.length;

  // Simple trend detection via quartile comparison
  const detectTrend = (values) => {
    if (values.length < 8) return 'insufficient-data';
    const quarter = Math.floor(values.length / 4);
    const recent = average(values.slice(-quarter));
    const older = average(values.slice(0, quarter));
    const change = (recent - older) / older;
    if (Math.abs(change) < 0.05) return 'stable';
    return change > 0 ? 'improving' : 'degrading';
  };

  return {
    averagePassRate: Math.round(average(passRates)),
    passRateTrend: detectTrend(passRates),
    averageDuration: Math.round(average(durations)),
    durationTrend: detectTrend(durations),
    flakyTestRate: runs.length > 0 ? Math.round((flakyRuns.length / runs.length) * 100) : 0,
    lastNRuns: runs.slice(-10).map(r => ({
      runId: r.runId,
      status: r.status,
      passRate: r.passRate,
      duration: r.duration,
      timestamp: r.timestamp
    }))
  };
}

/**
 * GET /api/suites
 * List all suite manifests in config/suites/
 */
router.get('/', (req, res) => {
  try {
    if (!fs.existsSync(SUITES_DIR)) {
      return res.json(ok({ suites: [] }));
    }

    const files = fs.readdirSync(SUITES_DIR).filter(f => f.endsWith('.json') && f !== 'suite.schema.json');
    const suites = files.map(f => {
      try {
        const suite = JSON.parse(fs.readFileSync(path.join(SUITES_DIR, f), 'utf8'));
        return {
          id: suite.suite.id,
          name: suite.suite.name,
          tags: suite.suite.tags,
          testCount: suite.tests.length
        };
      } catch (err) {
        console.error(`[Suites] Error reading suite ${f}:`, err.message);
        return null;
      }
    }).filter(Boolean);

    console.log(`[Suites] Listed ${suites.length} suite(s)`);
    res.json(ok({ suites }));
  } catch (err) {
    console.error('[Suites] Error listing suites:', err);
    res.status(500).json(fail(err.message));
  }
});

/**
 * POST /api/suites/:suiteId/run
 * Execute a suite and return runId for async polling
 *
 * Query params: ?tags=smoke,critical (optional), ?dryRun=true (optional)
 */
router.post('/:suiteId/run', async (req, res) => {
  try {
    const { suiteId } = req.params;
    const { tags, dryRun } = req.query;

    // Validate suite exists
    const suitePath = safePath(SUITES_DIR, `${safeId(suiteId)}.json`);
    if (!fs.existsSync(suitePath)) {
      console.log(`[Suites] Suite not found: ${suiteId}`);
      return res.status(404).json(fail(`Suite not found: ${suiteId}`));
    }

    const suite = JSON.parse(fs.readFileSync(suitePath, 'utf8'));
    const runId = new Date().toISOString().replace(/[:.]/g, '-');

    // Create job entry
    evictStale(activeJobs);
    activeJobs.set(runId, {
      type: 'suite',
      suiteId,
      status: 'running',
      startTime: new Date().toISOString(),
      _createdAt: Date.now()
    });

    console.log(`[Suites] Starting suite execution: ${suiteId}, runId: ${runId}`);

    // Async execution
    (async () => {
      const runner = new SuiteRunner(suite, {
        runId,
        tags: tags ? tags.split(',') : [],
        dryRun: dryRun === 'true'
      });

      try {
        const results = await runner.execute();
        activeJobs.get(runId).status = 'completed';
        activeJobs.get(runId).results = results;
        console.log(`[Suites] Suite execution completed: ${suiteId}, status: ${results.status}`);
      } catch (err) {
        console.error(`[Suites] Suite execution failed: ${suiteId}`, err);
        activeJobs.get(runId).status = 'error';
        activeJobs.get(runId).error = err.message;
      }
    })();

    res.json(ok({ runId, suiteId, message: 'Suite execution started' }));
  } catch (err) {
    console.error('[Suites] Error starting suite:', err);
    res.status(500).json(fail(err.message));
  }
});

/**
 * GET /api/suites/:suiteId/runs/:runId/results
 * Retrieve results for a specific suite run
 */
router.get('/:suiteId/runs/:runId/results', (req, res) => {
  try {
    const { suiteId, runId } = req.params;

    // Check activeJobs first (recent runs)
    const job = activeJobs.get(runId);
    if (job) {
      if (job.status === 'completed') {
        console.log(`[Suites] Retrieved results from active job: ${runId}`);
        return res.json(ok(job.results));
      } else if (job.status === 'running') {
        return res.json(ok({ status: 'running', message: 'Suite still executing' }));
      } else {
        return res.status(500).json(fail(job.error || 'Suite execution failed'));
      }
    }

    // Check filesystem for historical results
    const resultsPath = safePath(REPORTS_DIR, safeId(suiteId), runId, 'summary.json');
    if (!fs.existsSync(resultsPath)) {
      console.log(`[Suites] Results not found: ${suiteId}/${runId}`);
      return res.status(404).json(fail(`Results not found for run: ${runId}`));
    }

    const results = JSON.parse(fs.readFileSync(resultsPath, 'utf8'));
    console.log(`[Suites] Retrieved historical results: ${suiteId}/${runId}`);
    res.json(ok(results));
  } catch (err) {
    console.error('[Suites] Error retrieving results:', err);
    res.status(500).json(fail(err.message));
  }
});

/**
 * POST /api/suites/:suiteId/runs/:runId/replay
 * Replay a historical run with new runId
 */
router.post('/:suiteId/runs/:runId/replay', async (req, res) => {
  try {
    const { suiteId, runId } = req.params;

    // Validate IDs to prevent path traversal
    safeId(suiteId);
    safeId(runId);

    console.log(`[Suites] Starting replay: ${suiteId}/${runId}`);

    // Create new job for replay
    const newRunId = new Date().toISOString().replace(/[:.]/g, '-');
    evictStale(activeJobs);
    activeJobs.set(newRunId, {
      type: 'suite-replay',
      suiteId,
      originalRunId: runId,
      status: 'running',
      startTime: new Date().toISOString(),
      _createdAt: Date.now()
    });

    // Async replay execution (IIFE pattern from existing routes)
    (async () => {
      try {
        const results = await SuiteRunner.replayRun(suiteId, runId);
        const job = activeJobs.get(newRunId);
        if (job) {  // Guard against eviction
          job.status = 'completed';
          job.results = results;
          console.log(`[Suites] Replay completed: ${newRunId}`);
        }
      } catch (err) {
        console.error(`[Suites] Replay failed:`, err);
        const job = activeJobs.get(newRunId);
        if (job) {  // Guard against eviction
          job.status = 'error';
          job.error = err.message;
        }
      }
    })();

    res.json(ok({
      newRunId,
      suiteId,
      originalRunId: runId,
      message: 'Suite replay started'
    }));
  } catch (err) {
    console.error('[Suites] Error starting replay:', err);
    res.status(500).json(fail('Failed to start replay'));
  }
});

/**
 * GET /api/suites/:suiteId/runs
 * List all historical runs for a suite (from directory listing)
 */
router.get('/:suiteId/runs', (req, res) => {
  try {
    const { suiteId } = req.params;
    const suiteReportsDir = safePath(REPORTS_DIR, safeId(suiteId));

    if (!fs.existsSync(suiteReportsDir)) {
      console.log(`[Suites] No runs found for suite: ${suiteId}`);
      return res.json(ok({ runs: [] }));
    }

    const runDirs = fs.readdirSync(suiteReportsDir, { withFileTypes: true })
      .filter(d => d.isDirectory())
      .map(d => d.name)
      .sort()
      .reverse(); // Most recent first

    const runs = runDirs.map(runId => {
      const summaryPath = path.join(suiteReportsDir, runId, 'summary.json');
      if (!fs.existsSync(summaryPath)) return null;

      try {
        const summary = JSON.parse(fs.readFileSync(summaryPath, 'utf8'));
        return {
          runId: summary.runId,
          status: summary.status,
          duration: summary.duration,
          passRate: summary.summary.total > 0
            ? summary.summary.passed / summary.summary.total
            : 0,
          timestamp: summary.startTime
        };
      } catch (err) {
        console.error(`[Suites] Error reading run summary ${runId}:`, err.message);
        return null;
      }
    }).filter(Boolean);

    console.log(`[Suites] Listed ${runs.length} run(s) for suite: ${suiteId}`);
    res.json(ok({ runs }));
  } catch (err) {
    console.error('[Suites] Error listing runs:', err);
    res.status(500).json(fail(err.message));
  }
});

/**
 * GET /api/suites/:suiteId/history
 * Get trend analysis from history.jsonl
 * Query params: ?days=30 (optional), ?limit=100 (optional)
 */
router.get('/:suiteId/history', async (req, res) => {
  try {
    const { suiteId } = req.params;

    // Validate suiteId to prevent path traversal
    safeId(suiteId);

    // Validate and clamp query parameters
    const rawDays = parseInt(req.query.days) || 30;
    const rawLimit = parseInt(req.query.limit) || 100;
    const days = Math.min(Math.max(rawDays, 1), 365);  // 1-365 days
    const limit = Math.min(Math.max(rawLimit, 1), 1000);  // 1-1000 runs

    console.log(`[Suites] Analyzing history for: ${suiteId} (${days} days, limit ${limit})`);

    const history = await analyzeSuiteHistory(suiteId, {
      days,
      limit
    });

    res.json(ok(history));
  } catch (err) {
    console.error('[Suites] Error analyzing history:', err);
    res.status(500).json(fail(err.message));
  }
});

module.exports = router;
