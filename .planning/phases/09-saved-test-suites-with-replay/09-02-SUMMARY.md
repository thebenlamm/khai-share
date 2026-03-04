---
phase: 09-saved-test-suites-with-replay
plan: 02
subsystem: test-orchestration
tags: [api-routes, suite-execution, async-jobs]
dependencies:
  requires: [09-01]
  provides: [suite-api-endpoints, async-execution-tracking]
  affects: [mcp-server, cli-tools]
tech_stack:
  added: []
  patterns: [async-job-pattern, ok-fail-envelope, safePath-validation]
key_files:
  created: [src/routes/suites.js]
  modified: [src/server.js]
decisions: []
metrics:
  duration_min: 1
  tasks_completed: 2
  files_modified: 2
  commits: 2
  completed_at: "2026-03-04T15:07:47Z"
---

# Phase 09 Plan 02: Suite API Routes Summary

**One-liner:** Express API routes enabling async suite execution, result polling, and historical run queries with in-memory job tracking and filesystem persistence

## What Was Built

Created HTTP API surface for executing saved test suites and retrieving results. Implemented 4 REST endpoints that wire the SuiteRunner class to Express, enabling remote suite execution via API calls with async job tracking.

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/suites` | List all suite manifests from config/suites/ |
| POST | `/api/suites/:suiteId/run` | Start suite execution, return runId for polling |
| GET | `/api/suites/:suiteId/runs/:runId/results` | Retrieve results (activeJobs or filesystem) |
| GET | `/api/suites/:suiteId/runs` | List historical runs for a suite |

**Query parameters for POST /run:**
- `?tags=smoke,critical` - Filter tests by tags
- `?dryRun=true` - Enable dry-run mode

## Integration Points

**SuiteRunner Integration:**
- Import and instantiate SuiteRunner with suite manifest, runId, tags, dryRun options
- Execute asynchronously via IIFE, track status in activeJobs Map
- Results stored in reports/suites/{suiteId}/{runId}/summary.json

**Async Job Pattern:**
- In-memory activeJobs Map tracks running/completed jobs
- 1-hour TTL with automatic eviction of stale entries
- Supports both hot-path (activeJobs) and cold-path (filesystem) result retrieval
- Follows existing Khai pattern from src/routes/advanced.js

**Security:**
- safePath validation prevents directory traversal attacks
- safeId validation ensures only alphanumeric IDs accepted
- Schema validation delegated to SuiteRunner (ajv)

## Technical Decisions

**Historical results fallback:**
Results checked in activeJobs first (O(1) lookup), then filesystem. Enables long-term result storage beyond 1-hour TTL without database.

**RunId format:**
ISO timestamp with colons/dots replaced by hyphens (e.g., `2026-03-04T15-06-27-123Z`). Safe for filesystem paths, sortable chronologically.

**Error handling:**
404 for missing suites/results, 500 for execution errors. Running jobs return `{ status: 'running' }` not 404.

## Deviations from Plan

None - plan executed exactly as written.

## Verification Results

**Syntax validation:** Passed
```bash
$ node -c src/routes/suites.js
# (no output = success)
```

**Router export:** Passed
```bash
$ node -e "const r = require('./src/routes/suites'); console.log(typeof r);"
function
```

**Route registration:** Passed
```bash
$ grep "app.use('/api/suites'" src/server.js
63:app.use('/api/suites', suiteRoutes);
```

## Commits

| Hash | Message |
|------|---------|
| 89b72f4 | feat(09-02): add suite API routes with async execution and result retrieval |
| d900f3d | feat(09-02): register suite routes in Express server |

## Next Steps

Phase 09 complete - users can now:
1. List available suite manifests via GET /api/suites
2. Execute suites with optional tag filtering via POST /api/suites/:suiteId/run
3. Poll for results via GET /api/suites/:suiteId/runs/:runId/results
4. Query historical runs via GET /api/suites/:suiteId/runs

**Integration opportunities:**
- MCP server can expose suite execution as tool for Claude
- CLI wrapper script for one-command suite runs
- Web UI for suite management (already has API contract)
- CI/CD integration via API endpoints

**Example usage:**
```bash
# List available suites
curl http://localhost:3001/api/suites

# Run homebay-smoke suite with smoke tag filter
curl -X POST http://localhost:3001/api/suites/homebay-smoke/run?tags=smoke

# Poll for results
curl http://localhost:3001/api/suites/homebay-smoke/runs/{runId}/results

# List all historical runs
curl http://localhost:3001/api/suites/homebay-smoke/runs
```

## Self-Check: PASSED

**Created files verification:**
```bash
$ [ -f "src/routes/suites.js" ] && echo "FOUND: src/routes/suites.js" || echo "MISSING: src/routes/suites.js"
FOUND: src/routes/suites.js
```

**Modified files verification:**
```bash
$ git diff HEAD~2 --name-only
src/routes/suites.js
src/server.js
```

**Commits verification:**
```bash
$ git log --oneline --all | grep -q "89b72f4" && echo "FOUND: 89b72f4" || echo "MISSING: 89b72f4"
FOUND: 89b72f4
$ git log --oneline --all | grep -q "d900f3d" && echo "FOUND: d900f3d" || echo "MISSING: d900f3d"
FOUND: d900f3d
```

All files created, commits exist, plan completed successfully.
