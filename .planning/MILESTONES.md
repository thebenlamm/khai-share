# Milestones

## v1.3 Auto-Assertions (Shipped: 2026-03-11)

**Phases:** 20-23 | **Plans:** 6 | **Requirements:** 13/13
**Timeline:** 1 day (2026-03-10)
**Git range:** feat(20-01) -> fix(23-01) | 18 files changed, 1,492 insertions, 16 deletions

**Key accomplishments:**
- BaselineManager with atomic JSON persistence, one-per-site enforcement, and configurable timing thresholds
- Baseline CRUD REST API at /api/baselines with full error mapping and documentation
- Pure regression detection engine with 5 diff types (title, missing, new, status, timing) and threshold-based checks
- Automatic regression detection on crawl completion — results, reports, and webhooks enriched transparently
- Five MCP tools for baseline CRUD directly from Claude Code (create/list/get/update/delete)
- Cross-phase integration fix closing silent regression detection failure from export name mismatch

**Audit:** Passed (13/13 requirements, 13/13 integration, 3/3 E2E flows)
**Tech debt:** 0 items (1 minor docstring fix applied post-audit)

---

## v1.2 Integration & Monitoring (Shipped: 2026-03-10)

**Phases:** 17-19 | **Plans:** 7 | **Requirements:** 16/16
**Timeline:** 1 day (2026-03-10)
**Git range:** feat(17-01) -> docs(19-har-export) | 31 files changed, 4,698 insertions, 74 deletions

**Key accomplishments:**
- Webhook delivery engine with HMAC-SHA256 signing and 3x exponential backoff retry on all async operations
- webhookUrl parameter on all 4 start-operation MCP tools (test, audit, action, link check)
- WatchManager agent with cron-scheduled authenticated page monitoring and content/visual change detection
- Watch REST CRUD API and 4 MCP tools (create/list/delete/history) for watch management
- CDP-based HAR network trace recording during action sessions with 1MB response body cap
- khai_action_har MCP tool and record_har parameter for network trace retrieval from Claude Code

---

## v1.1 Beta Feedback (Shipped: 2026-03-05)

**Phases:** 13-16 | **Plans:** 4 | **Tasks:** 8
**Timeline:** 1 day (2026-03-04 -> 2026-03-04)
**Git range:** feat(13-01) -> docs(16-01) | 11 files changed, 698 insertions, 47 deletions

**Key accomplishments:**
- Login failures surface immediately in status polling with specific error details and phase tracking
- Fingerprint-based issue deduplication merges DNS/network duplicates with severity promotion
- Authenticated crawls detect silent login redirects from session expiry
- Sentry/analytics noise filtered via benign request pattern allowlist
- MCP tool API consistent with 3-tool pattern (start/status/results) across all domains

**Audit:** Passed (9/9 beta feedback items, 8/8 integration points, 2/2 E2E flows)
**Tech debt:** 2 non-blocking items (mid-crawl summary.errors timing, SUMMARY req ID inconsistency)

---

## v1.0 MVP (Shipped: 2026-03-04)

See `.planning/milestones/v1.0-ROADMAP.md` for full details.

---
