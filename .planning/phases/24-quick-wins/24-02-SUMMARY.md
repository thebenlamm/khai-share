---
phase: 24-quick-wins
plan: "02"
subsystem: routes
tags: [webhook, refactor, naming-consistency, suites]
dependency_graph:
  requires: []
  provides: [webhook-on-suites, consistent-jobstore-naming]
  affects: [src/routes/suites.js, src/routes/api.js, src/routes/actions.js, src/routes/audit.js]
tech_stack:
  added: []
  patterns: [deliverWebhook pattern (operationType/operationId), activeJobs naming convention]
key_files:
  created: []
  modified:
    - src/routes/suites.js
    - src/routes/api.js
    - src/routes/actions.js
    - src/routes/audit.js
decisions:
  - "Use activeJobs as universal primary JobStore variable name across all route files"
  - "Use completedJobs and rotationJobs as secondary names in api.js (mirrors existing advanced.js pattern)"
  - "Accept webhookUrl from request body on suite run/replay (query params were already used for tags/dryRun)"
metrics:
  duration_seconds: 90
  completed_date: "2026-04-06"
  tasks_completed: 2
  files_modified: 4
---

# Phase 24 Plan 02: Quick Wins - Webhook on Suites + Naming Consistency Summary

**One-liner:** Webhook support added to suites run/replay endpoints using deliverWebhook pattern; all 5 route files standardized to activeJobs naming convention.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Add webhook support to suites run and replay endpoints | 99d61c8 | src/routes/suites.js |
| 2 | Standardize JobStore variable names across all route files | a1f1a04 | src/routes/api.js, src/routes/actions.js, src/routes/audit.js |

## What Was Built

### Task 1: Webhook Support on Suites

Added full webhook support to `src/routes/suites.js` matching the established pattern from `api.js`:

- Imported `deliverWebhook` from `../utils/webhook`
- Both `POST /:suiteId/run` and `POST /:suiteId/runs/:runId/replay` now accept `webhookUrl` from request body
- Job records store `webhookUrl` and `webhook` fields from creation
- Webhook fires on completion with `{runId, suiteId, status: 'completed', results}`
- Webhook fires on error with `{runId, suiteId, status: 'error', error}`
- Start responses include `webhookUrl` field when provided (consistent with other routes)
- 5 total `deliverWebhook` calls added (2 for run endpoint x complete+error, 2 for replay x complete+error, plus the import)

### Task 2: JobStore Variable Naming

Renamed all JobStore variables to `activeJobs` (already the convention in `advanced.js` and `suites.js`):

| File | Before | After |
|------|--------|-------|
| api.js | `activeTests`, `completedTests`, `activeRotations` | `activeJobs`, `completedJobs`, `rotationJobs` |
| actions.js | `activeSessions` | `activeJobs` |
| audit.js | `activeAudits` | `activeJobs` |
| advanced.js | `activeJobs` | (unchanged) |
| suites.js | `activeJobs` | (unchanged) |

Also updated stale comment in api.js referencing `completedTests` to `completedJobs`.

## Verification

- `grep -c "deliverWebhook" src/routes/suites.js` returns 5
- `grep "activeTests|activeSessions|activeAudits" src/routes/*.js` returns nothing
- `grep -l "activeJobs" src/routes/*.js` matches all 5 route files
- `npm test` passes: 55 tests, 0 failures

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed stale comment referencing old variable name**
- **Found during:** Task 2
- **Issue:** Comment on line 186 of api.js said "use completedTests data" after renaming `completedTests` to `completedJobs`
- **Fix:** Updated comment to reference `completedJobs`
- **Files modified:** src/routes/api.js
- **Commit:** a1f1a04 (included in Task 2 commit)

## Known Stubs

None.

## Self-Check: PASSED
