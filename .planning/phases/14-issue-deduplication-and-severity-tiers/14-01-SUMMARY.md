---
phase: 14-issue-deduplication-and-severity-tiers
plan: 01
subsystem: api
tags: [deduplication, fingerprinting, crawl-results, severity-tiers]

requires:
  - phase: 13-login-failure-detection-and-status-short-circuit
    provides: terminal state handling in status endpoint
provides:
  - issueFingerprint() method for dedup key extraction
  - deduplicateIssues() post-processing with relatedSignals merge
  - recomputeSummary() for errors/warnings counts from deduplicated issues
  - errors field in crawl summary
affects: [15-crawl-accuracy, 16-mcp-tool-api-consistency]

tech-stack:
  added: []
  patterns: [fingerprint-based-dedup, post-processing-over-inline-filtering]

key-files:
  created: []
  modified:
    - src/agent/crawler.js
    - src/routes/api.js

key-decisions:
  - "Post-processing dedup in close() preserves raw issues for page-level classification"
  - "Fingerprint uses net::ERR_* code + resource pathname for DNS/network dedup"
  - "Severity promotion: if duplicate has higher severity, primary inherits it"

patterns-established:
  - "Issue fingerprinting: extract error code + resource URL for dedup key"
  - "relatedSignals array on deduplicated issues preserves all original signals"

requirements-completed: [BETA-03, BETA-06]

duration: 1min
completed: 2026-03-04
---

# Phase 14 Plan 01: Issue Deduplication and Severity Tiers Summary

**Fingerprint-based issue deduplication merging duplicate DNS/network failures into single issues with relatedSignals, plus errors count in summary**

## Performance

- **Duration:** 1 min
- **Started:** 2026-03-04T05:52:13Z
- **Completed:** 2026-03-04T05:53:17Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- DNS failures (request-failed + console-error for same resource) now merge into single deduplicated issue with relatedSignals array
- Summary includes explicit errors count alongside existing warnings count
- In-progress status endpoint shows approximate deduplicated issue count

## Task Commits

Each task was committed atomically:

1. **Task 1: Add fingerprint dedup and severity summary to crawler** - `b2ee1c2` (feat)
2. **Task 2: Surface issuesFound as deduplicated count in status endpoint** - `eacca46` (feat)

## Files Created/Modified
- `src/agent/crawler.js` - Added issueFingerprint(), deduplicateIssues(), recomputeSummary() methods; errors field in summary; dedup call in close()
- `src/routes/api.js` - Added inline dedup counting for in-progress status endpoint

## Decisions Made
- Post-processing dedup in close() rather than inline in addIssue() -- preserves raw issues for page-level pass/warn/fail classification (per research pitfall #3)
- Fingerprint key: `url|resourcePath|errCode` for network errors, fallback to `url|type|message` for others
- Severity promotion on merge: if secondary issue has error severity and primary does not, primary gets promoted

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Dedup foundation complete, ready for Phase 15 (crawl accuracy improvements)
- relatedSignals metadata available for future reporting/UI enhancements

---
*Phase: 14-issue-deduplication-and-severity-tiers*
*Completed: 2026-03-04*
