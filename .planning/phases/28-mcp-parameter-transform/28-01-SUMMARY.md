---
phase: 28-mcp-parameter-transform
plan: 01
subsystem: api
tags: [python, pytest, mcp, snake_case, camelCase, transformation]

# Dependency graph
requires: []
provides:
  - snake_to_camel function in khai_mcp/client.py (converts snake_case to camelCase)
  - build_payload function in khai_mcp/client.py (filters None/False, transforms keys)
  - 15 pytest tests covering all edge cases in khai_mcp/test_client.py
affects: [28-mcp-parameter-transform plan 02, khai_mcp/server.py consumers]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - TDD RED/GREEN cycle for utility functions
    - build_payload(**kwargs) as canonical way to build camelCase Express API payloads from snake_case MCP tool parameters

key-files:
  created:
    - khai_mcp/test_client.py
  modified:
    - khai_mcp/client.py

key-decisions:
  - "build_payload drops False but keeps 0 and empty string — matches Python falsy-but-valid semantics"
  - "Only top-level keys transformed by build_payload; nested dicts/lists pass through as-is since Express API owns nested schemas"

patterns-established:
  - "build_payload(**kwargs) pattern: MCP tool handlers pass all snake_case params to build_payload, get back a clean camelCase dict for the Express POST body"

requirements-completed: [MCP-01]

# Metrics
duration: 1min
completed: 2026-04-07
---

# Phase 28 Plan 01: snake_to_camel and build_payload Summary

**TDD-built snake_case-to-camelCase transformer and payload builder in client.py, with 15 edge-case tests covering None/False/zero/empty-string/nested-structure handling**

## Performance

- **Duration:** ~1 min
- **Started:** 2026-04-07T02:21:27Z
- **Completed:** 2026-04-07T02:22:08Z
- **Tasks:** 1 (TDD — RED + GREEN phases)
- **Files modified:** 2

## Accomplishments

- Created `snake_to_camel()` — splits on `_`, title-cases all parts except the first, joins; single words unchanged
- Created `build_payload(**kwargs)` — drops None and False, keeps 0 and empty string, transforms all top-level keys via `snake_to_camel`, nested structures pass through untouched
- 15 passing pytest tests covering all specified behaviors including edge cases

## Task Commits

Each TDD phase committed atomically:

1. **RED phase** — `804a2fa` (test): add failing tests for snake_to_camel and build_payload
2. **GREEN phase** — `99f2379` (feat): add snake_to_camel and build_payload helpers to client.py

**Plan metadata:** (docs commit — see below)

_Note: TDD task — two commits (test then feat). No refactor phase needed; implementation was already minimal._

## Files Created/Modified

- `khai_mcp/test_client.py` — 15 pytest tests for snake_to_camel and build_payload
- `khai_mcp/client.py` — snake_to_camel and build_payload added above existing HTTP helpers; existing get/post/put/delete/health functions unchanged

## Decisions Made

- `build_payload` drops `False` but keeps `0` and `""` — this matches the `record_har=False` case (user explicitly passes False to opt out) vs `max_depth=0` (valid zero value) and `site=""` (edge case but valid)
- Only top-level keys are transformed; nested dict/list structure passes through as-is because the Express API owns the nested schema (e.g., `actions` array items have their own structure)

## Deviations from Plan

None — plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- `snake_to_camel` and `build_payload` are exported from `khai_mcp/client.py` and ready for Plan 02 to import via `from khai_mcp.client import build_payload`
- Plan 02 can now replace hand-built camelCase dicts in server.py with `build_payload(**snake_case_kwargs)` calls

---
*Phase: 28-mcp-parameter-transform*
*Completed: 2026-04-07*
