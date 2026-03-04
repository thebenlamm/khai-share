# Requirements: Khai -- HomeBay QA Testing

**Defined:** 2026-02-16
**Core Value:** One command tests every HomeBay user role through every critical flow and tells you what's broken

## v1 Requirements

### Infrastructure

- [ ] **INFRA-01**: Browser pool limits concurrent Puppeteer instances to 3 with guaranteed cleanup on failure/timeout
- [ ] **INFRA-02**: HomeBay credential config supports all 4 roles (admin, agent, seller, buyer) for staging environment
- [ ] **INFRA-03**: Base URL is configurable per environment (staging, preview deploy URL as parameter)
- [ ] **INFRA-04**: Health check verifies staging is up before starting test run

### Authentication & Navigation

- [ ] **AUTH-01**: User can log in as each of the 4 roles using stored credentials
- [ ] **AUTH-02**: User can register a new buyer account through the signup flow
- [ ] **AUTH-03**: User can reset password via email link flow
- [ ] **AUTH-04**: Page navigation handles Next.js client-side routing (waitForSelector, not waitForNavigation)
- [ ] **AUTH-05**: Form filling triggers React controlled component state updates (page.type, not setValue)

### Agent Workflows

- [ ] **AGNT-01**: Agent can create a new auction listing with property details
- [ ] **AGNT-02**: Agent can upload photos to an auction listing
- [ ] **AGNT-03**: Agent can invite bidders to an auction
- [ ] **AGNT-04**: Agent can monitor auction status from dashboard

### Buyer Workflows

- [ ] **BUYR-01**: Buyer can browse auction listings and view property details
- [ ] **BUYR-02**: Buyer can complete deposit via Stripe test card (4242424242424242)
- [ ] **BUYR-03**: Buyer can place a bid on an active auction
- [ ] **BUYR-04**: Buyer can view their bid history

### Seller Workflows

- [ ] **SELL-01**: Seller can view their property listing
- [ ] **SELL-02**: Seller can monitor active auction progress
- [ ] **SELL-03**: Seller can view settlement details after auction ends

### Admin Workflows

- [ ] **ADMN-01**: Admin can access dashboard and view system status
- [ ] **ADMN-02**: Admin can view active auctions and user activity

### Payments (Stripe Test Mode)

- [ ] **PAY-01**: Khai can interact with Stripe Elements iframes (card number, expiry, CVC in separate cross-origin frames)
- [ ] **PAY-02**: Deposit succeeds with test card 4242424242424242
- [ ] **PAY-03**: Deposit fails gracefully with decline card 4000000000000002
- [ ] **PAY-04**: Escrow hold is verified after successful deposit
- [ ] **PAY-05**: Refund flow completes and is verified

### Real-Time Bidding

- [ ] **BID-01**: Multi-browser simulation spawns 2-3 Puppeteer instances as different buyers
- [ ] **BID-02**: Buyer A places bid and Buyer B receives WebSocket update showing new price
- [ ] **BID-03**: Buyer B counter-bids and Buyer A receives WebSocket update
- [ ] **BID-04**: Anti-sniping extension triggers when bid placed in final seconds
- [ ] **BID-05**: WebSocket events verified (bid updates, timer changes) via page.evaluate or CDP

### Orchestration & Reporting

- [ ] **ORCH-01**: Single API endpoint or MCP tool runs all role flows and returns consolidated results
- [ ] **ORCH-02**: Pass/fail report shows results per role, per flow, with error details
- [ ] **ORCH-03**: Screenshots captured at each flow step and embedded in report
- [ ] **ORCH-04**: Cross-role workflow executes: agent creates auction -> buyers bid -> seller monitors
- [ ] **ORCH-05**: HTML report generated with screenshots, timing, and error details

### Performance Testing (Phase 5)

