---
phase: 18-watches
plan: 02
subsystem: api
tags: [express, rest, crud, watches, cron, node-cron]

# Dependency graph
requires:
  - phase: 18-01
    provides: WatchManager class with addWatch/updateWatch/removeWatch/getWatch/listWatches/getHistory/startAll/stopAll/_runWatch

provides:
  - REST CRUD API for watch management at /api/watches
  - WatchManager singleton shared between routes and server
  - Server boot starts all scheduled watches via startAll()
  - Server shutdown stops all cron jobs via stopAll()

affects: [18-03-mcp-tools]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Module-level singleton exported from route file: module.exports.manager = manager"
    - "Fire-and-forget async run: call _runWatch() without await, return 202"
    - "Cron error detection by message string for 400 vs 500 routing"

key-files:
  created:
    - src/routes/watches.js
  modified:
    - src/server.js

key-decisions:
  - "Single require() call for watchRoutes also gives watchManager via .manager property — same module cache, same singleton"
  - "POST /run fires manager._runWatch() without await (fire-and-forget) to match scheduled run behavior"
  - "cron validation errors return 400 (client error), unexpected errors use errorHandler (500)"

patterns-established:
  - "Route module exports both router (default) and manager via module.exports.manager for server.js to consume"

requirements-completed: [WATCH-05]

# Metrics
duration: 5min
completed: 2026-03-10
---

# Phase 18 Plan 02: Watches REST Routes Summary

**7-endpoint Express router for watch CRUD + history + manual run, with WatchManager singleton wired into server startup and graceful shutdown**

## Performance

- **Duration:** 5 min
- **Started:** 2026-03-10T17:13:53Z
- **Completed:** 2026-03-10T17:15:29Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments

- All 7 watch endpoints implemented: POST create (201), GET list, GET by id (404 on miss), PUT update, DELETE remove (404 on miss), GET history, POST run (202 fire-and-forget)
- Module-level WatchManager singleton shared between routes and server via `module.exports.manager`
- Server calls `watchManager.startAll()` on boot (logged "[Khai] Watch scheduler started") and `watchManager.stopAll()` in SIGTERM/SIGINT handler

## Task Commits

Each task was committed atomically:

1. **Task 1: Create watches REST routes** - `a4318e5` (feat)
2. **Task 2: Register routes in server.js and start watches on boot** - `53906c6` (feat)

## Files Created/Modified

- `src/routes/watches.js` - Express router with all 7 endpoints; exports WatchManager singleton as `.manager`
- `src/server.js` - Added watchRoutes registration, startAll() on listen, stopAll() in shutdown

## Decisions Made

- Used `module.exports.manager = manager` on the router object itself so a single `require('./routes/watches')` call gives both the router and the manager — no duplicate module loading.
- POST /run fires `_runWatch()` without await (fire-and-forget, returns 202) to match how scheduled cron runs work.
- cron validation errors detected by checking `err.message.includes('cron')` to return 400 instead of 500.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Watch REST API complete; plan 03 (MCP tools) can now expose these endpoints as Claude Code tools.
- No blockers.

## Self-Check: PASSED

All files and commits verified present.

---
*Phase: 18-watches*
*Completed: 2026-03-10*
