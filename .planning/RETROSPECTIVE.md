# Project Retrospective

*A living document updated after each milestone. Lessons feed forward into future planning.*

## Milestone: v1.1 -- Beta Feedback

**Shipped:** 2026-03-05
**Phases:** 4 | **Plans:** 4 | **Sessions:** 1

### What Was Built
- Login failure detection with immediate status surfacing and phase tracking
- Fingerprint-based issue deduplication merging DNS/network duplicates
- Login redirect detection for session expiry during authenticated crawls
- Benign request pattern allowlist (Sentry, analytics, GTM)
- Hash fragment URL deduplication in link inventory
- khai_action_results MCP tool completing 3-tool pattern consistency

### What Worked
- Beta feedback as milestone driver: real crawl test feedback produced highly targeted, well-scoped phases
- 4 plans completed in ~7 minutes total execution time -- focused scope prevented scope creep
- Audit passed cleanly (9/9 requirements, 8/8 integration, 2/2 E2E flows)
- Post-processing dedup design preserved raw issues while providing clean summaries
- All 4 plans had zero deviations from plan -- research and planning quality was high

### What Was Inefficient
- Nyquist validation was partial/missing across all 4 phases (no test coverage generated)
- REQUIREMENTS.md didn't map v1.1 work -- beta feedback items existed only in BETA-FEEDBACK.md

### Patterns Established
- Terminal state guard pattern: check status before accessing async resources in polling endpoints
- Issue fingerprinting: extract error code + resource URL for dedup key
- Benign request allowlist: module-level array for known noisy third-party URLs
- 3-tool pattern: all async MCP domains use start/status/results separation

### Key Lessons
1. Real user feedback produces the most valuable milestone scope -- tighter than any upfront planning
2. Post-processing over inline filtering preserves data for multiple consumers (page-level, summary-level)
3. ERR_ABORTED-only filtering prevents accidentally silencing real failures when adding allowlists

### Cost Observations
- Model mix: 100% opus
- Sessions: 1
- Notable: Entire milestone completed in single session (~7 min execution)

---

## Milestone: v1.2 -- Integration & Monitoring

**Shipped:** 2026-03-10
**Phases:** 3 | **Plans:** 7 | **Sessions:** 1

### What Was Built
- Webhook delivery engine with HMAC-SHA256 signing and exponential backoff retry across all async operations
- webhookUrl parameter on all 4 MCP start-operation tools (test, audit, action, link check)
- WatchManager agent with cron-scheduled page monitoring, content/visual diff, and webhook alerting
- Watch REST CRUD API and 4 MCP tools for watch management
- CDP-based HAR network trace recorder for action sessions
- khai_action_har MCP tool and record_har parameter for network trace retrieval

### What Worked
- Dependency chain (16 -> 17 -> 18) paid off: consistent 3-tool pattern made webhook integration clean, webhook engine made watch alerts trivial
- All 7 plans completed in a single day with zero deviations
- Requirements were tight and well-scoped (16 reqs across 3 domains: webhooks, watches, HAR)
- Node.js built-in http/https/crypto for webhooks -- no new dependencies for a critical utility
- pixelmatch reuse from Phase 6 (visual diff) for watch visual change detection

### What Was Inefficient
- No milestone audit run -- all 16/16 requirements passed anyway, but skipped formal verification
- Summary one-liner extraction via gsd-tools returned null for all 7 summaries (tooling gap)

### Patterns Established
- Webhook delivery: fire on ALL terminal states (completed, error, login-failed), not just success
- CJS/ESM compat: .default || module fallback for pixelmatch v7
- Visual diff threshold: >1% pixel change to reduce false positives from timestamps/animations
- HAR endpoint returns raw JSON (not envelope) -- different from standard API pattern for streaming data
- Watch persistence: atomic write to config/watches.json with per-watch history capped at 100 records

### Key Lessons
1. Phase dependency chains produce cleaner architecture -- webhooks built on 3-tool pattern, watches built on webhooks
2. CDP session via createCDPSession() is the right abstraction for HAR recording -- no extra deps, standard Puppeteer
3. Response body caps (1MB) are essential for HAR recording to prevent memory exhaustion on binary assets

### Cost Observations
- Model mix: 100% opus
- Sessions: 1
- Notable: 3 phases, 7 plans, 16 requirements completed in single session on single day

---

## Cross-Milestone Trends

### Process Evolution

| Milestone | Sessions | Phases | Plans | Key Change |
|-----------|----------|--------|-------|------------|
| v1.0 MVP | ~5 | 9 | 18 | Foundation + platform capabilities |
| v1.1 Beta Feedback | 1 | 4 | 4 | Feedback-driven targeted fixes |
| v1.2 Integration & Monitoring | 1 | 3 | 7 | Push integrations + monitoring |

### Top Lessons (Verified Across Milestones)

1. Inline auth to avoid nested pool acquisition (established v1.0, continued v1.1)
2. Post-processing over inline mutation for data shared across consumers (v1.1)
3. Real user feedback drives the highest-value work (v1.1)
4. Phase dependency chains produce cleaner architecture than independent features (v1.2)
5. Reuse existing utilities across phases -- pixelmatch from v1.0 Phase 6 reused in v1.2 Phase 18 (v1.2)
