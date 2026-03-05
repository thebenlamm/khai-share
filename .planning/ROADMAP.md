# Roadmap: Khai — Browser-Based QA Testing

## Milestones

- ✅ **v1.0 MVP** — Phases 1, 5-12 (shipped 2026-03-04)
- 📋 **v1.1 Beta Feedback** — Phases 13-16 (planned)
- 📋 **v1.2 HomeBay Complete** — Phases 2-4 (planned)

## Phases

<details>
<summary>✅ v1.0 MVP (Phases 1, 5-12) — SHIPPED 2026-03-04</summary>

- [x] Phase 1: Foundation & Auth (2/2 plans) — completed 2026-02-16
- [x] Phase 5: Lighthouse Performance Audit Integration (2/2 plans) — completed 2026-02-25
- [x] Phase 6: Visual Diff Against Reference Pages (2/2 plans) — completed 2026-02-26
- [x] Phase 7: Dry-run Form Submission Testing (2/2 plans) — completed 2026-02-27
- [x] Phase 8: Animation and Transition Screenshot Testing (2/2 plans) — completed 2026-02-28
- [x] Phase 9: Saved Test Suites with Replay (2/2 plans) — completed 2026-03-03
- [x] Phase 10: Built-in Accessibility Audit with axe-core (2/2 plans) — completed 2026-03-04
- [x] Phase 11: Complete SuiteRunner Integration (2/2 plans) — completed 2026-03-04
- [x] Phase 12: Suite History and Replay (2/2 plans) — completed 2026-03-04

**Full details:** `.planning/milestones/v1.0-ROADMAP.md`

</details>

### 📋 v1.1 Beta Feedback (Planned)

- [x] Phase 13: Login failure detection and status short-circuit (1 plan) (completed 2026-03-05)
- [x] Phase 14: Issue deduplication and severity tiers (1 plan) (completed 2026-03-05)
- [ ] Phase 15: Crawl accuracy - login redirect detection and noise reduction (1 plan)
- [ ] Phase 16: MCP tool API consistency (0 plans)

### 📋 v1.2 HomeBay Complete (Planned)

- [ ] Phase 2: Role Workflows & Payments (0 plans)
- [ ] Phase 3: Real-Time Bidding (0 plans)
- [ ] Phase 4: Orchestration & Reporting (0 plans)

---

## Phase Details

### Phase 13: Login failure detection and status short-circuit
**Goal**: Surface login failures immediately in status polling instead of hiding behind "logging-in" state; contextualize issue counts during login phase
**Depends on**: v1.0 (Phase 12)
**Feedback**: BETA-FEEDBACK.md #1, #2, #5
**Plans:** 1/1 plans complete
Plans:
- [ ] 13-01-PLAN.md — Login-failed short-circuit, phase tracking, and MCP docstring update

### Phase 14: Issue deduplication and severity tiers
**Goal**: Deduplicate issues sharing the same root cause (e.g., DNS failure as both request-failed and console-error); add error/warning/passed severity tiers to result summaries
**Depends on**: Phase 13
**Feedback**: BETA-FEEDBACK.md #3, #6
**Plans:** 1/1 plans complete
Plans:
- [ ] 14-01-PLAN.md — Fingerprint-based issue dedup and severity-tier summary

### Phase 15: Crawl accuracy - login redirect detection and noise reduction
**Goal**: Detect when authenticated pages render login forms instead of expected content; allowlist known third-party request patterns (Sentry); confirm hash fragment URL deduplication
**Depends on**: Phase 14
**Feedback**: BETA-FEEDBACK.md #7, #8, #9
**Plans:** 1 plan
Plans:
- [ ] 15-01-PLAN.md — Login redirect detection, request allowlist, and link fragment cleanup

### Phase 16: MCP tool API consistency
**Goal**: Add khai_action_results MCP tool for parity with crawl test tools (separate status/results), or document the intentional difference
**Depends on**: Phase 13
**Feedback**: BETA-FEEDBACK.md #4
**Plans**: TBD

### Phase 2: Role Workflows & Payments
**Goal**: Every HomeBay user role completes their critical workflow, including Stripe test payments
**Depends on**: Phase 1
**Requirements**: AGNT-01-04, BUYR-01-04, SELL-01-03, ADMN-01-02, PAY-01-05
**Plans**: TBD

### Phase 3: Real-Time Bidding
**Goal**: Multi-browser concurrent bidding with WebSocket verification
**Depends on**: Phase 2
**Requirements**: BID-01-05
**Plans**: TBD

### Phase 4: Orchestration & Reporting
**Goal**: One-command suite execution with consolidated HTML reports
**Depends on**: Phase 3
**Requirements**: ORCH-01-03
**Plans**: TBD

---

## Progress

| Phase | Milestone | Plans | Status | Completed |
|-------|-----------|-------|--------|-----------|
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
| 15. Crawl accuracy | v1.1 | 0/1 | Not started | — |
| 16. MCP tool consistency | v1.1 | 0 | Not started | — |
| 2. Role Workflows | v1.2 | 0 | Not started | — |
| 3. Real-Time Bidding | v1.2 | 0 | Not started | — |
| 4. Orchestration | v1.2 | 0 | Not started | — |
