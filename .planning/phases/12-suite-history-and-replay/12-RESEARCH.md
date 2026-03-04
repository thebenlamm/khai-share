# Phase 12: Suite History and Replay - Research

**Researched:** 2026-03-04
**Domain:** Test suite replay functionality and historical trend analysis from JSONL logs
**Confidence:** HIGH

## Summary

Phase 12 completes the suite management lifecycle by enabling replay of historical test runs and trend analysis from the `history.jsonl` log. This closes the gap where Phase 9 created suite execution infrastructure but lacked history consumption capabilities.

The implementation leverages existing `SuiteRunner` class and filesystem-based results storage. Replay means "re-execute a previously run suite configuration" rather than "play back recorded results." History trend analysis reads the newline-delimited JSON log to detect pass rate trends, flaky tests (failures followed by passes), and performance degradation over time.

**Primary recommendation:** Add `replayRun(runId)` method to SuiteRunner that loads historical suite config from `reports/suites/{suiteId}/{runId}/summary.json` and re-executes with a new runId. Add history analysis endpoint that reads `history.jsonl` and computes trends (pass rate over time, duration trends, last N runs summary) using simple streaming JSONL parsing without external dependencies.

## Phase Requirements

<phase_requirements>
| ID | Description | Research Support |
|----|-------------|------------------|
| SUITE-08 | API endpoint GET /api/suites/:suiteId/runs/:runId/results retrieves aggregated results | History endpoint reads from summary.json (already saved by Phase 9) |
| SUITE-09 | Suite results stored in reports/suites/{suiteId}/{runId}/ with summary.json and per-test outputs | Directory structure created by SuiteRunner._saveResults() (Phase 9 complete) |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Node.js fs | Built-in | Read history.jsonl, load historical suite configs | Native filesystem operations, streaming support |
| SuiteRunner | Existing | Re-execute historical suite configurations | Already implements schema validation, test orchestration, result aggregation |
| Express.js | Existing | API endpoints for replay and history | Already used throughout Khai API routes |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| readline | Built-in | Streaming JSONL parsing for large history files | Process history.jsonl line-by-line without loading entire file into memory |
| JSON.parse | Built-in | Parse individual JSONL lines | Each line is valid JSON object |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Streaming readline | Load entire file with fs.readFileSync | Simple but fails on large history files (>10MB); streaming supports unlimited growth |
| Re-execute suite | Return cached results | Replay means "run again with same config" not "show old results"; re-execution validates current system state |
| Simple stats | Advanced analytics (moving averages, anomaly detection) | Over-engineering for v1; basic trends (pass rate, duration, flaky tests) provide 80% value |

**Installation:**
```bash
# No new dependencies needed - uses Node.js built-ins
```

## Architecture Patterns

### Recommended Project Structure
```
src/
├── agent/
│   └── suiteRunner.js         # Extended with replayRun() static method
src/routes/
├── suites.js                  # Add replay and history endpoints
reports/
├── suites/
│   ├── history.jsonl          # Newline-delimited JSON (Phase 9 creates)
│   └── {suiteId}/
│       └── {runId}/
│           └── summary.json   # Contains original suite config
```

