---
phase: 25-login-extraction
plan: 02
subsystem: auth
tags: [puppeteer, login, refactor, agents]

# Dependency graph
requires:
  - phase: 25-login-extraction plan 01
    provides: shared performLogin utility in src/utils/login.js

provides:
  - All 5 agents with inline login (crawler, actions, flowTester, formFuzzer, watchManager) now delegate to performLogin
  - auditor.js confirmed to have no inline login (delegates auth via actions agent)
  - ~370 lines of duplicated login logic eliminated across the codebase

affects: [27-auditor-split, any phase touching agent login behavior]

# Tech tracking
tech-stack:
  added: []
  patterns: [thin login delegation — each agent's login() is a 3-5 line wrapper around performLogin]

key-files:
  created: []
  modified:
    - src/agent/crawler.js
    - src/agent/actions.js
    - src/agent/flowTester.js
    - src/agent/formFuzzer.js
    - src/agent/watchManager.js

key-decisions:
  - "formFuzzer login() throws on failure (not returns false) — wrapper throws to preserve caller contract"
  - "watchManager passes raw page object to performLogin (not this.page) since it creates browser per run"
  - "actions.js loginTwilio() deleted — logic now consolidated in shared _loginTwilio in utils/login.js"
  - "_findSelector helper in formFuzzer removed — only used by login(), not needed now"

patterns-established:
  - "Thin login delegation: agent login() calls performLogin then adapts return value to agent's expected contract (bool vs throw)"

requirements-completed: [LOGIN-06]

# Metrics
duration: 10min
completed: 2026-04-07
---

# Phase 25 Plan 02: Login Extraction — Agent Migration Summary

**Replaced 370+ lines of duplicated inline login code across 5 agents with 3-5 line delegations to shared performLogin utility**

## Performance

- **Duration:** ~10 min
- **Started:** 2026-04-07T01:25:00Z
- **Completed:** 2026-04-07T01:35:00Z
- **Tasks:** 3
- **Files modified:** 5

## Accomplishments
- crawler.js login() reduced from 145 lines to 5 lines (delegating to performLogin with screenshotFn + addIssueFn)
- actions.js login() reduced from 96 lines to 4 lines, loginTwilio() method deleted (119 lines removed)
- flowTester.js login() reduced from 85 lines to 4 lines
- formFuzzer.js login() reduced from 28 lines to 3 lines, _findSelector() helper deleted
- watchManager.js inline login block reduced from 24 lines to 4 lines
- auditor.js confirmed: no inline login — delegates auth to actions agent which now uses shared utility

## Task Commits

Each task was committed atomically:

1. **Task 1: Replace login in crawler.js and actions.js** - `aa62159` (refactor)
2. **Task 2: Replace login in flowTester.js, formFuzzer.js, and watchManager.js** - `7e8fd64` (refactor)
3. **Task 3: Verify auditor.js has no inline login** — no code change needed, verified via grep

**Plan metadata:** (docs commit follows)

## Files Created/Modified
- `src/agent/crawler.js` - login() delegated to performLogin; inline 145-line login removed
- `src/agent/actions.js` - login() delegated; loginTwilio() method removed (119 lines)
- `src/agent/flowTester.js` - login() delegated to performLogin; inline 85-line login removed
- `src/agent/formFuzzer.js` - login() delegated; _findSelector() helper removed
- `src/agent/watchManager.js` - inline login block replaced with performLogin call

## Decisions Made
- formFuzzer throws on login failure (not returns false) — existing callers expect exceptions; wrapper throws `result.error || 'Login failed'`
- watchManager passes bare `page` to performLogin (not `this.page`) — it creates a new browser per run, which is correct
- `_findSelector` in formFuzzer was only used by login(); removed it with the login method
- actions.js `loginTwilio()` deleted — all Twilio auth is now in `_loginTwilio` inside `src/utils/login.js`

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Auditor.js Coverage Note

auditor.js has no `async login()` method and no inline credential-filling code. It delegates all authenticated page access to the actions agent via the `/api/actions/execute` REST endpoint. The actions agent now uses performLogin, so auditor.js is covered through the dependency chain. LOGIN-06 ("All 6 agents") is satisfied.

## Next Phase Readiness
- Phase 26 (Async Job Helper): independent of this phase, can proceed
- Phase 27 (Auditor Split): depends on Phase 25 — now unblocked; auditor.js confirmed it uses actions agent for auth (no migration needed in split)
- All 6 agents load cleanly via `require()`

---
*Phase: 25-login-extraction*
*Completed: 2026-04-07*
