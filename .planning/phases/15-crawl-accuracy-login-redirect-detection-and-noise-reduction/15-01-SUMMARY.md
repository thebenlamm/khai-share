---
phase: 15-crawl-accuracy-login-redirect-detection-and-noise-reduction
plan: 01
subsystem: testing
tags: [crawl, login-detection, request-filtering, link-cleanup, puppeteer]

requires:
  - phase: 14-issue-deduplication-and-severity-tiers
    provides: Issue deduplication and severity classification in crawler
provides:
  - Login redirect detection for authenticated crawls (detectLoginRedirect)
  - Benign request pattern allowlist (BENIGN_REQUEST_PATTERNS)
  - Hash fragment cleanup in link inventory
affects: [crawl-results, mcp-tools, test-reporting]

tech-stack:
  added: []
  patterns:
    - "Allowlist pattern for filtering benign third-party request failures"
    - "DOM-based login form detection (visible password field + minimal input count)"

key-files:
  created: []
  modified:
    - src/agent/crawler.js

key-decisions:
  - "Login form detection uses visible password field + input count heuristic (<=4 visible inputs = login, >4 = settings page)"
  - "Benign patterns checked only on ERR_ABORTED failures (not all request failures)"
  - "Login redirect causes early return from crawl() to avoid crawling login page links as content"

patterns-established:
  - "BENIGN_REQUEST_PATTERNS: module-level allowlist array for known noisy third-party URLs"
  - "detectLoginRedirect: dual-check (URL redirect + DOM inspection) for auth session expiry detection"

requirements-completed: [BETA-07, BETA-08, BETA-09]

duration: 2min
completed: 2026-03-05
---

# Phase 15 Plan 01: Crawl Accuracy Summary

**Login redirect detection, Sentry/analytics noise filtering, and hash fragment link dedup in crawler.js**

## Performance

- **Duration:** 2 min
- **Started:** 2026-03-05T03:28:19Z
- **Completed:** 2026-03-05T03:29:49Z
- **Tasks:** 2
- **Files modified:** 1

## Accomplishments
- Authenticated crawls now detect when pages silently redirect to login forms (session expiry)
- Sentry tunnel, analytics, and GTM ERR_ABORTED failures no longer appear as issues
- Link inventory strips hash fragments and deduplicates, producing clean link counts

## Task Commits

Each task was committed atomically:

1. **Task 1: Login redirect detection and request allowlist** - `85e8e95` (feat)
2. **Task 2: Hash fragment cleanup in link inventory** - `7980e09` (feat)

## Files Created/Modified
- `src/agent/crawler.js` - Added detectLoginRedirect(), BENIGN_REQUEST_PATTERNS, updated requestfailed handler, updated link extraction

## Decisions Made
- Login form detection uses visible password field + input count heuristic (<=4 visible inputs = login page, >4 = settings/profile page)
- Benign patterns checked only on ERR_ABORTED failures to avoid accidentally silencing real request failures
- Login redirect causes early return from crawl() -- login page links are not real content links

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Crawl accuracy improvements complete
- Ready for Phase 16 (MCP tool API consistency)

---
*Phase: 15-crawl-accuracy-login-redirect-detection-and-noise-reduction*
*Completed: 2026-03-05*
