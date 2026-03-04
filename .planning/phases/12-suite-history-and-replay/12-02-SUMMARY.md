---
phase: 12-suite-history-and-replay
plan: 02
subsystem: suite-api
tags: [api, history, replay, streaming, trends]
dependency-graph:
  requires: [SUITE-08, SUITE-09]
  provides: [SUITE-REPLAY-API, SUITE-HISTORY-API]
  affects: [suites-routes]
tech-stack:
  added: [readline-module]
  patterns: [streaming-jsonl, async-job-pattern, trend-analysis]
key-files:
  created: []
  modified:
    - src/routes/suites.js: Added replay and history endpoints with streaming analysis
decisions:
  - Use readline streaming for history.jsonl to prevent memory issues on large files
  - Default to 30 days and 100 runs limit to prevent slow queries
  - Quartile comparison for trend detection (requires 8+ data points)
  - Skip invalid JSON lines with warning (non-fatal)
  - Return null trends for insufficient data (<2 runs)
metrics:
  duration: 92
  completed: 2026-03-04T17:30:53Z
  tasks: 2
  files: 1
  commits: 2
---

# Phase 12 Plan 02: Suite Replay and History API Summary

**One-liner:** Added replay triggering and streaming history trend analysis endpoints to suite API router.

## Objective Achieved

Added two new Express routes for programmatic access to suite replay and history trend analysis:

1. **POST /api/suites/:suiteId/runs/:runId/replay** - Triggers replay of historical run and returns new runId
2. **GET /api/suites/:suiteId/history** - Streams history.jsonl and returns trend analysis with pass rate, duration, and flaky test detection

Both endpoints integrated into existing suite API router with consistent async job pattern and response envelope.

## Implementation Details

### Task 1: Replay Endpoint

Added POST endpoint after existing results endpoint (line ~154) that:
- Creates new job with type 'suite-replay' in activeJobs map
- Calls `SuiteRunner.replayRun(suiteId, runId)` asynchronously using IIFE pattern
- Returns newRunId immediately for polling via existing GET results endpoint
- Tracks originalRunId in job metadata for traceability

**Commit:** ddd7b7f

### Task 2: History Endpoint with Streaming

Added three components:

1. **readline import** - Node.js streaming module for line-by-line parsing
2. **analyzeSuiteHistory() helper** - Async function that:
   - Streams history.jsonl line-by-line to avoid loading entire file into memory
   - Filters by suiteId and time range (configurable days)
   - Limits results to prevent slow queries (configurable limit)
   - Returns { runs: [], trends: null } for empty history
3. **computeTrends() helper** - Calculates:
   - Average pass rate and trend direction (improving/stable/degrading/insufficient-data)
   - Average duration and trend direction
   - Flaky test rate (tests with 0% < passRate < 100%)
   - Last 10 runs summary with status, passRate, duration, timestamp
4. **GET /:suiteId/history endpoint** - Parses query params (?days=30, ?limit=100) and returns analyzed history

**Commit:** 5159231

## API Documentation

### POST /api/suites/:suiteId/runs/:runId/replay

Replay a historical suite run with a new runId.

**Request:**
```bash
curl -X POST http://localhost:3001/api/suites/homebay-smoke/runs/2026-03-04T15-06-27-123Z/replay
```

**Response:**
```json
{
  "success": true,
  "data": {
    "newRunId": "2026-03-04T17-30-45-678Z",
    "suiteId": "homebay-smoke",
    "originalRunId": "2026-03-04T15-06-27-123Z",
    "message": "Suite replay started"
  }
}
```

**Polling:** Use existing GET /api/suites/:suiteId/runs/:runId/results with newRunId to check status and retrieve results.

### GET /api/suites/:suiteId/history

Get trend analysis from history.jsonl with optional filters.

**Query Parameters:**
- `days` (optional, default: 30) - Number of days to analyze
- `limit` (optional, default: 100) - Maximum number of runs to return

**Request:**
```bash
curl "http://localhost:3001/api/suites/homebay-smoke/history?days=30&limit=10"
```

**Response (with data):**
```json
{
  "success": true,
  "data": {
    "runs": [
      {
        "runId": "2026-03-04T16-12-45-789Z",
        "suiteId": "homebay-smoke",
        "suiteName": "HomeBay Smoke Tests",
        "status": "failed",
        "duration": 42156,
        "passRate": 66,
        "timestamp": "2026-03-04T16:12:45.789Z",
        "tags": ["smoke"]
      }
    ],
    "trends": {
      "averagePassRate": 83,
      "passRateTrend": "degrading",
      "averageDuration": 90245,
      "durationTrend": "stable",
      "flakyTestRate": 25,
      "lastNRuns": [
        {
          "runId": "2026-03-04T16-12-45-789Z",
          "status": "failed",
          "passRate": 66,
          "duration": 42156,
          "timestamp": "2026-03-04T16:12:45.789Z"
        }
      ]
    }
  }
}
```

**Response (empty history):**
```json
{
  "success": true,
  "data": {
    "runs": [],
    "trends": null
  }
}
```

## Streaming Implementation Notes

### Memory Efficiency

Uses Node.js `readline` module with `createReadStream()` for constant memory usage regardless of history file size:

```javascript
const fileStream = fs.createReadStream(historyPath);
const rl = readline.createInterface({
  input: fileStream,
  crlfDelay: Infinity
});

for await (const line of rl) {
  // Process line-by-line
}
```

**Benefits:**
- Prevents memory issues on 50MB+ history files
- Early termination when limit reached
- Skips invalid JSON lines without failing entire request

### Trend Detection Algorithm

**Quartile comparison method:**
1. Requires minimum 8 data points for statistical validity
2. Compares recent quarter average to oldest quarter average
3. Returns 'insufficient-data' if <8 runs
4. Returns 'stable' if change <5%
5. Returns 'improving' or 'degrading' based on direction

**Flaky test detection:**
- Identifies runs with 0% < passRate < 100%
- Calculates percentage of total runs that were flaky
- Helps identify unstable test suites

## Known Limitations

1. **Trend accuracy** - Simple quartile comparison may not detect complex patterns; sufficient for MVP
2. **Time range filtering** - Filters by timestamp cutoff, not by number of days in actual data; acceptable for configured limits
3. **History.jsonl format dependency** - Assumes Phase 09 history format; breaking changes require migration
4. **In-memory runs array** - Limited by configured limit (default 100); intentional to prevent slow queries

## Deviations from Plan

None - plan executed exactly as written.

## Testing Recommendations

1. **Replay endpoint:**
   - Test with valid runId from existing history
   - Test with non-existent runId (should fail gracefully)
   - Verify newRunId is pollable via existing results endpoint

2. **History endpoint:**
   - Test with suite that has no history (should return empty structure)
   - Test with various days and limit parameters
   - Test with history.jsonl containing invalid JSON lines
   - Verify trend calculations with known test data

3. **Streaming behavior:**
   - Create large history.jsonl (1000+ lines) and verify memory usage stays constant
   - Verify early termination when limit reached

## Self-Check: PASSED

**Created files:** None (modified existing file only)

**Modified files:**
- [x] src/routes/suites.js exists and contains both endpoints

**Commits:**
- [x] ddd7b7f exists (replay endpoint)
- [x] 5159231 exists (history endpoint)

All verification checks passed. Both endpoints integrated successfully into existing routes file.
