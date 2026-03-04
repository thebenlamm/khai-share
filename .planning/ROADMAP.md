# Roadmap: Khai -- HomeBay QA Testing

## Overview

Extend Khai's browser automation into a comprehensive HomeBay QA testing suite. Start with infrastructure (browser pooling, credentials, Next.js-aware navigation), then build all role-specific workflows and Stripe payment testing, then tackle the hardest problem (multi-browser concurrent bidding with WebSocket verification), and finally wire everything into a single-command orchestrated test suite with HTML reporting.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [ ] **Phase 1: Foundation & Auth** - Browser pool, credentials, login flows, Next.js/React navigation patterns
- [ ] **Phase 2: Role Workflows & Payments** - All 4 role flows plus Stripe test mode transactions
- [ ] **Phase 3: Real-Time Bidding** - Multi-browser concurrent bidding with WebSocket event verification
- [ ] **Phase 4: Orchestration & Reporting** - One-command suite, cross-role workflow, HTML reports

## Phase Details

### Phase 1: Foundation & Auth
**Goal**: Khai can log into HomeBay staging as any role and navigate pages reliably
**Depends on**: Nothing (first phase)
**Requirements**: INFRA-01, INFRA-02, INFRA-03, INFRA-04, AUTH-01, AUTH-02, AUTH-03, AUTH-04, AUTH-05
**Success Criteria** (what must be TRUE):
  1. Browser pool enforces max 3 concurrent Puppeteer instances and cleans up all browsers on failure or timeout
  2. Khai logs into HomeBay staging as admin, agent, seller, and buyer using stored credentials
  3. Khai registers a new buyer account through the signup flow and resets a password via email link
  4. Page navigation works with Next.js client-side routing (no stale page errors) and form filling triggers React state updates
  5. Health check confirms staging is reachable before any test run begins
**Plans**: 2 plans

Plans:
- [ ] 01-01-PLAN.md — Browser pool infrastructure and HomeBay credential management
- [ ] 01-02-PLAN.md — Auth flows (login, register, password reset) and API route wiring

### Phase 2: Role Workflows & Payments
**Goal**: Every HomeBay user role completes their critical workflow, including Stripe test payments
**Depends on**: Phase 1
**Requirements**: AGNT-01, AGNT-02, AGNT-03, AGNT-04, BUYR-01, BUYR-02, BUYR-03, BUYR-04, SELL-01, SELL-02, SELL-03, ADMN-01, ADMN-02, PAY-01, PAY-02, PAY-03, PAY-04, PAY-05
**Success Criteria** (what must be TRUE):
  1. Agent creates an auction listing with photos, invites bidders, and monitors status from dashboard
  2. Buyer browses listings, completes deposit via Stripe test card (4242424242424242), places a bid, and views bid history
  3. Seller views their property listing, monitors auction progress, and views settlement details
  4. Admin accesses dashboard, views system status, active auctions, and user activity
  5. Stripe Elements iframes are filled correctly (cross-origin frame.type), deposits succeed and fail gracefully, escrow holds are verified, and refunds complete
**Plans**: TBD

Plans:
- [ ] 02-01: Agent and admin workflow flows
- [ ] 02-02: Buyer and seller workflow flows with Stripe integration

### Phase 3: Real-Time Bidding
**Goal**: Multiple browser instances simulate concurrent buyers bidding in real-time with WebSocket verification
**Depends on**: Phase 2
**Requirements**: BID-01, BID-02, BID-03, BID-04, BID-05
**Success Criteria** (what must be TRUE):
  1. BidSimulator spawns 2-3 Puppeteer instances as different authenticated buyers on the same auction
  2. Buyer A places a bid and Buyer B's page reflects the updated price via WebSocket within 5 seconds
  3. Buyer B counter-bids and Buyer A receives the WebSocket update showing the new high bid
  4. A bid placed in the final seconds triggers the anti-sniping auction extension
  5. WebSocket events (bid updates, timer changes) are captured and verified via page.evaluate or CDP
**Plans**: TBD

Plans:
- [ ] 03-01: BidSimulator and WebSocket event verification

### Phase 4: Orchestration & Reporting
**Goal**: One command runs all HomeBay tests across all roles and produces a consolidated HTML report
**Depends on**: Phase 3
**Requirements**: ORCH-01, ORCH-02, ORCH-03, ORCH-04, ORCH-05
**Success Criteria** (what must be TRUE):
  1. A single API endpoint or MCP tool runs all role flows and returns consolidated pass/fail results
  2. Cross-role workflow executes end-to-end: agent creates auction, buyers bid, seller monitors
  3. HTML report shows results per role, per flow, with screenshots at each step, timing, and error details
**Plans**: TBD

Plans:
- [ ] 04-01: TestOrchestrator, cross-role workflow, and HTML reporting

## Progress

**Execution Order:**
Phases execute in numeric order: 1 -> 2 -> 3 -> 4

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Foundation & Auth | 0/2 | Not started | - |
| 2. Role Workflows & Payments | 0/2 | Not started | - |
| 3. Real-Time Bidding | 0/1 | Not started | - |
| 4. Orchestration & Reporting | 0/1 | Not started | - |

### Phase 5: Lighthouse performance audit integration

