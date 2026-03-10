# Roadmap: Khai -- Browser Automation MCP Server

## Milestones

- v1.0 MVP -- Phases 1, 5-12 (shipped 2026-03-04)
- v1.1 Beta Feedback -- Phases 13-16 (shipped 2026-03-05)
- v1.2 Integration & Monitoring -- Phases 17-19 (shipped 2026-03-10)
- v1.3 Auto-Assertions -- Phases 20-22 (active)

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

### v1.3 Auto-Assertions (Active)

- [ ] **Phase 20: Baseline Engine** - Crawl captures page metadata; baseline CRUD REST API with threshold config
- [ ] **Phase 21: Regression Detection** - Comparison engine diffs current crawl against baseline; regressions surface in results and webhooks
- [ ] **Phase 22: MCP Tools** - Claude Code tools for baseline management and regression visibility

---

## Phase Details

### Phase 20: Baseline Engine
**Goal**: Users can create, view, update, and delete baselines that capture crawl snapshot data with configurable timing thresholds
**Depends on**: Phase 19 (existing crawl infrastructure)
**Requirements**: BASE-01, BASE-02, BASE-03, BASE-04, BASE-05, THRS-01, THRS-02
**Success Criteria** (what must be TRUE):
  1. User can create a baseline from a completed crawl test ID and see it stored with page URLs, titles, status codes, and response timing
  2. User can list all baselines for a site+account and see each baseline's metadata
  3. User can view the full snapshot data captured in a specific baseline
  4. User can delete a baseline and confirm it no longer appears in listings
  5. User can update a baseline from a new crawl test and the baseline ID and any custom thresholds are preserved
**Plans:** 1/2 plans executed
Plans:
- [ ] 20-01-PLAN.md -- Crawler title capture + BaselineManager CRUD module
- [ ] 20-02-PLAN.md -- Baseline REST API routes + documentation updates

### Phase 21: Regression Detection
**Goal**: Crawl completions automatically compare against the site's active baseline and surface regressions in results and webhooks
**Depends on**: Phase 20
**Requirements**: REGR-01, REGR-02, REGR-03, REGR-04
**Success Criteria** (what must be TRUE):
  1. When a crawl completes for a site+account with an active baseline, regression detection runs automatically without user action
  2. Regression results show specific diffs: changed titles, new or missing pages, status code changes, and timing degradation against threshold
  3. GET /api/test/{testId}/results includes a regressions field alongside the existing issues data when a baseline exists
  4. Webhook payloads for crawl completion include a regression summary when a baseline exists for that site+account
**Plans**: TBD

### Phase 22: MCP Tools
**Goal**: Claude Code can create baselines and inspect regression results directly through MCP tools without using the REST API
**Depends on**: Phase 21
**Requirements**: MCPA-01, MCPA-02
**Success Criteria** (what must be TRUE):
  1. Claude Code can call a single MCP tool to create a baseline from a crawl test ID and receive confirmation with baseline details
  2. Claude Code can call a single MCP tool to list baselines for a site, view a specific baseline's snapshot, or delete a baseline
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
| 15. Crawl accuracy | v1.1 | 1/1 | Complete | 2026-03-05 |
| 16. MCP tool consistency | v1.1 | 1/1 | Complete | 2026-03-05 |
| 17. Webhooks | v1.2 | 2/2 | Complete | 2026-03-10 |
| 18. Watches | v1.2 | 3/3 | Complete | 2026-03-10 |
| 19. HAR Export | v1.2 | 2/2 | Complete | 2026-03-10 |
| 20. Baseline Engine | 1/2 | In Progress|  | - |
| 21. Regression Detection | v1.3 | 0/? | Not started | - |
| 22. MCP Tools | v1.3 | 0/? | Not started | - |