- [x] **PERF-01**: LighthouseAgent measures INP (Interaction to Next Paint) via Event Timing API
- [x] **PERF-02**: INP values scored using 2026 Core Web Vitals thresholds (good ≤200ms, poor >500ms)
- [x] **PERF-03**: Performance audits work on authenticated HomeBay pages (login → audit → results)
- [x] **PERF-04**: Each role has defined critical pages in config/homebay-perf.json
- [x] **PERF-05**: API endpoint POST /api/homebay/perf/:role exists for on-demand performance audits

### Visual Regression Testing (Phase 6)

- [x] **VIS-01**: Visual capture module authenticates as any role and captures full-page screenshots of critical pages
- [x] **VIS-02**: Screenshots are saved to role-specific directories with predictable naming (homebay-baselines/{role}/)
- [x] **VIS-03**: Dynamic content (timestamps, avatars, badges, counters) is hidden via CSS injection before capture to prevent false positives
- [x] **VIS-04**: Pixel-level comparison against role-specific baselines using existing VisualRegression class (pixelmatch)
- [x] **VIS-05**: API endpoints exist for capture (POST /visual/:role), comparison (POST /visual/:role/compare), baseline management (POST /visual/:role/set-baseline, GET /visual/:role/baseline)

### Dry-Run Form Testing (Phase 7)

- [ ] **DRYRUN-01**: Request interception blocks form POST/PUT/DELETE during dry-run tests
- [ ] **DRYRUN-02**: HTML5 validation state (checkValidity, ValidityState) captured for all form inputs
- [ ] **DRYRUN-03**: React validation errors ([role="alert"], .error) detected and reported
- [ ] **DRYRUN-04**: Dry-run tests work on authenticated pages (login before test)
- [ ] **DRYRUN-05**: API endpoint POST /api/homebay/dryrun/:form for on-demand validation testing

### Animation Testing (Phase 8)

- [ ] **ANIM-01**: Animation detection via Web Animations API getAnimations() with running state filtering
- [ ] **ANIM-02**: Wait for animation completion using animation.finished promises with timeout handling
- [ ] **ANIM-03**: Capture screenshots at specific animation progress points (0%, 50%, 100%) via currentTime manipulation
- [ ] **ANIM-04**: HomeBay skeleton transition captured in 3 states (visible, fading, hydrated) during login flows
- [ ] **ANIM-05**: Animation captures stored in screenshots/animations/{role}-{timestamp}/ directory structure
- [ ] **ANIM-06**: API endpoint POST /api/homebay/animation/:role exists for on-demand animation capture per role

### Test Suite Management (Phase 9)

- [ ] **SUITE-01**: Suite manifest saved to config/suites/ with JSON schema validation
- [ ] **SUITE-02**: Suite definition supports multiple test types (auth, performance, visual, dry-run, animation) with per-test configuration
- [ ] **SUITE-03**: Suite execution returns aggregated results with pass/fail/skip counts and per-test status
- [ ] **SUITE-04**: Tag filtering enables subset execution (@smoke, @critical, @regression)
- [ ] **SUITE-05**: Suite execution history tracked in newline-delimited JSON (history.jsonl) for trend analysis
- [ ] **SUITE-06**: Suite-level timeout enforced to prevent indefinite hangs
- [ ] **SUITE-07**: API endpoint POST /api/suites/:suiteId/run executes suite and returns runId
- [ ] **SUITE-08**: API endpoint GET /api/suites/:suiteId/runs/:runId/results retrieves aggregated results
- [ ] **SUITE-09**: Suite results stored in reports/suites/{suiteId}/{runId}/ with summary.json and per-test outputs

## v2 Requirements

### Extended Coverage

- **EXT-01**: Deployment SHA verification before test run (verify correct commit on staging)
- **EXT-02**: Visual regression comparison against baseline screenshots
- **EXT-03**: Mobile viewport testing for critical auction flows
- **EXT-04**: Email verification code capture via communication monitor
- **EXT-05**: Scheduled recurring test runs via Khai's scheduler

## Out of Scope

