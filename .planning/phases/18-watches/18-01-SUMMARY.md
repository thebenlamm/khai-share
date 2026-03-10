---
phase: 18-watches
plan: 01
subsystem: agent
tags: [node-cron, puppeteer, pixelmatch, pngjs, uuid, browser-automation, cron, screenshots, diff, webhook]

# Dependency graph
requires:
  - phase: 17-webhooks
    provides: deliverWebhook utility used for change-detection notifications
  - phase: utils
    provides: createBrowser (Puppeteer), loadCredentials (site/account config)
provides:
  - WatchManager class with full cron-scheduled page monitoring lifecycle
  - Per-watch run history (up to 100 records) persisted atomically to config/watches.json
  - Content diffing (SHA-256 hash) and visual diffing (pixelmatch >1% pixel threshold)
  - Webhook firing on change detection via deliverWebhook
affects: [18-02-routes, 18-03-mcp]

# Tech tracking
tech-stack:
  added: [node-cron ^4.2.1]
  patterns:
    - Cron-scheduled agent pattern: each watch gets its own node-cron task with UTC timezone
    - Atomic file persistence: tmp-write + rename to prevent corruption on concurrent runs
    - Content hash + visual diff dual-signal change detection
    - History cap at 100 runs per watch to bound disk usage

key-files:
  created:
    - src/agent/watchManager.js
  modified:
    - package.json
    - package-lock.json

key-decisions:
  - "pixelmatch v7 ships as ES module default export — require with .default || fallback for CJS compatibility"
  - "Visual change threshold set at >1% pixel diff to filter out noise/animations"
  - "Webhook fires only on change (not on every completed run) to avoid noise"
  - "History capped at 100 records per watch; oldest entries pruned automatically"
  - "Screenshots stored under screenshots/watches/{watchId}/{runId}.png for organized per-watch dirs"

patterns-established:
  - "WatchManager uses Map<id, watch> + Map<id, cronJob> separation for clean lifecycle management"
  - "Run records always appended (never updated) — immutable audit trail of all runs"
  - "Error handling: site/account not found records error runs rather than crashing the cron job"

requirements-completed: [WATCH-01, WATCH-02, WATCH-03, WATCH-04, WATCH-06]

# Metrics
duration: 3min
completed: 2026-03-10
---

# Phase 18 Plan 01: WatchManager Agent Summary

**Cron-scheduled page monitor with authenticated Puppeteer sessions, SHA-256 content diffing, pixelmatch visual diffing, and webhook-on-change delivery persisted to config/watches.json**

## Performance

- **Duration:** ~3 min
- **Started:** 2026-03-10T17:08:58Z
- **Completed:** 2026-03-10T17:11:19Z
- **Tasks:** 2
- **Files modified:** 3 (watchManager.js created, package.json + package-lock.json updated)

## Accomplishments
- WatchManager class with add/update/remove/list/getWatch/getHistory/startAll/stopAll methods
- Cron-scheduled runs via node-cron (each watch runs independently on its own UTC schedule)
- Authenticated Puppeteer runs: login flow → navigate → content extract → screenshot → close
- Dual-signal change detection: SHA-256 content hash mismatch OR pixelmatch >1% pixel diff
- Webhook fires on change using existing deliverWebhook utility (operationType: 'watch')
- Atomic persistence via tmp+rename pattern; 100-run history cap per watch

## Task Commits

Each task was committed atomically:

1. **Task 1: Install node-cron** - `8664925` (chore)
2. **Task 2: Implement WatchManager agent** - `1622faa` (feat)

**Plan metadata:** (pending final docs commit)

## Files Created/Modified
- `src/agent/watchManager.js` - WatchManager class: scheduling, run execution, diffing, persistence
- `package.json` - Added node-cron ^4.2.1 dependency
- `package-lock.json` - Updated lock file

## Decisions Made
- pixelmatch v7 uses ES module default export — needed `require('pixelmatch').default || require('pixelmatch')` for CJS compatibility (Rule 1 auto-fix applied during implementation)
- Visual change threshold at >1% pixel diff (0.01 ratio) to avoid false positives from animations/minor rendering differences
- Webhook fires only when `changed === true` to keep notifications signal-rich
- History capped at 100 runs per watch; older entries are sliced off automatically

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] pixelmatch v7 CJS import compatibility**
- **Found during:** Task 2 (Implement WatchManager agent)
- **Issue:** pixelmatch v7 is an ES module — bare `require('pixelmatch')` returns `{ __esModule: true, default: fn }` not the function directly; the plan's import example `const pixelmatch = require('pixelmatch')` would fail at runtime calling `pixelmatch(...)`.
- **Fix:** Added `const _pixelmatch = require('pixelmatch'); const pixelmatch = _pixelmatch.default || _pixelmatch;` to handle both v6 and v7 correctly.
- **Files modified:** src/agent/watchManager.js
- **Verification:** `node -e "const pm = require('pixelmatch'); const fn = pm.default || pm; console.log(typeof fn)"` returns `function`
- **Committed in:** `1622faa` (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (Rule 1 - Bug)
**Impact on plan:** Required for correct operation — pixelmatch would have thrown at runtime otherwise. No scope creep.

## Issues Encountered
- None beyond the pixelmatch import deviation above.

## User Setup Required
None - no external service configuration required. config/watches.json is created automatically on first addWatch call.

## Next Phase Readiness
- WatchManager is ready for Phase 18 Plan 02: REST API routes (CRUD + run history endpoints)
- WatchManager is ready for Phase 18 Plan 03: MCP tools wrapping the REST API
- config/watches.json exists and is in correct initial state (empty watches array)
- No blockers.

---
*Phase: 18-watches*
*Completed: 2026-03-10*
