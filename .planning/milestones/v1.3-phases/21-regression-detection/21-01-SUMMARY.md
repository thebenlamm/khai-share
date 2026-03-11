---
phase: 21-regression-detection
plan: 01
subsystem: testing
tags: [regression, diff, crawl, baseline, pure-function, node-test]

# Dependency graph
requires:
  - phase: 20-baseline-engine
    provides: BaselineManager baseline object shape and thresholds structure
provides:
  - Pure detectRegressions(baseline, currentPages) function
  - Structured diff result with hasRegressions, summary, regressions array
  - Five regression types: title_changed, page_missing, page_new, status_changed, timing_regression
affects: [22-regression-hooks, regression-api, mcp-tools, webhook-payloads]

# Tech tracking
tech-stack:
  added: [node:test (built-in test runner, Node 22)]
  patterns:
    - Pure stateless comparison module with no I/O or side effects
    - URL-keyed Map for O(1) page lookup
    - Threshold-based timing check (ceiling) not snapshot delta comparison
    - TDD with node:test built-in — no external test framework needed

key-files:
  created:
    - src/agent/regressionDetector.js
    - test/regressionDetector.test.js
  modified: []

key-decisions:
  - "Timing regressions use threshold as ceiling (currentLoadTime > threshold), NOT direct comparison to snapshot loadTime — threshold is the contract"
  - "Title changes skipped when either title is null — null means title was not captured, not a real change"
  - "URL matching is exact string equality — no normalization, consistent with how crawler records URLs"
  - "No external test framework — node:test built-in (Node 22) is sufficient for pure function testing"

patterns-established:
  - "Pure comparison modules: no I/O, no imports except what needed, pass data directly from caller"
  - "TDD with RED commit before GREEN commit for auditability"

requirements-completed: [REGR-01, REGR-02]

# Metrics
duration: 1min
completed: 2026-03-10
---

# Phase 21 Plan 01: Regression Detection Engine Summary

**Pure detectRegressions() module comparing baseline snapshots to fresh crawl pages with five regression types and threshold-based timing checks**

## Performance

- **Duration:** ~7 min
- **Started:** 2026-03-10T22:27:00Z
- **Completed:** 2026-03-10T22:33:20Z
- **Tasks:** 1 (TDD: 2 commits — RED + GREEN)
- **Files modified:** 2

## Accomplishments
- Created `src/agent/regressionDetector.js` — pure, stateless, zero external dependencies
- Detects all five regression types: title_changed, page_missing, page_new, status_changed, timing_regression
- 15 unit tests covering edge cases (null inputs, null titles, threshold vs snapshot comparison, combined scenario)
- Plan's inline smoke test passes: 4 regressions correctly identified from a 2-page baseline vs 2-page current diff

## Task Commits

Each task was committed atomically:

1. **Task 1 (RED): regressionDetector tests** - `448e055` (test)
2. **Task 1 (GREEN): regressionDetector implementation** - `985c553` (feat)

_TDD task: RED commit (failing tests) followed by GREEN commit (passing implementation)_

## Files Created/Modified
- `src/agent/regressionDetector.js` — Pure comparison engine, exports `{ detectRegressions }`
- `test/regressionDetector.test.js` — 15 unit tests using node:test built-in

## Decisions Made
- Timing regression uses `baseline.thresholds.pageLoadTime` as the ceiling, not direct comparison to `snapshot.pages[].loadTime` — threshold is the contract, snapshot value is historical only
- Title change is only flagged when both baseline and current titles are non-null strings that differ — a null title means the crawler didn't capture it, not a real regression
- URL matching is exact string equality — no normalization (trailing slash, case), consistent with how crawler records URLs
- Used Node 22 built-in `node:test` — no external test framework needed for pure function testing

## Deviations from Plan

None — plan executed exactly as written.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- `detectRegressions()` is ready to be called from the crawl completion hook (Plan 21-02)
- Caller passes baseline object directly (from BaselineManager.getBaselineForSite()) and `crawler.results.pages`
- Return shape is final: `{ hasRegressions, summary: { titleChanges, missingPages, newPages, statusChanges, timingRegressions, total }, regressions: [...] }`

---
*Phase: 21-regression-detection*
*Completed: 2026-03-10*

## Self-Check: PASSED

- src/agent/regressionDetector.js: FOUND
- test/regressionDetector.test.js: FOUND
- 21-01-SUMMARY.md: FOUND
- commit 448e055 (RED): FOUND
- commit 985c553 (GREEN): FOUND