### Pattern 1: Replay Suite from Historical Run
**What:** Load historical suite configuration and re-execute with new runId
**When to use:** User wants to validate current system against previous test configuration
**Example:**
```javascript
// Source: Extended from existing SuiteRunner (src/agent/suiteRunner.js)
class SuiteRunner {
  // Existing execute() method unchanged

  /**
   * Static method to replay a historical run
   * @param {string} suiteId - Suite identifier
   * @param {string} runId - Historical run identifier
   * @returns {Promise<Object>} New run results with new runId
   */
  static async replayRun(suiteId, runId) {
    // Load historical summary to get original suite config
    const summaryPath = path.join(SUITES_REPORTS_DIR, suiteId, runId, 'summary.json');
    if (!fs.existsSync(summaryPath)) {
      throw new Error(`Historical run not found: ${suiteId}/${runId}`);
    }

    const summary = JSON.parse(fs.readFileSync(summaryPath, 'utf8'));

    // Reconstruct suite manifest from summary
    // Note: summary.json stores original suite config for replay
    const suite = {
      suite: {
        id: summary.suiteId,
        name: summary.suiteName,
        version: summary.suiteVersion,
        timeout: summary.suite?.timeout || 300000
      },
      tests: summary.tests.map(t => ({
        type: t.type,
        role: t.role,
        config: t.config,
        tags: t.tags,
        critical: t.critical
      }))
    };

    // Execute with new runId
    const newRunId = new Date().toISOString().replace(/[:.]/g, '-');
    const runner = new SuiteRunner(suite, {
      runId: newRunId,
      tags: summary.tags,  // Preserve original tag filter
      dryRun: false
    });

    return await runner.execute();
  }
}
```

### Pattern 2: Stream History JSONL for Trend Analysis
**What:** Read history.jsonl line-by-line to compute trends without loading entire file
**When to use:** Analyze suite execution history for pass rate trends, flaky tests, performance degradation
**Example:**
```javascript
// Source: Node.js readline streaming pattern
const readline = require('readline');
const fs = require('fs');

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

  for await (const line of rl) {
    if (!line.trim()) continue;

    const entry = JSON.parse(line);
    if (entry.suiteId !== suiteId) continue;

    const timestamp = new Date(entry.timestamp).getTime();
    if (timestamp < cutoff) continue;

    runs.push(entry);
    if (runs.length >= limit) break;
  }

  // Compute trends
  const trends = computeTrends(runs);

  return { runs: runs.reverse(), trends };  // Most recent first
}

function computeTrends(runs) {
  if (runs.length < 2) return null;

  const passRates = runs.map(r => r.passRate);
  const durations = runs.map(r => r.duration);

  // Detect flaky tests: runs with passRate between 0 and 100%
  const flakyRuns = runs.filter(r => r.passRate > 0 && r.passRate < 100);

  return {
    averagePassRate: average(passRates),
    passRateTrend: trend(passRates),  // 'improving', 'stable', 'degrading'
    averageDuration: average(durations),
    durationTrend: trend(durations),
    flakyTestRate: flakyRuns.length / runs.length,
    lastNRuns: runs.slice(-10).map(r => ({
      runId: r.runId,
      status: r.status,
      passRate: r.passRate,
      duration: r.duration
    }))
  };
}

function average(values) {
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function trend(values) {
  // Simple linear trend: compare last 25% vs first 25%
  const quarter = Math.floor(values.length / 4);
  const recent = average(values.slice(-quarter));
  const older = average(values.slice(0, quarter));

  const change = (recent - older) / older;
  if (Math.abs(change) < 0.05) return 'stable';
  return change > 0 ? 'improving' : 'degrading';
}
```

### Pattern 3: API Endpoints for Replay and History
**What:** Express routes to trigger replay and fetch trend data
**When to use:** Enable programmatic access to replay and history analysis
**Example:**
```javascript
// Source: Extended from src/routes/suites.js pattern

/**
 * POST /api/suites/:suiteId/runs/:runId/replay
 * Replay a historical run with new runId
 */
router.post('/:suiteId/runs/:runId/replay', async (req, res) => {
  try {
    const { suiteId, runId } = req.params;

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

    // Async replay execution
    (async () => {
      try {
        const results = await SuiteRunner.replayRun(suiteId, runId);
        activeJobs.get(newRunId).status = 'completed';
        activeJobs.get(newRunId).results = results;
        console.log(`[Suites] Replay completed: ${newRunId}`);
      } catch (err) {
        console.error(`[Suites] Replay failed:`, err);
        activeJobs.get(newRunId).status = 'error';
        activeJobs.get(newRunId).error = err.message;
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
    const { days = 30, limit = 100 } = req.query;

    console.log(`[Suites] Analyzing history for: ${suiteId} (${days} days, limit ${limit})`);

    const history = await analyzeSuiteHistory(suiteId, {
      days: parseInt(days),
      limit: parseInt(limit)
    });

    res.json(ok(history));
  } catch (err) {
    console.error('[Suites] Error analyzing history:', err);
    res.status(500).json(fail(err.message));
  }
});
```

