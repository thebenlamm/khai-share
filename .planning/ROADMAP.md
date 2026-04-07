# Roadmap: Khai -- Browser Automation MCP Server

## Milestones

- v1.0 MVP -- Phases 1, 5-12 (shipped 2026-03-04)
- v1.1 Beta Feedback -- Phases 13-16 (shipped 2026-03-05)
- v1.2 Integration & Monitoring -- Phases 17-19 (shipped 2026-03-10)
- v1.3 Auto-Assertions -- Phases 20-23 (shipped 2026-03-11)
- v1.4 Internal Quality -- Phases 24-28 (in progress)

## Phases

<details>
<summary>v1.0 MVP (Phases 1, 5-12) -- SHIPPED 2026-03-04</summary>

- [x] Phase 1: Foundation & Auth (2/2 plans) -- completed 2026-02-16
- [x] Phase 5: Lighthouse Performance Audit Integration (2/2 plans) -- completed 2026-02-25
- [x] Phase 6: Visual Diff Against Reference Pages (2/2 plans) -- completed 2026-02-26
- [x] Phase 7: Dry-run Form Submission Testing (2/2 plans) -- completed 2026-02-27
- [x] Phase 8: Animation and Transition Screenshot Testing (2/2 plans) -- completed 2026-02-28
- [x] Phase 9: Saved Test Suites with Replay (2/2 plans) -- completed 2026-03-03
- [x] Phase 10: Built-in Accessibility Audit with axe-core (2/2 plans) -- completed 2026-03-04
- [x] Phase 11: Complete SuiteRunner Integration (2/2 plans) -- completed 2026-03-04
- [x] Phase 12: Suite History and Replay (2/2 plans) -- completed 2026-03-04

**Full details:** `.planning/milestones/v1.0-ROADMAP.md`

</details>

<details>
<summary>v1.1 Beta Feedback (Phases 13-16) -- SHIPPED 2026-03-05</summary>

- [x] Phase 13: Login failure detection and status short-circuit (1/1 plans) -- completed 2026-03-05
- [x] Phase 14: Issue deduplication and severity tiers (1/1 plans) -- completed 2026-03-05
- [x] Phase 15: Crawl accuracy - login redirect detection and noise reduction (1/1 plans) -- completed 2026-03-05
- [x] Phase 16: MCP tool API consistency (1/1 plans) -- completed 2026-03-05

**Full details:** `.planning/milestones/v1.1-ROADMAP.md`

</details>

<details>
<summary>v1.2 Integration & Monitoring (Phases 17-19) -- SHIPPED 2026-03-10</summary>

- [x] Phase 17: Webhooks (2/2 plans) -- completed 2026-03-10
- [x] Phase 18: Watches (3/3 plans) -- completed 2026-03-10
- [x] Phase 19: HAR Export (2/2 plans) -- completed 2026-03-10

**Full details:** `.planning/milestones/v1.2-ROADMAP.md`

</details>

<details>
<summary>v1.3 Auto-Assertions (Phases 20-23) -- SHIPPED 2026-03-11</summary>

- [x] Phase 20: Baseline Engine (2/2 plans) -- completed 2026-03-10
- [x] Phase 21: Regression Detection (2/2 plans) -- completed 2026-03-10
- [x] Phase 22: MCP Tools (1/1 plan) -- completed 2026-03-10
- [x] Phase 23: Fix Cross-Phase Integration Wiring (1/1 plan) -- completed 2026-03-10

**Full details:** `.planning/milestones/v1.3-ROADMAP.md`

</details>

### v1.4 Internal Quality (Phases 24-28)

- [x] **Phase 24: Quick Wins** - Zero-risk, independent fixes across safePath, error format, webhooks, and naming (completed 2026-04-07)
- [x] **Phase 25: Login Extraction** - Extract shared login utility from 6 duplicated agent implementations (completed 2026-04-07)
- [x] **Phase 26: Async Job Helper** - Extract runAsyncJob helper to eliminate inline IIFE pattern across routes (completed 2026-04-07)
- [ ] **Phase 27: Auditor Split** - Split auditor.js god module into orchestrator and check category modules
- [ ] **Phase 28: MCP Parameter Transform** - Centralize snake_case to camelCase in Python client layer

---

## Phase Details

### Phase 24: Quick Wins
**Goal**: The codebase has no remaining path injection risks, error fields contain only messages, suites fire webhooks, and route files use consistent JobStore variable names
**Depends on**: Nothing (independent fixes)
**Requirements**: QW-01, QW-02, QW-03, QW-04, QW-05
**Success Criteria** (what must be TRUE):
  1. actions.js disk writes pass every path through safePath validation before writing
  2. All route job error fields store err.message only, never a stack trace
  3. Suites run endpoint accepts webhookUrl and delivers a webhook on completion
  4. JobStore variable names follow the same naming pattern across every route file
  5. MCP server.py builds URLs using httpx params= rather than f-string interpolation
**Plans:** 2/2 plans complete
Plans:
- [x] 24-01-PLAN.md -- safePath in actions.js, httpx params= in server.py, verify error fields
- [x] 24-02-PLAN.md -- webhook support on suites, JobStore naming consistency

### Phase 25: Login Extraction
**Goal**: A single shared login utility handles all auth variants, and every agent delegates to it instead of reimplementing inline
**Depends on**: Phase 24
**Requirements**: LOGIN-01, LOGIN-02, LOGIN-03, LOGIN-04, LOGIN-05, LOGIN-06
**Success Criteria** (what must be TRUE):
  1. src/utils/login.js exists and handles standard email/password auth end to end
  2. The same utility handles magic link, loginTrigger button, Twilio two-step, and skipLogin paths without duplication
  3. All 6 agents (crawler, auditor, actions, flows, fuzz, watch) call the shared utility instead of inline login code
  4. Deleting inline login code from any agent does not break its authentication behavior
