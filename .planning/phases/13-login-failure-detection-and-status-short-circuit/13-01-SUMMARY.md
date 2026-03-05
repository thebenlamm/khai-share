---
phase: 13-login-failure-detection-and-status-short-circuit
plan: 01
subsystem: api
tags: [express, puppeteer, mcp, error-handling, status-tracking]

requires:
  - phase: 01-foundation-and-auth
    provides: Crawler login flow and activeTests pattern
provides:
  - login-failed terminal status for crawl test status endpoint
  - Phase tracking (login/crawl/complete) in status response
  - loginError field with specific failure reason
affects: [14-issue-deduplication, 15-crawl-accuracy, 16-mcp-tool-api-consistency]

tech-stack:
  added: []
  patterns: [terminal-state-guard-pattern, phase-tracking-in-async-flow]

key-files:
  created: []
  modified: [src/routes/api.js, khai_mcp/server.py]

key-decisions:
  - "Guard terminal states (login-failed/error/completed) in status endpoint to avoid accessing closed crawler"
  - "Use completedTests map for terminal state data instead of crawler.results"
  - "Store results on login failure for debugging (not just discard)"

patterns-established:
  - "Terminal state guard: check status before accessing crawler in status endpoints"
  - "Phase tracking: set test.phase alongside test.status for progress visibility"

requirements-completed: [BETA-1, BETA-2, BETA-5]

duration: 2min
completed: 2026-03-04
---

# Phase 13 Plan 01: Login Failure Detection Summary

**Login failure short-circuit with phase tracking and terminal state guards in crawl test status endpoint**

## Performance

- **Duration:** 2 min
- **Started:** 2026-03-05T02:53:30Z
- **Completed:** 2026-03-05T02:55:30Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- Login failure immediately sets status to 'login-failed' with specific error detail from crawler issues
- Status endpoint includes phase field (login/crawl/complete) for progress visibility
- Terminal state guard prevents accessing closed crawler in status endpoint
- MCP docstring updated to document login-failed status and new fields

## Task Commits

Each task was committed atomically:

1. **Task 1: Add login-failed short-circuit and phase tracking** - `04daf68` (feat)
2. **Task 2: Update MCP tool docstring** - `749df6a` (docs)

## Files Created/Modified
- `src/routes/api.js` - Login failure short-circuit, phase tracking, terminal state guard in status endpoint
- `khai_mcp/server.py` - Updated khai_test_status docstring with login-failed status and new fields

## Decisions Made
- Guard terminal states (login-failed/error/completed) in status endpoint to avoid accessing closed crawler
- Use completedTests map for terminal state data instead of crawler.results
- Store results on login failure for debugging (browser closed, report saved)

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Login failure detection complete, ready for issue deduplication (Phase 14)
- Phase tracking pattern available for future status enrichment

---
*Phase: 13-login-failure-detection-and-status-short-circuit*
*Completed: 2026-03-04*