**Goal:** Khai measures Core Web Vitals (TTFB, FCP, LCP, CLS, INP) on authenticated HomeBay pages per role
**Requirements**: PERF-01, PERF-02, PERF-03, PERF-04, PERF-05
**Depends on:** Phase 1 (requires BrowserPool and auth flows)
**Success Criteria** (what must be TRUE):
  1. LighthouseAgent measures INP (Interaction to Next Paint) alongside existing Core Web Vitals
  2. Performance audits work on authenticated HomeBay pages after role login
  3. Each role has defined critical pages in config/homebay-perf.json
  4. Results include 2026 threshold-based scoring (good/needs-improvement/poor)
  5. API endpoint POST /api/homebay/perf/:role exists for on-demand audits
  6. Performance audits integrate with BrowserPool (respecting max-3 concurrency)
**Plans:** 2 plans

Plans:
- [x] 05-01-PLAN.md — Extend LighthouseAgent with INP measurement via Event Timing API
- [x] 05-02-PLAN.md — HomeBay performance integration and API routes

### Phase 6: Visual diff against reference pages

**Goal:** Khai captures baseline screenshots of authenticated HomeBay pages per role and detects visual regressions via pixel-level comparison
**Requirements**: VIS-01, VIS-02, VIS-03, VIS-04, VIS-05
**Depends on:** Phase 5
**Plans:** 2/2 plans complete

Plans:
- [x] 06-01-PLAN.md — Visual capture module and critical page configuration
- [x] 06-02-PLAN.md — API routes and baseline management endpoints

### Phase 7: Dry-run form submission testing

**Goal:** Khai validates form behavior on authenticated HomeBay pages without creating test data or triggering side effects
**Requirements**: DRYRUN-01, DRYRUN-02, DRYRUN-03, DRYRUN-04, DRYRUN-05
**Depends on:** Phase 6
**Success Criteria** (what must be TRUE):
  1. DryRunTester blocks form POST/PUT/DELETE requests during test execution
  2. HTML5 validation state (checkValidity, ValidityState) is captured for all form inputs
  3. React error elements ([role="alert"], .error) are detected and included in results
  4. Dry-run tests authenticate as a role before testing authenticated forms
  5. API endpoint POST /api/homebay/dryrun/:form accepts test configuration and returns validation results
**Plans:** 2 plans

Plans:
- [x] 07-01-PLAN.md — DryRunTester class with request interception and validation state inspection
- [x] 07-02-PLAN.md — HomeBay dry-run integration and API routes

### Phase 8: Animation and transition screenshot testing

**Goal:** Khai detects and captures HomeBay animations (skeleton transitions, countdown timers, bid updates) at specific states for visual regression testing
**Requirements**: ANIM-01, ANIM-02, ANIM-03, ANIM-04, ANIM-05, ANIM-06
**Depends on:** Phase 7
**Success Criteria** (what must be TRUE):
  1. Agent can detect running animations via Web Animations API and wait for completion
  2. Agent can capture screenshots at specific animation progress points (0%, 50%, 100%)
  3. HomeBay skeleton transitions captured in 3 states (visible, fading, hydrated) during login
  4. API endpoint POST /api/homebay/animation/:role exists for on-demand animation capture
  5. Animation captures stored in screenshots/animations/ with role/timestamp structure
  6. No new npm dependencies added (uses browser-native Web Animations API)
**Plans:** 2 plans

Plans:
- [x] 08-01-PLAN.md — Animation detection and capture module using Web Animations API
- [x] 08-02-PLAN.md — HomeBay animation testing integration and API routes

### Phase 9: Saved test suites with replay ✓

**Goal:** Users can save multi-test configurations as named suites and replay them on demand with aggregated reporting
**Requirements**: SUITE-01, SUITE-02, SUITE-03, SUITE-04, SUITE-05, SUITE-06, SUITE-07, SUITE-08, SUITE-09
**Depends on:** Phase 8
**Success Criteria** (what must be TRUE):
  1. Suite manifests saved to config/suites/ with JSON schema validation
  2. Suite execution orchestrates multiple test types (auth, performance, visual, dry-run, animation) sequentially
  3. Tag filtering enables subset execution (@smoke runs critical-path tests only)
  4. Suite timeout prevents indefinite hangs (300s default, configurable per suite)
  5. Suite execution history tracked in reports/suites/history.jsonl for trend analysis
  6. API endpoints exist for suite execution (POST /api/suites/:suiteId/run) and result retrieval (GET /api/suites/:suiteId/runs/:runId/results)
**Plans:** 2/2 plans complete
**Completed:** 2026-03-04

Plans:
- [x] 09-01-PLAN.md — SuiteRunner class with test orchestration and result aggregation
- [x] 09-02-PLAN.md — Suite API routes and example suite manifests

### Phase 10: Built-in accessibility audit with axe-core

**Goal:** Khai measures WCAG 2.0/2.1/2.2 compliance on authenticated HomeBay pages per role using axe-core
**Requirements**: A11Y-01, A11Y-02, A11Y-03, A11Y-04, A11Y-05, A11Y-06, A11Y-07
**Depends on:** Phase 9
**Success Criteria** (what must be TRUE):
  1. axe-core runs on authenticated HomeBay pages with CSP bypass enabled
  2. Each role has defined critical pages in config/homebay-a11y.json with third-party widget exclusions
  3. Violations reported by severity (critical, serious, moderate, minor) with element selectors and remediation guidance
  4. Incomplete results included in reports for manual review
  5. API endpoint POST /api/homebay/a11y/:role exists for on-demand accessibility audits
  6. WCAG 2.0/2.1/2.2 rules applied via configurable tag filtering (wcag2a, wcag2aa)
**Plans:** 1/2 plans executed

Plans:
- [ ] 10-01-PLAN.md — AccessibilityAgent with axe-core integration and WCAG rule application
- [ ] 10-02-PLAN.md — HomeBay accessibility integration and API routes
