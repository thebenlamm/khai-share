---
phase: 20-baseline-engine
plan: 02
subsystem: api
tags: [express, rest, baselines, crud, routes]

# Dependency graph
requires:
  - phase: 20-01
    provides: BaselineManager class with createBaseline/updateBaseline/getBaseline/listBaselines/deleteBaseline methods
provides:
  - REST API at /api/baselines with full CRUD (POST, GET list, GET :id, PUT :id, DELETE :id)
  - Module-level BaselineManager singleton exported from src/routes/baselines.js
  - Baseline API documented in CLAUDE.md and README.md
affects: [20-03, 22-baseline-mcp]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Module-level manager singleton exported from route file (watches.js pattern)"
    - "Error message string matching for HTTP status code mapping (not found -> 404, already exists -> 409)"

key-files:
  created:
    - src/routes/baselines.js
  modified:
    - src/server.js
    - CLAUDE.md
    - README.md

key-decisions:
  - "Error mapping via string matching on message text (consistent with existing route patterns)"
  - "Baselines section placed before Crawl Testing in CLAUDE.md REST API Quick Reference"
  - "MCP server.py instructions update deferred to Phase 22 when MCP tools are added"

patterns-established:
  - "mapError() helper within route file for DRY error-to-status mapping"

requirements-completed: [BASE-02, BASE-03, BASE-04]

# Metrics
duration: 2min
completed: 2026-03-10
---

# Phase 20 Plan 02: Baseline REST API Summary

**Express CRUD routes for /api/baselines wiring BaselineManager into the REST layer with full error mapping and doc updates**

## Performance

- **Duration:** 2 min
- **Started:** 2026-03-10T20:18:34Z
- **Completed:** 2026-03-10T20:19:55Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments
- Created `src/routes/baselines.js` with 5 REST endpoints following the watches.js singleton pattern
- Mounted `/api/baselines` in `src/server.js`
- Updated CLAUDE.md with Baselines REST API section and "When to Suggest Khai" entry
- Updated README.md features list and REST API Reference with baseline endpoints

## Task Commits

Each task was committed atomically:

1. **Task 1: Create baseline REST routes and mount in server** - `bb691d7` (feat)
2. **Task 2: Update CLAUDE.md and README.md documentation** - `9985637` (docs)

**Plan metadata:** committed with final docs commit

## Files Created/Modified
- `src/routes/baselines.js` - Baseline CRUD REST endpoints (POST, GET, GET :id, PUT :id, DELETE :id) with module-level BaselineManager singleton
- `src/server.js` - Added require + app.use mount for baseline routes at /api/baselines
- `CLAUDE.md` - Added Baselines REST API section and "Creating and managing crawl baselines" to When to Suggest list
- `README.md` - Added "Crawl baselines" to features list and Baselines section to REST API Reference

## Decisions Made
- Used a local `mapError()` helper to map BaselineManager error messages to HTTP status codes (404 for "not found", 409 for "already exists") — keeps the pattern DRY and consistent with existing route error handling
- MCP server.py instructions update deferred to Phase 22 when MCP tools are added (plan specified this explicitly)

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Baseline REST API fully operational at /api/baselines
- BaselineManager singleton exported from routes file (ready for Phase 22 MCP tools to import)
- Phase 20 Plan 03 (regression comparison engine) can now read/write baselines via both manager and REST API

---
*Phase: 20-baseline-engine*
*Completed: 2026-03-10*

## Self-Check: PASSED
- src/routes/baselines.js: FOUND
- 20-02-SUMMARY.md: FOUND
- Commit bb691d7: FOUND
- Commit 9985637: FOUND