### Anti-Patterns to Avoid
- **Loading entire history.jsonl into memory** — Use streaming (readline) for files that grow unbounded
- **Caching old results as "replay"** — Replay should re-execute tests to validate current system state, not return stale data
- **Complex statistical models** — Start with simple trends (average, last N runs, flaky test rate); avoid over-engineering
- **No suite config in summary.json** — Must store original suite manifest in summary.json to enable replay without relying on config/suites/ (which may be modified)

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| JSONL parsing | Custom line splitter with state machine | readline module (built-in) | readline handles edge cases (partial reads, line endings, buffering) |
| Trend detection | Statistical libraries (simple-statistics, mathjs) | Simple average + quartile comparison | Over-engineering for basic trends; 10 lines of code vs new dependency |
| Result caching | Redis/in-memory cache for history queries | Stream on-demand | History queries are infrequent; caching adds complexity for negligible gain |
| Suite versioning | semver library for version comparison | Store version string, let users manage | Suite versions are informational metadata, not runtime dependencies |

**Key insight:** Phase 12 is about *data consumption* from Phase 9's JSONL log. Use built-in streaming primitives (readline) and simple math (average, quartile comparison) rather than external libraries. Replay leverages existing SuiteRunner with no modifications to test execution logic.

## Common Pitfalls

### Pitfall 1: Loading Large History Files into Memory
**What goes wrong:** `fs.readFileSync(history.jsonl).split('\n')` fails on 50MB+ history files with OOM errors
**Why it happens:** Synchronous file reads load entire file into memory before processing
**How to avoid:** Use readline streaming (built-in) to process line-by-line with constant memory
**Warning signs:** History endpoint timeouts, Node.js heap errors on large deployments

### Pitfall 2: Replay Without Re-Execution
**What goes wrong:** "Replay" endpoint returns cached results from original run instead of re-running tests
**Why it happens:** Confusion between "replay results" (show old data) vs "replay run" (execute again)
**How to avoid:** Clearly document: replay = re-execute with same config but new runId; use separate `/results` endpoint for historical data
**Warning signs:** Replay returns identical timestamps, doesn't catch regressions introduced after original run

### Pitfall 3: Missing Suite Config in Historical Runs
**What goes wrong:** Replay fails because `config/suites/{suiteId}.json` was modified or deleted after historical run
**Why it happens:** Replay depends on current suite manifest instead of archived config from original run
**How to avoid:** Store full suite manifest in summary.json (not just metadata) so replay can reconstruct from history alone
**Warning signs:** "Suite not found" errors on replay when suite manifest changed or removed

### Pitfall 4: Trend Analysis Without Time Bounds
**What goes wrong:** History query processes entire JSONL file (years of data) causing 30+ second response times
**Why it happens:** No default time window; query reads every line looking for suiteId match
**How to avoid:** Default to last 30 days + limit to 100 runs; add timestamp index or break after limit reached
**Warning signs:** Slow history endpoint, CPU spikes on history queries

### Pitfall 5: Ignoring JSONL Corruption
**What goes wrong:** One malformed JSON line crashes entire history analysis
**Why it happens:** No error handling around JSON.parse() during streaming
**How to avoid:** Wrap JSON.parse() in try-catch per line, log warning, skip invalid lines
**Warning signs:** History endpoint returns 500 error after partial history.jsonl corruption

## Code Examples

Verified patterns from official sources:

