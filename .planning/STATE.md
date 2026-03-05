---
gsd_state_version: 1.0
milestone: v1.1
milestone_name: Beta Feedback
status: completed
stopped_at: Completed 14-issue-deduplication-and-severity-tiers/14-01-PLAN.md
last_updated: "2026-03-05T03:14:07.933Z"
last_activity: 2026-03-04 -- Plan 14-01 complete (Issue deduplication and severity tiers)
progress:
  total_phases: 7
  completed_phases: 2
  total_plans: 2
  completed_plans: 2
  percent: 100
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-02-16)

**Core value:** One command tests every HomeBay user role through every critical flow and tells you what's broken
**Current focus:** Phase 1 - Foundation & Auth

## Current Position

Phase: 14 of 16 (Issue Deduplication and Severity Tiers) - Complete
Plan: 1 of 1 in current phase
Status: Complete
Last activity: 2026-03-04 -- Plan 14-01 complete (Issue deduplication and severity tiers)

Progress: [██████████] 100% (4 of 4 v1.1 plans complete)

## Performance Metrics

**Velocity:**
- Total plans completed: 12
- Average duration: 1.8 min
- Total execution time: 0.35 hours

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 01-foundation-and-auth | 2/2 | 5 min | 2.5 min |
| 05-lighthouse-performance-audit-integration | 2/2 | 4 min | 2.0 min |
| 06-visual-diff-against-reference-pages | 2/2 | 3 min | 1.5 min |
| 07-dry-run-form-submission-testing | 2/2 | 4 min | 2.0 min |
| 08-animation-and-transition-screenshot-testing | 2/2 | 3 min | 1.5 min |
| 09-saved-test-suites-with-replay | 2/2 | 4 min | 2.0 min |

**Recent Trend:**
- Last 5 plans: 3 min, 2 min, 1 min, 3 min, 1 min
- Average: 2.0 min
- Trend: stable