| Feature | Reason |
|---------|--------|
| Load/stress testing | Wrong tool -- Puppeteer is too heavy per session. Use k6/Artillery. |
| Production testing | Staging only -- never touch production data |
| Mobile app testing | HomeBay is web-only |
| Test recording/codegen | JSON flow definitions are more maintainable |
| Visual AI (Applitools) | Pixelmatch already integrated, deterministic, free |
| Playwright migration | Puppeteer v24 is sufficient, migration adds risk for zero user value |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| INFRA-01 | Phase 1 | Pending |
| INFRA-02 | Phase 1 | Pending |
| INFRA-03 | Phase 1 | Pending |
| INFRA-04 | Phase 1 | Pending |
| AUTH-01 | Phase 1 | Pending |
| AUTH-02 | Phase 1 | Pending |
| AUTH-03 | Phase 1 | Pending |
| AUTH-04 | Phase 1 | Pending |
| AUTH-05 | Phase 1 | Pending |
| AGNT-01 | Phase 2 | Pending |
| AGNT-02 | Phase 2 | Pending |
| AGNT-03 | Phase 2 | Pending |
| AGNT-04 | Phase 2 | Pending |
| BUYR-01 | Phase 2 | Pending |
| BUYR-02 | Phase 2 | Pending |
| BUYR-03 | Phase 2 | Pending |
| BUYR-04 | Phase 2 | Pending |
| SELL-01 | Phase 2 | Pending |
| SELL-02 | Phase 2 | Pending |
| SELL-03 | Phase 2 | Pending |
| ADMN-01 | Phase 2 | Pending |
| ADMN-02 | Phase 2 | Pending |
| PAY-01 | Phase 2 | Pending |
| PAY-02 | Phase 2 | Pending |
| PAY-03 | Phase 2 | Pending |
| PAY-04 | Phase 2 | Pending |
| PAY-05 | Phase 2 | Pending |
| BID-01 | Phase 3 | Pending |
| BID-02 | Phase 3 | Pending |
| BID-03 | Phase 3 | Pending |
| BID-04 | Phase 3 | Pending |
| BID-05 | Phase 3 | Pending |
| ORCH-01 | Phase 4 | Pending |
| ORCH-02 | Phase 4 | Pending |
| ORCH-03 | Phase 4 | Pending |
| ORCH-04 | Phase 4 | Pending |
| ORCH-05 | Phase 4 | Pending |
| PERF-01 | Phase 5 | Complete |
| PERF-02 | Phase 5 | Complete |
| PERF-03 | Phase 5 | Complete |
| PERF-04 | Phase 5 | Complete |
| PERF-05 | Phase 5 | Complete |
| VIS-01 | Phase 6 | Complete |
| VIS-02 | Phase 6 | Complete |
| VIS-03 | Phase 6 | Complete |
| VIS-04 | Phase 6 | Complete |
| VIS-05 | Phase 6 | Complete |
| DRYRUN-01 | Phase 7 | Pending |
| DRYRUN-02 | Phase 7 | Pending |
| DRYRUN-03 | Phase 7 | Pending |
| DRYRUN-04 | Phase 7 | Pending |
| DRYRUN-05 | Phase 7 | Pending |
| ANIM-01 | Phase 8 | Pending |
| ANIM-02 | Phase 8 | Pending |
| ANIM-03 | Phase 8 | Pending |
| ANIM-04 | Phase 8 | Pending |
| ANIM-05 | Phase 8 | Pending |
| ANIM-06 | Phase 8 | Pending |
| SUITE-01 | Phase 9 | Pending |
| SUITE-02 | Phase 9 | Pending |
| SUITE-03 | Phase 9 | Pending |
| SUITE-04 | Phase 9 | Pending |
| SUITE-05 | Phase 9 | Pending |
| SUITE-06 | Phase 9 | Pending |
| SUITE-07 | Phase 9 | Pending |
| SUITE-08 | Phase 9 | Pending |
| SUITE-09 | Phase 9 | Pending |

**Coverage:**
- v1 requirements: 62 total
- Mapped to phases: 62
- Unmapped: 0

---
*Requirements defined: 2026-02-16*
*Last updated: 2026-03-04 after Phase 9 planning (saved test suites with replay)*