### Streaming JSONL with Readline
```javascript
// Source: Node.js readline documentation
// https://nodejs.org/api/readline.html#example-read-file-stream-line-by-line
const readline = require('readline');
const fs = require('fs');

async function processLineByLine(filePath) {
  const fileStream = fs.createReadStream(filePath);
  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity  // Treat \r\n as single line break
  });

  const results = [];
  for await (const line of rl) {
    try {
      if (!line.trim()) continue;  // Skip empty lines
      const entry = JSON.parse(line);
      results.push(entry);
    } catch (err) {
      console.error(`Invalid JSON line: ${line}`, err.message);
      // Continue processing next line
    }
  }

  return results;
}
```

### Preserving Suite Config for Replay
```javascript
// Source: Extend existing SuiteRunner._saveResults() from Phase 9
// Add full suite config to summary.json

_saveResults(results) {
  const suiteId = this.suite.suite.id;
  const runDir = path.join(SUITES_REPORTS_DIR, suiteId, this.runId);

  fs.mkdirSync(runDir, { recursive: true });

  // Include original suite manifest for replay
  const summaryWithConfig = {
    ...results,
    suite: this.suite.suite,  // Full suite metadata
    originalTests: this.suite.tests  // Original test definitions (before execution)
  };

  const summaryPath = path.join(runDir, 'summary.json');
  fs.writeFileSync(summaryPath, JSON.stringify(summaryWithConfig, null, 2));

  // Append to history.jsonl (unchanged from Phase 9)
  const historyPath = path.join(SUITES_REPORTS_DIR, 'history.jsonl');
  const historyEntry = {
    runId: this.runId,
    suiteId,
    suiteName: results.suiteName,
    status: results.status,
    duration: results.duration,
    passRate: results.summary.passRate,
    timestamp: results.startTime,
    tags: this.tags
  };
  fs.appendFileSync(historyPath, JSON.stringify(historyEntry) + '\n');
}
```

### Simple Trend Detection
```javascript
// Source: Statistical trend analysis basics
// No external libraries needed for simple quartile comparison

function detectTrend(values) {
  if (values.length < 8) {
    return 'insufficient-data';  // Need at least 8 points for quartile comparison
  }

  // Compare recent quarter vs older quarter
  const quarterSize = Math.floor(values.length / 4);
  const recentQuarter = values.slice(-quarterSize);
  const olderQuarter = values.slice(0, quarterSize);

  const recentAvg = recentQuarter.reduce((a, b) => a + b, 0) / recentQuarter.length;
  const olderAvg = olderQuarter.reduce((a, b) => a + b, 0) / olderQuarter.length;

  const percentChange = ((recentAvg - olderAvg) / olderAvg) * 100;

  // 5% threshold for "stable" to avoid noise
  if (Math.abs(percentChange) < 5) return 'stable';
  return percentChange > 0 ? 'improving' : 'degrading';
}

// Usage for pass rate trend
const passRates = runs.map(r => r.passRate * 100);  // Convert to percentage
const trend = detectTrend(passRates);
// Returns: 'improving', 'stable', 'degrading', or 'insufficient-data'
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Replay = show cached results | Replay = re-execute with original config | Test frameworks (Jest, Pytest) 2018+ | Validates current system state, catches regressions introduced after original run |
| Load entire log file | Stream with readline | Node.js best practices 2015+ | Supports unlimited history growth, constant memory usage |
| Complex anomaly detection | Simple trend comparison (quartiles) | Testing tool UX research | 80% value with 10 lines of code vs complex models that confuse users |
| Store only metadata | Store full config for replay | Chrome DevTools Recorder 2021 | Enables replay even after config files modified or deleted |

**Deprecated/outdated:**
- **Returning old results as "replay"**: Misleads users into thinking system is tested when data is stale
- **No time bounds on history queries**: Causes performance issues as history grows; modern APIs default to last 30 days
- **External statistics libraries for basic trends**: Over-engineering when simple average/quartile comparison suffices

## Open Questions

1. **Should replay preserve original tag filters?**
   - What we know: Original run may have used `?tags=smoke` to filter tests
   - What's unclear: Whether replay should honor original filter or allow new filter
   - Recommendation: Preserve original tags by default, allow override via query param `?tags=` (empty = run all tests)

2. **How to handle missing test modules during replay?**
   - What we know: Original run used "animation" test type, but module was later removed
   - What's unclear: Should replay fail or skip missing test types
   - Recommendation: Skip with warning, add "skipped-unsupported" status to results

3. **What retention policy for history.jsonl?**
   - What we know: Append-only JSONL grows unbounded; 1 run/hour = 8.7k entries/year
   - What's unclear: When to archive old entries, how to compress
   - Recommendation: Phase 12 implements basic trend analysis; retention is future phase (rotate after 90 days or 10MB)

4. **Should history include test-level details?**
   - What we know: history.jsonl currently stores suite-level summary (pass rate, duration)
   - What's unclear: Whether to include per-test pass/fail for flaky test detection
   - Recommendation: Phase 12 uses suite-level data only; flaky test detection is future enhancement requiring test-level history

## Validation Architecture

> Validation section included per .planning/config.json workflow.nyquist_validation (default: enabled)

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Manual smoke testing via curl (no automated test framework for Phase 12) |
| Config file | None — manual API endpoint testing |
| Quick run command | `curl http://localhost:3001/api/suites/homebay-smoke/history` |
| Full suite command | Manual test script: `scripts/test-suite-replay.sh` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| SUITE-08 | GET /api/suites/:suiteId/runs/:runId/results retrieves aggregated results | integration | Manual: `curl http://localhost:3001/api/suites/homebay-smoke/runs/{runId}/results` | ✅ Route exists (Phase 9) |
| SUITE-09 | Suite results stored in reports/suites/{suiteId}/{runId}/ with summary.json | integration | Manual: `ls -la reports/suites/{suiteId}/{runId}/` | ✅ Directory created by SuiteRunner (Phase 9) |

