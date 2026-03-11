---
phase: 22-mcp-tools
plan: 01
subsystem: api
tags: [mcp, baselines, regression-detection, python, fastmcp]

# Dependency graph
requires:
  - phase: 20-baseline-engine
    provides: BaselineManager CRUD and /api/baselines REST routes
  - phase: 21-regression-detection
    provides: Regression detection wired into crawl completion
provides:
  - Five MCP tools for baseline CRUD: khai_baseline_create, khai_baseline_list, khai_baseline_get, khai_baseline_update, khai_baseline_delete
  - Updated MCP instructions string with Baselines & Regression Detection section
affects: [any future phase adding MCP tools, docs referencing MCP tool list]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Baseline MCP tools follow existing pattern: @mcp.tool annotation, try/except returning dict with error key, _unwrap() for envelope extraction"
    - "readOnlyHint=True for list/get tools, destructiveHint=True for create/update/delete tools"

key-files:
  created: []
  modified:
    - khai_mcp/server.py
    - CLAUDE.md
    - README.md

key-decisions:
  - "No new architectural decisions — tools follow established patterns exactly"

patterns-established:
  - "Doc Update Rule satisfied: server.py instructions + CLAUDE.md table + README.md table all updated in same plan"

requirements-completed: [MCPA-01, MCPA-02]

# Metrics
duration: 2min
completed: 2026-03-10
---

# Phase 22 Plan 01: MCP Tools Summary

**Five baseline CRUD MCP tools added to khai_mcp/server.py, surfacing /api/baselines REST endpoints as Claude Code-callable tools with full doc coverage**

## Performance

- **Duration:** 2 min
- **Started:** 2026-03-10T23:11:18Z
- **Completed:** 2026-03-10T23:12:47Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments
- Added khai_baseline_create, khai_baseline_list, khai_baseline_get, khai_baseline_update, khai_baseline_delete to server.py
- Updated MCP instructions string with Baselines & Regression Detection section (tells Claude what these tools do on connect)
- Updated MCP tools tables in both CLAUDE.md and README.md per Doc Update Rule

## Task Commits

Each task was committed atomically:

1. **Task 1: Add five baseline MCP tools to server.py** - `16c0a0c` (feat)
2. **Task 2: Update CLAUDE.md and README.md documentation** - `ef68b34` (docs)

## Files Created/Modified
- `khai_mcp/server.py` - Five new MCP tool functions + updated instructions string
- `CLAUDE.md` - Five new rows in MCP tools table
- `README.md` - Five new rows in MCP tools table

## Decisions Made
None - followed plan as specified. Tools followed exact patterns from existing tools (watch_create, watch_delete, action_status).

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- v1.3 Auto-Assertions is complete: baseline engine (phase 20), regression detection (phase 21), and MCP tools (phase 22) are all shipped
- Claude Code can now create baselines, inspect them, update them, and delete them entirely through MCP tools
- No blockers

---
*Phase: 22-mcp-tools*
*Completed: 2026-03-10*

## Self-Check: PASSED

All files present and both task commits verified.
