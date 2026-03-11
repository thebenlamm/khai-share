---
phase: 21-regression-detection
plan: 02
subsystem: api
tags: [regression-detection, crawl, webhook, baselines]

# Dependency graph
requires:
  - phase: 21-01
    provides: detectRegressions pure function in src/agent/regressionDetector.js
  - phase: 20-02
    provides: BaselineManager singleton with getBaselineForSite() in src/routes/baselines.js
provides:
  - Automatic regression detection on every successful crawl completion
  - results.regressions field in GET /api/test/:testId/results response
  - Regression data in webhook payloads for crawl completion
affects: [mcp-tools, webhook-consumers]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Integration: require module + call at completion boundary, not inline in route handler"
    - "Defensive integration: regression errors caught and logged, non-fatal, null fallback"

key-files:
  created: []
  modified:
    - src/routes/api.js

key-decisions:
  - "Regression detection placed before completedTests.set and writeFileSync so saved report, in-memory map, and webhook payload all include regressions in one assignment"
  - "login-failed and error paths explicitly excluded — no valid pages array to compare"
  - "Detection errors are caught and logged; regressions defaults to null to keep crawl completion non-fatal"

patterns-established:
  - "Post-crawl enrichment pattern: run side-effect-free computation on results before storage to enrich all downstream consumers"

requirements-completed: [REGR-03, REGR-04]

# Metrics
duration: 5min
completed: 2026-03-10
---

# Phase 21 Plan 02: Regression Detection Wiring Summary

**Passive regression detection wired into crawl completion — results, saved reports, and webhook payloads all include a `regressions` field automatically when a baseline exists for the site+account.**

## Performance

- **Duration:** ~5 min
- **Started:** 2026-03-10T22:35:00Z
- **Completed:** 2026-03-10T22:40:00Z
- **Tasks:** 1
- **Files modified:** 1

## Accomplishments
- Added two requires to api.js: detectRegressions from regressionDetector and baselineManager from baselines
- Inserted regression detection block in successful crawl completion path, before storage to completedTests and writeFileSync
- All three result return paths (completedTests map, saved report, webhook) automatically include regressions without further changes
- login-failed and error paths remain untouched — no regressions field added there

## Task Commits

Each task was committed atomically:

1. **Task 1: Wire regression detection into crawl completion and results** - `ac1741c` (feat)

**Plan metadata:** (docs commit follows)

## Files Created/Modified
- `src/routes/api.js` - Added two requires and regression detection block in crawl completion

## Decisions Made
- Placed regression detection before `completedTests.set` and `fs.writeFileSync` so all downstream consumers (in-memory map, saved report, webhook) pick up the regressions field with a single assignment
- Detection wrapped in try/catch — errors are logged but regressions defaults to null, keeping crawl completion non-fatal
- No modification needed to GET /api/test/:testId/results — it already passes through whatever is on the results object from all three return paths

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Regression detection is now fully wired end-to-end: baseline creation (20-01, 20-02) → detection engine (21-01) → auto-detection on crawl (21-02)
- Ready for Phase 21-03: MCP tools to expose regression results to Claude Code

---
*Phase: 21-regression-detection*
*Completed: 2026-03-10*

## Self-Check: PASSED
- src/routes/api.js: FOUND
- 21-02-SUMMARY.md: FOUND
- commit ac1741c: FOUND