**Plans:** 2/2 plans complete
Plans:
- [x] 25-01-PLAN.md -- Create shared login utility with all 5 auth variants (magic link, skipLogin, loginTrigger, Twilio, standard)
- [x] 25-02-PLAN.md -- Replace inline login in 5 agents (crawler, actions, flowTester, formFuzzer, watchManager) with shared utility

### Phase 26: Async Job Helper
**Goal**: Every async route operation is managed by a single runAsyncJob helper so lifecycle behavior (endTime, error format, webhook) is consistent everywhere
**Depends on**: Phase 24
**Requirements**: ASYNC-01, ASYNC-02, ASYNC-03
**Success Criteria** (what must be TRUE):
  1. runAsyncJob helper exists in jobStore.js and handles create, start, complete, error, and webhook in one call
  2. No route file contains an inline IIFE that manually sets job state; all use runAsyncJob
  3. Completed jobs across all operation types have identical endTime and error field shape
  4. Webhook delivery on job completion is triggered by runAsyncJob, not by individual route handlers
**Plans:** 2/2 plans complete
Plans:
- [x] 26-01-PLAN.md -- TDD: Create runAsyncJob helper in jobStore.js with full lifecycle management
- [x] 26-02-PLAN.md -- Migrate all 10 inline IIFEs across 5 route files to use runAsyncJob

### Phase 27: Auditor Split
**Goal**: auditor.js is an orchestrator under 200 lines; audit logic lives in focused check modules that can be tested and extended independently
**Depends on**: Phase 25
**Requirements**: AUDIT-01, AUDIT-02, AUDIT-03
**Success Criteria** (what must be TRUE):
  1. src/agent/audit-checks/ directory exists with one module per audit category
  2. SiteAuditor class loads check modules dynamically and delegates execution to them
  3. Each check module can be required and called in isolation with a shared context object without importing SiteAuditor
  4. All existing audit categories produce identical output before and after the split
**Plans:** 2 plans
Plans:
- [x] 26-01-PLAN.md -- TDD: Create runAsyncJob helper in jobStore.js with full lifecycle management
- [ ] 26-02-PLAN.md -- Migrate all 10 inline IIFEs across 5 route files to use runAsyncJob

### Phase 28: MCP Parameter Transform
**Goal**: The Python MCP client has one place where snake_case parameters become camelCase, and every tool uses a shared build_payload helper instead of hand-rolling dicts
**Depends on**: Phase 26
**Requirements**: MCP-01, MCP-02, MCP-03
**Success Criteria** (what must be TRUE):
  1. A single transformer function in client.py converts all snake_case keys to camelCase
  2. Every MCP tool function calls build_payload and passes through the transformer rather than constructing request dicts manually
  3. All query string parameters across MCP tools use httpx params= and are correctly percent-encoded
  4. Adding a new MCP tool requires no new snake_case handling code -- the helper covers it automatically
**Plans:** 2 plans
Plans:
- [ ] 26-01-PLAN.md -- TDD: Create runAsyncJob helper in jobStore.js with full lifecycle management
- [ ] 26-02-PLAN.md -- Migrate all 10 inline IIFEs across 5 route files to use runAsyncJob

---

## Progress

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 1. Foundation & Auth | v1.0 | 2/2 | Complete | 2026-02-16 |
| 5. Lighthouse Performance | v1.0 | 2/2 | Complete | 2026-02-25 |
| 6. Visual Diff | v1.0 | 2/2 | Complete | 2026-02-26 |
| 7. Dry-run Form Testing | v1.0 | 2/2 | Complete | 2026-02-27 |
| 8. Animation Screenshot | v1.0 | 2/2 | Complete | 2026-02-28 |
| 9. Saved Test Suites | v1.0 | 2/2 | Complete | 2026-03-03 |
| 10. Accessibility Audit | v1.0 | 2/2 | Complete | 2026-03-04 |
| 11. SuiteRunner Integration | v1.0 | 2/2 | Complete | 2026-03-04 |
| 12. Suite History & Replay | v1.0 | 2/2 | Complete | 2026-03-04 |
| 13. Login failure detection | v1.1 | 1/1 | Complete | 2026-03-05 |
| 14. Issue dedup & severity | v1.1 | 1/1 | Complete | 2026-03-05 |
| 15. Crawl accuracy | v1.1 | 1/1 | Complete | 2026-03-05 |
| 16. MCP tool consistency | v1.1 | 1/1 | Complete | 2026-03-05 |
| 17. Webhooks | v1.2 | 2/2 | Complete | 2026-03-10 |
| 18. Watches | v1.2 | 3/3 | Complete | 2026-03-10 |
| 19. HAR Export | v1.2 | 2/2 | Complete | 2026-03-10 |
| 20. Baseline Engine | v1.3 | 2/2 | Complete | 2026-03-10 |
| 21. Regression Detection | v1.3 | 2/2 | Complete | 2026-03-10 |
| 22. MCP Tools | v1.3 | 1/1 | Complete | 2026-03-10 |
| 23. Integration Wiring Fix | v1.3 | 1/1 | Complete | 2026-03-10 |
| 24. Quick Wins | v1.4 | 2/2 | Complete    | 2026-04-07 |
| 25. Login Extraction | v1.4 | 2/2 | Complete    | 2026-04-07 |
| 26. Async Job Helper | v1.4 | 2/2 | Complete   | 2026-04-07 |
| 27. Auditor Split | v1.4 | 0/? | Not started | - |
| 28. MCP Parameter Transform | v1.4 | 0/? | Not started | - |
