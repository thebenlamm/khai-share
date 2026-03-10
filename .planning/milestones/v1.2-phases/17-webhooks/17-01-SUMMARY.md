---
phase: 17-webhooks
plan: 01
subsystem: api
tags: [webhooks, hmac, crypto, http, retry, exponential-backoff]

# Dependency graph
requires: []
provides:
  - Webhook delivery engine (src/utils/webhook.js) with HMAC-SHA256 signing and 3-attempt exponential-backoff retry
  - webhookUrl parameter on POST /api/test/start (crawl tests)
  - webhookUrl parameter on POST /api/actions/execute (action sessions)
  - webhookUrl parameter on POST /api/audit/start (site audits)
  - webhookUrl parameter on POST /api/advanced/links/check (link checker)
  - webhook delivery status field in all four operation status responses
affects: [18-watches]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "deliverWebhook(url, payload, options) — never-throws async function returning status object"
    - "Webhook fires AFTER terminal state is set and results are saved"
    - "Exponential backoff: 1s, 4s, 16s delays; no retry on 4xx"

key-files:
  created:
    - src/utils/webhook.js
  modified:
    - src/routes/api.js
    - src/routes/actions.js
    - src/routes/audit.js
    - src/routes/advanced.js

key-decisions:
  - "No external HTTP libraries — Node.js built-in http/https/crypto only, matching existing scheduler._postWebhook pattern"
  - "Webhook fires on ALL terminal states: completed, error, and login-failed"
  - "4xx responses are permanent failures — no retry; network/5xx/timeout are retried"
  - "KHAI_WEBHOOK_SECRET env var as default secret source; options.secret overrides"

patterns-established:
  - "Webhook integration pattern: extract webhookUrl from req.body, store on operation object, await deliverWebhook after terminal state, store result as operation.webhook"

requirements-completed: [HOOK-01, HOOK-02, HOOK-03, HOOK-04, HOOK-05]

# Metrics
duration: 3min
completed: 2026-03-10
---

# Phase 17 Plan 01: Webhooks Summary

**Webhook delivery engine with HMAC-SHA256 signing, 3-attempt exponential-backoff retry, and integration across all four async operation types (crawl tests, actions, audits, link checks)**

## Performance

- **Duration:** 3 min
- **Started:** 2026-03-10T16:30:04Z
- **Completed:** 2026-03-10T16:33:33Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments
- Created `src/utils/webhook.js` exporting `deliverWebhook` — HMAC-SHA256 signing via X-Khai-Signature header, retry up to 3 times with 1s/4s/16s backoff, never throws, returns `{status, url, attempts, lastAttemptAt, statusCode, error}`
- Integrated webhookUrl into POST /api/test/start — fires on completed, login-failed, and error states
- Integrated webhookUrl into POST /api/actions/execute — fires on completed, login-failed, and error states
- Integrated webhookUrl into POST /api/audit/start — fires on completed and error states
- Integrated webhookUrl into POST /api/advanced/links/check — fires on completed and error states
- All status responses now include `webhook` field (null until delivery attempt)

## Task Commits

Each task was committed atomically:

1. **Task 1: Create webhook delivery utility** - `4458ac2` (feat)
2. **Task 2: Integrate webhooks into all async operation routes** - `916753f` (feat)

## Files Created/Modified
- `src/utils/webhook.js` - Webhook delivery engine: HMAC signing, retry logic, status tracking
- `src/routes/api.js` - webhookUrl on /api/test/start; webhook field in test status response
- `src/routes/actions.js` - webhookUrl on /api/actions/execute; webhook field in session status/results
- `src/routes/audit.js` - webhookUrl on /api/audit/start; webhook field in audit status response
- `src/routes/advanced.js` - webhookUrl on /api/advanced/links/check; webhook field in job status response

## Decisions Made
- Used Node.js built-in `http`/`https`/`crypto` only — no new dependencies, consistent with existing `scheduler._postWebhook` pattern
- Webhook fires on all terminal states (completed, error, login-failed) so callers always get notified
- 4xx responses are permanent failures; network errors, timeouts, and 5xx are retried
- `KHAI_WEBHOOK_SECRET` env var provides default signing secret; `options.secret` overrides per-call

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

Optional: Set `KHAI_WEBHOOK_SECRET` environment variable to enable HMAC-SHA256 signing on webhook deliveries. If not set, webhooks are delivered without a signature header.

## Next Phase Readiness
- Phase 18 (Watches) can now use `deliverWebhook` from `src/utils/webhook.js` for change-detection notifications
- All four async operation types support webhookUrl — HOOK-01 through HOOK-05 satisfied

## Self-Check: PASSED

- src/utils/webhook.js: FOUND
- .planning/phases/17-webhooks/17-01-SUMMARY.md: FOUND
- Commit 4458ac2 (Task 1): FOUND
- Commit 916753f (Task 2): FOUND

---
*Phase: 17-webhooks*
*Completed: 2026-03-10*