### Sampling Rate
- **Per task commit:** Manual curl test (replay + history endpoints)
- **Per wave merge:** Manual verification: run suite → replay → compare results → query history
- **Phase gate:** Full integration test (smoke suite + replay + history analysis with 10+ historical runs)

### Wave 0 Gaps
- [ ] `scripts/test-suite-replay.sh` — manual smoke test script for replay and history endpoints
- [ ] Update `src/agent/suiteRunner.js` — add static `replayRun()` method
- [ ] Update `_saveResults()` — include full suite config in summary.json for replay support

*(Phase 12 builds on Phase 9 infrastructure; no new test framework needed)*

## Sources

### Primary (HIGH confidence)
- [Node.js readline documentation](https://nodejs.org/docs/latest/api/readline.html) - Streaming line-by-line parsing for JSONL
- [Khai existing codebase](file:///workspace/src/) - SuiteRunner class, suites.js routes, Phase 9 implementation patterns
- [Phase 9 Research](file:///workspace/.planning/phases/09-saved-test-suites-with-replay/09-RESEARCH.md) - Suite manifest structure, history.jsonl format

### Secondary (MEDIUM confidence)
- [JSONL specification](https://jsonlines.org/) - Newline-delimited JSON format best practices
- [Test replay patterns](https://jestjs.io/docs/cli#--onlychanged) - Jest/Pytest replay semantics (re-execute vs show cached)
- [Trend analysis basics](https://www.statisticshowto.com/probability-and-statistics/statistics-definitions/trend-analysis/) - Simple quartile comparison for trend detection

### Tertiary (LOW confidence)
- General test analytics tools (TestRail, Allure) - UI patterns for history visualization (not applicable to API-only Phase 12)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - Uses Node.js built-ins (readline, fs), no new dependencies
- Architecture: HIGH - Extends existing SuiteRunner and suites.js patterns from Phase 9
- Pitfalls: HIGH - Based on real-world JSONL streaming patterns and test replay semantics
- Code examples: HIGH - Derived from Node.js official docs and existing Khai patterns

**Research date:** 2026-03-04
**Valid until:** 2026-06-04 (90 days - suite replay patterns are stable)
