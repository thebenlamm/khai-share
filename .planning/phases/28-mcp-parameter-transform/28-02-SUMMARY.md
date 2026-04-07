---
phase: 28-mcp-parameter-transform
plan: 02
subsystem: api
tags: [python, pytest, mcp, snake_case, camelCase, refactor, integration-tests]

# Dependency graph
requires:
  - snake_to_camel and build_payload from khai_mcp/client.py (28-01)
provides:
  - server.py with all 7 payload-building tools using build_payload
  - 4 integration tests proving end-to-end payload correctness
affects: [any future MCP tool additions to server.py]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - build_payload(**kwargs) as canonical payload construction — no manual camelCase dicts
    - unittest.mock.patch on khai_mcp.client.post to test payload without network

key-files:
  created: []
  modified:
    - khai_mcp/server.py
    - khai_mcp/test_client.py

key-decisions:
  - "khai_run_audit uses build_payload even though all params are optional — works correctly because None values are dropped by build_payload"
  - "record_har=False drops from payload via build_payload; Express only checks for presence of recordHar, so this is the correct behavior"

requirements-completed: [MCP-02]

# Metrics
duration: ~2min
completed: 2026-04-07
---

# Phase 28 Plan 02: MCP Tool build_payload Refactor Summary

**Replaced hand-rolled camelCase dicts in 7 MCP tool functions with build_payload(**kwargs) and added 4 integration tests proving end-to-end payload correctness via mock patching**

## Performance

- **Duration:** ~2 min
- **Started:** 2026-04-07T02:23:23Z
- **Completed:** 2026-04-07T02:25:27Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments

- Refactored 7 MCP tool functions in server.py to use build_payload instead of manual camelCase dict construction:
  - `khai_start_test` — removed 4-key dict + 2 conditional appends
  - `khai_execute_actions` — removed 3-key dict + 2 conditional appends
  - `khai_run_audit` — replaced 4 conditional `if x: payload["camelKey"]` blocks
  - `khai_check_links` — removed 4-key dict + 1 conditional append
  - `khai_watch_create` — removed 4-key dict + 2 conditional appends
  - `khai_baseline_create` — removed typed dict + conditional thresholds append
  - `khai_baseline_update` — replaced inline `{"testId": test_id}` dict
- Added `from .client import build_payload` import
- `grep -c 'payload["' khai_mcp/server.py` returns 0 — no manual dict key assignments remain
- Added 4 integration tests in test_client.py using unittest.mock.patch to intercept client.post calls and assert the exact camelCase payload sent
- Test suite grows from 15 to 19 tests; all pass

## Task Commits

1. `41f479b` — refactor(28-02): use build_payload in all MCP tool functions
2. `ae64104` — test(28-02): add integration tests verifying MCP tool payload construction

## Files Created/Modified

- `khai_mcp/server.py` — 7 tool functions refactored; net -27 lines (73 lines removed, 46 added)
- `khai_mcp/test_client.py` — 4 integration tests appended; file grows from 79 to 143 lines

## Decisions Made

- `khai_run_audit` uses `build_payload(site=site, base_url=base_url, ...)` where all params are None by default — this works correctly because build_payload drops None values, producing an empty dict `{}` when nothing is passed (same behavior as the old empty-dict + conditional-append pattern)
- `record_har=False` is correctly dropped by build_payload since `False` values are excluded — Express interprets absence of `recordHar` as "don't record", which is the right behavior; when `record_har=True` is passed, build_payload includes it as `{"recordHar": True}`

## Deviations from Plan

None — plan executed exactly as written. The line numbers cited in the plan matched the actual file content precisely.

## Issues Encountered

- The virtual environment `.venv/bin/pytest` and `.venv/bin/python` must be used instead of system Python (system Python 3.14 on Homebrew does not have the mcp or httpx packages). The plan's verify command uses bare `python -m pytest` which requires `pip install -e .` in the active venv. The venv already existed and had all dependencies once the package was installed via `.venv/bin/pip install -e .`.

## User Setup Required

None.

## Known Stubs

None — all refactored functions produce functionally identical payloads as the original code; no placeholder values introduced.

## Next Phase Readiness

Phase 28 is now complete. Both plans executed:
- Plan 01: `build_payload` and `snake_to_camel` utilities created with 15 unit tests
- Plan 02: All 7 payload-building MCP tools use `build_payload`; 19 total tests pass

Adding a new MCP tool now requires zero snake-to-camel handling code — just call `build_payload(**kwargs)`.

---
*Phase: 28-mcp-parameter-transform*
*Completed: 2026-04-07*
