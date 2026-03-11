---
phase: 20-baseline-engine
plan: 01
subsystem: api
tags: [baseline, crawler, persistence, json, atomic-write]

# Dependency graph
requires: []
provides:
  - Page title captured in crawl results (title field on every page in report)
  - BaselineManager class with full CRUD: create, read, update, delete baselines
  - One-active-baseline-per-site+account enforcement
  - Default timing thresholds (responseTime: 5000ms, pageLoadTime: 10000ms)
  - Custom thresholds merged with defaults and stored with baseline
  - Snapshot from crawl report: url, title, status, loadTime per page
  - Atomic persistence to config/baselines.json (tmp + rename)
affects:
  - 20-02 (baseline REST API — consumes BaselineManager)
  - 21 (regression detection — reads baselines via getBaselineForSite)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "BaselineManager follows WatchManager persistence pattern: constructor _load(), mutations call _save() with atomic tmp+rename"
    - "One-per-site+account enforced at createBaseline() — update or delete required before re-creating"
    - "listBaselines() returns metadata only (no full snapshot.pages) for API response efficiency"

key-files:
  created:
    - src/agent/baselineManager.js
    - config/baselines.json
  modified:
    - src/agent/crawler.js

key-decisions:
  - "One active baseline per site+account (create throws if one exists — must update or delete first)"
  - "Default thresholds applied via spread: { ...DEFAULT_THRESHOLDS, ...custom } so any field can be overridden"
  - "listBaselines omits snapshot.pages (returns only pageCount) to keep list responses compact"
  - "safePath + safeId used on testId to prevent path traversal in report file reads"

patterns-established:
  - "BaselineManager pattern: Load from JSON on construction, atomic save on all mutations"
  - "Snapshot extraction: pages mapped to {url, title, status, loadTime} — minimal footprint"

requirements-completed: [BASE-01, BASE-05, THRS-01, THRS-02]

# Metrics
duration: 11min
completed: 2026-03-10
---

# Phase 20 Plan 01: Baseline Engine — Data Layer Summary

**Crawler captures page titles and BaselineManager provides atomic JSON persistence with one-per-site baseline enforcement and configurable timing thresholds**

## Performance

- **Duration:** ~11 min
- **Started:** 2026-03-10T20:05:00Z
- **Completed:** 2026-03-10T20:15:55Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments

- Added `title` field to crawl pageResult (initialized to null, set via `page.title()` after load)
- Built BaselineManager with 6 CRUD methods following WatchManager's atomic persistence pattern
- Enforced one-baseline-per-site+account constraint with clear error message directing user to update or delete
- Default thresholds (responseTime: 5000ms, pageLoadTime: 10000ms) applied automatically, fully overridable

## Task Commits

Each task was committed atomically:

1. **Task 1: Add page title capture to crawler** - `d05dc4e` (feat)
2. **Task 2: Create BaselineManager module with CRUD and threshold support** - `ef7e8f2` (feat)

**Plan metadata:** (docs commit after summary — see below)

## Files Created/Modified

- `src/agent/crawler.js` - Added `title: null` to pageResult init + `pageResult.title = await this.page.title()` after page load
- `src/agent/baselineManager.js` - New: BaselineManager class with createBaseline, updateBaseline, getBaseline, getBaselineForSite, listBaselines, deleteBaseline, _save, _load
- `config/baselines.json` - New: Initial empty baselines store `{ "baselines": [] }`

## Decisions Made

- Used `safeId` + `safePath` to validate testId before building report file paths (path traversal prevention)
- `listBaselines()` omits full snapshot.pages array — returns only pageCount for compact list responses
- One-per-site enforcement is strict: createBaseline throws; caller must explicitly update or delete

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- BaselineManager is ready for Phase 20-02 to wire into REST API endpoints
- Phase 21 regression detection can use `getBaselineForSite(site, account)` to fetch baseline for comparison
- All crawl test reports now include page titles for baseline snapshot extraction

## Self-Check: PASSED

- src/agent/crawler.js: FOUND
- src/agent/baselineManager.js: FOUND
- config/baselines.json: FOUND
- .planning/phases/20-baseline-engine/20-01-SUMMARY.md: FOUND
- Commit d05dc4e (Task 1): FOUND
- Commit ef7e8f2 (Task 2): FOUND

---
*Phase: 20-baseline-engine*
*Completed: 2026-03-10*