*Updated after each plan completion*
| Phase 05 P02 | 2 | 2 tasks | 3 files |
| Phase 06 P01 | 2 | 2 tasks | 2 files |
| Phase 06 P02 | 1 | 2 tasks | 1 files |
| Phase 07 P01 | 1 | 2 tasks | 2 files |
| Phase 07-dry-run-form-submission-testing P01 | 1 | 2 tasks | 2 files |
| Phase 07 P02 | 3 | 2 tasks | 3 files |
| Phase 08-animation-and-transition-screenshot-testing P08-01 | 2 | 2 tasks | 2 files |
| Phase 08-animation-and-transition-screenshot-testing P08-02 | 1 | 2 tasks | 3 files |
| Phase 09-saved-test-suites-with-replay P09-01 | 3 | 3 tasks | 3 files |
| Phase 09-saved-test-suites-with-replay P09-02 | 1 | 2 tasks | 2 files |
| Phase 10-built-in-accessibility-audit-with-axe-core P10-01 | 2 | 2 tasks | 3 files |
| Phase 10-built-in-accessibility-audit-with-axe-core P10-02 | 2 | 2 tasks | 3 files |
| Phase 11-complete-suiterunner-integration P11-01 | 48 | 2 tasks | 1 files |
| Phase 11 P02 | 76 | 2 tasks | 2 files |
| Phase 12-suite-history-and-replay P12-01 | 59 | 2 tasks | 1 files |
| Phase 12 P02 | 92 | 2 tasks | 1 files |
| Phase 13-login-failure-detection P13-01 | 2 | 2 tasks | 2 files |
| Phase 14 P01 | 1 | 2 tasks | 2 files |

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- [Roadmap]: 4-phase structure (Quick depth) -- compressed research's 5 phases by merging role workflows with payments
- [Roadmap]: Max 3 concurrent Puppeteer instances on 8GB MacBook Air
- [Roadmap]: Stripe iframe handling via frame.type() not page.type()
- [Roadmap]: Next.js navigation via waitForSelector not waitForNavigation
- [01-01]: BrowserPool uses _released flag to prevent disconnected event double-servicing queue on normal browser.close()
- [01-01]: HomeBay selectors (input#email, input#password) kept out of credentials.json -- handled in auth.js (Plan 02)
- [01-01]: checkHomeBayHealth runs once per test run via HEAD request, not per-navigation
- [01-02]: fillReactInput uses native HTMLInputElement setter + input/change events -- page.type() alone does not trigger React controlled component state updates
- [01-02]: navigateTo uses networkidle2 for auth pages; Phase 2+ auction pages with WebSockets should use domcontentloaded + content selector
- [01-02]: GET /config catches credential errors and returns warning field instead of 500 (safe for fresh setups)
- [Phase 05]: Use Event Timing API with durationThreshold: 40ms for INP measurement (Google's official threshold)
- [Phase 05]: Apply 2026 Core Web Vitals INP thresholds: good ≤200ms, poor >500ms
- [Phase 05]: Inline authentication logic to avoid nested pool acquisition (deviation: auth.js creates its own slot)
- [06-01]: Use visibility:hidden for masking dynamic content in screenshots to preserve layout
- [06-01]: Organize screenshots in role-specific subdirectories (homebay-current/{role}/, homebay-baselines/{role}/)
- [Phase 06-02]: Use inline fs operations for baseline management (simple file copy) vs separate module
- [Phase 06-02]: Return 404 for missing baseline on compare endpoint vs 200 with warning
- [Phase 07-01]: Use request interception (abort POST/PUT/DELETE) instead of preventDefault injection for dry-run mode
- [Phase 07-01]: Check isInterceptResolutionHandled() before aborting requests to prevent double-handling errors
- [Phase 07-02]: Synchronous endpoint pattern for fast dry-run tests (<5s) - return results immediately, no async job needed
- [Phase 07-02]: Multiple expected errors per test with flexible matching (contains/includes) for HTML5 vs React message variations
- [Phase 08-01]: Use Web Animations API over CSS-only detection for unified animation/transition interface
- [Phase 08-01]: Shadow DOM support via document.getAnimations({ subtree: true }) for Web Components compatibility
- [Phase 08-02]: Inline login pattern to avoid nested pool acquisition (matches Phase 05 decision)
- [Phase 09-01]: Use ajv (not JSON.parse alone) for schema validation to enforce required fields, enums, and constraints
- [Phase 09-01]: Suite timeout enforced via Promise.race to prevent indefinite hangs
- [Phase 09-01]: Tag filtering at test level (suite.tags informational; test.tags used for filtering)
- [Phase 09-01]: Fail-fast on critical test failures when test.critical === true
- [Phase 09-01]: History stored in JSONL format (newline-delimited JSON) for append-only durability
- [Phase 10-built-in-accessibility-audit-with-axe-core]: Enable CSP bypass before navigation in auditPage method (required for HomeBay and sites with strict CSP headers)
- [Phase 10-built-in-accessibility-audit-with-axe-core]: Inline authentication in accessibility module to avoid nested pool.withSlot() deadlock
- [Phase 10-built-in-accessibility-audit-with-axe-core]: CSP bypass before navigation required for HomeBay's strict CSP headers
- [Phase 11-complete-suiterunner-integration]: Import aliasing (auditAccessibility) avoids collision with performance module's auditHomeBayRole
- [Phase 11-complete-suiterunner-integration]: Dry-run success based on dryrunResult.passed (validation matched expectations), not error-free
- [Phase 11]: Allow null role for unauthenticated tests (dry-run, accessibility without login)
- [Phase 12-suite-history-and-replay]: Store full suite manifest in summary.json for replay without config/suites/ dependency
- [Phase 12-suite-history-and-replay]: Use static method pattern (not instance method) since replay creates new SuiteRunner internally
- [Phase 12]: Use readline streaming for history.jsonl to prevent memory issues on large files
- [Phase 12]: Default to 30 days and 100 runs limit for history queries to prevent slow queries
- [Phase 12]: Quartile comparison for trend detection requires 8+ data points for statistical validity
- [Phase 13-01]: Guard terminal states (login-failed/error/completed) in status endpoint to avoid accessing closed crawler
- [Phase 13-01]: Use completedTests map for terminal state data instead of crawler.results
- [Phase 13-01]: Store results on login failure for debugging (browser closed, report saved)
- [Phase 14]: Post-processing dedup in close() preserves raw issues for page-level classification
- [Phase 14]: Fingerprint uses net::ERR_* code + resource pathname for DNS/network dedup
- [Phase 14]: Severity promotion: if duplicate has higher severity, primary inherits it

### Pending Todos

None yet.

### Roadmap Evolution

- Phase 5 added: Lighthouse performance audit integration
- Phase 6 added: Visual diff against reference pages
- Phase 7 added: Dry-run form submission testing
- Phase 8 added: Animation and transition screenshot testing
- Phase 9 added: Saved test suites with replay
- Phase 10 added: Built-in accessibility audit with axe-core
- v1.1 Beta Feedback milestone created with phases 13-16 (from first real crawl test feedback)
- Phase 13 added: Login failure detection and status short-circuit (feedback #1, #2, #5)
- Phase 14 added: Issue deduplication and severity tiers (feedback #3, #6)
- Phase 15 added: Crawl accuracy - login redirect detection and noise reduction (feedback #7, #8, #9)
- Phase 16 added: MCP tool API consistency (feedback #4)
- HomeBay phases (2-4) moved to v1.2 milestone

### Blockers/Concerns

- [Research]: Unknown whether HomeBay uses Socket.io or native WebSockets -- affects Phase 3 library choice
- [Research]: Test database credentials needed for seeding/teardown -- affects Phase 2+
- [Research]: Package versions from research are unverified estimates

## Session Continuity

Last session: 2026-03-05T03:14:07.931Z
Stopped at: Completed 14-issue-deduplication-and-severity-tiers/14-01-PLAN.md
Resume file: None
