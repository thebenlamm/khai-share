---
phase: 26-async-job-helper
plan: "02"
subsystem: routes
tags: [async, jobs, refactor, iife-elimination]
dependency_graph:
  requires: [runAsyncJob helper in jobStore.js (from 26-01)]
  provides: [all 10 async operations using runAsyncJob, no inline IIFE job management]
  affects: [src/routes/audit.js, src/routes/advanced.js, src/routes/suites.js, src/routes/api.js, src/routes/actions.js, src/utils/jobStore.js]
tech_stack:
  added: []
  patterns: [loginError convention for login-failed status preservation, _actionResults for in-flight accumulation, flatten-on-read for rotation status]
key_files:
  created: []
  modified:
    - src/routes/audit.js
    - src/routes/advanced.js
    - src/routes/suites.js
    - src/routes/api.js
    - src/routes/actions.js
    - src/utils/jobStore.js
decisions:
  - "loginError convention: workFn sets job.loginError before throwing; runAsyncJob catch block checks loginError and overrides status to 'login-failed' — preserves login-failed as distinct from error across all consumers"
  - "_actionResults field: actions.js uses job._actionResults for per-action accumulation to avoid collision with runAsyncJob's job.results assignment (which receives the workFn return value)"
  - "rotation status endpoint flattens job.results: backward-compatible response merges job.results into the status response so existing clients see the same shape"
metrics:
  duration_seconds: 290
  completed_date: "2026-04-06"
  tasks_completed: 2
  files_changed: 6
---

# Phase 26 Plan 02: Route IIFE Migration Summary

**One-liner:** All 10 async job IIFEs across 5 route files replaced with runAsyncJob calls, eliminating per-route lifecycle boilerplate and centralizing endTime/error/webhook handling.

## What Was Built

Migrated all inline `(async () => { ... })()` patterns across every async route handler to use the `runAsyncJob` helper from Plan 01.

**Files migrated:**

- **audit.js** (1 IIFE): audit.run() wrapped in runAsyncJob; deliverWebhook import removed
- **advanced.js** (5 IIFEs): flow, api-fuzz, form-fuzz, lighthouse, link-check all use runAsyncJob; deliverWebhook import removed
- **suites.js** (2 IIFEs): suite run and suite replay use runAsyncJob; deliverWebhook import removed
- **api.js** (2 IIFEs): crawl test and password rotation use runAsyncJob; deliverWebhook import removed
- **actions.js** (1 IIFE): full action execution loop wrapped in runAsyncJob; deliverWebhook import removed

**jobStore.js patched:** Added login-failed status preservation in runAsyncJob's catch block — 3 lines that check `current.loginError` and override `current.status = 'login-failed'` when set. Backward compatible (no existing code sets loginError).

**Results:**
- 0 IIFEs remaining in any route file
- 10 runAsyncJob calls across 5 route files
- 0 deliverWebhook imports in route files (webhook delivery is now centralized in jobStore.js)
- endTime now consistently set by runAsyncJob on all 10 async operations
- error field is always `err.message` string (set by runAsyncJob), not ad-hoc strings

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] actions.js: _actionResults field to avoid runAsyncJob results collision**
- **Found during:** Task 2
- **Issue:** actions.js accumulated per-action results in `job.results` (an array) during execution, but runAsyncJob overwrites `job.results` with the workFn return value on completion. If workFn returned the array, this was fine — but the status/results endpoints needed to reference the field consistently regardless of completion state.
- **Fix:** Renamed the in-flight accumulation field from `results` (in initialData) to `_actionResults`. The status endpoint reads `session._actionResults || []`. The workFn returns a full payload object `{ sessionId, status, results: job._actionResults, ... }` for the webhook. The results endpoint reads `session._actionResults || []` directly from the job, providing in-progress and completed views consistently.
- **Files modified:** `src/routes/actions.js`
- **Commit:** 9034131

**2. [Rule 1 - Bug] rotation status endpoint response shape**
- **Found during:** Task 2
- **Issue:** The old rotation IIFE did `rotationJobs.create(rotationId, { ...result })` on success — a full overwrite that put the result fields at the top level. With runAsyncJob, the result is stored in `job.results`. The status endpoint would return `{ status: 'completed', results: { status: 'success', site, ... }, endTime, ... }` instead of the old flat shape.
- **Fix:** Updated the rotation status endpoint to flatten `results` into the response: `const { _createdAt, results, ...meta } = rotation; res.json(ok({ ...meta, ...(results || {}) }))`. Consumers see the same field names.
- **Files modified:** `src/routes/api.js`
- **Commit:** 9034131

## Known Stubs

None.

## Self-Check: PASSED

Files modified check:
- src/routes/audit.js: FOUND (contains runAsyncJob)
- src/routes/advanced.js: FOUND (contains runAsyncJob x5)
- src/routes/suites.js: FOUND (contains runAsyncJob x2)
- src/routes/api.js: FOUND (contains runAsyncJob x2)
- src/routes/actions.js: FOUND (contains runAsyncJob)
- src/utils/jobStore.js: FOUND (contains loginError check)

Commits:
- f3de133 (Task 1 — 8 IIFEs in audit, advanced, suites): FOUND
- 9034131 (Task 2 — 2 IIFEs in api, actions + jobStore patch): FOUND

Verification results:
- 0 IIFEs in routes: CONFIRMED
- 10 runAsyncJob calls in routes: CONFIRMED
- 0 deliverWebhook imports in routes: CONFIRMED
- node -e "require('./src/app')" exits cleanly: CONFIRMED
- node --test test/jobStore.test.js: 14/14 pass: CONFIRMED
