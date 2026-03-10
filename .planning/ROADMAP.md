# Roadmap: Khai -- Browser Automation MCP Server

## Milestones

- v1.0 MVP -- Phases 1, 5-12 (shipped 2026-03-04)
- v1.1 Beta Feedback -- Phases 13-16 (shipped 2026-03-05)
- v1.2 Integration & Monitoring -- Phases 17-19 (in progress)

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

---

### v1.2 Integration & Monitoring (In Progress)

**Milestone Goal:** Add webhook-based integrations, authenticated page monitoring, and network trace export so Khai can push results to external systems and detect changes on authenticated pages over time.

## Phase Summary

- [ ] **Phase 17: Webhooks** - Operations can POST signed results to external URLs on completion
- [ ] **Phase 18: Watches** - Scheduled authenticated page monitoring with change detection
- [ ] **Phase 19: HAR Export** - Full network trace recording and retrieval for action sessions

## Phase Details

### Phase 17: Webhooks
**Goal**: Any async operation can notify an external system when it completes
**Depends on**: Phase 16 (consistent 3-tool MCP pattern established)
**Requirements**: HOOK-01, HOOK-02, HOOK-03, HOOK-04, HOOK-05
**Success Criteria** (what must be TRUE):
  1. User can pass a `webhookUrl` to any start operation (test, audit, action, link check) and receive a POST to that URL when the operation completes
  2. Webhook payload contains the full operation results, not just a status signal
  3. If the webhook endpoint is down or returns an error, Khai retries up to 3 times with exponential backoff before giving up
  4. Webhook requests include an HMAC-SHA256 signature header computed from a configurable shared secret, verifiable by the receiver
  5. Operation results include a `webhook` field showing delivery status (delivered, failed, or retrying)
**Plans:** 2 plans

Plans:
- [ ] 17-01-PLAN.md -- Webhook delivery engine and route integration
- [ ] 17-02-PLAN.md -- MCP tool parameters and documentation updates

### Phase 18: Watches
**Goal**: Users can monitor authenticated pages on a schedule and be alerted when content changes
**Depends on**: Phase 17 (webhook delivery consumed by WATCH-04)
**Requirements**: WATCH-01, WATCH-02, WATCH-03, WATCH-04, WATCH-05, WATCH-06, WATCH-07
**Success Criteria** (what must be TRUE):
  1. User can create a watch by specifying a site, account, URL, optional CSS selector, and cron schedule, and Khai begins running it automatically
  2. On each scheduled run, Khai logs into the site and captures current page content and a screenshot
  3. Khai compares the current snapshot to the previous one and surfaces a diff (content and/or visual) when something has changed
  4. When a change is detected, Khai fires a webhook notification to the configured URL
  5. User can list, create, update, and delete watches via REST API and via MCP tools
  6. Watch history stores past snapshots and change events so users can review what changed and when
**Plans**: TBD

### Phase 19: HAR Export
**Goal**: Action sessions can record the full network trace so users can replay and analyze browser activity
**Depends on**: Phase 16 (action session pattern established; HAR is additive)
**Requirements**: HAR-01, HAR-02, HAR-03, HAR-04
**Success Criteria** (what must be TRUE):
  1. User can add a `recordHar: true` parameter when starting an action session to enable HAR capture
  2. All network requests and responses made during the session are captured via Chrome DevTools Protocol and written to a valid HAR file
  3. Completed HAR files are saved to disk and retrievable via a REST endpoint for that session
  4. MCP tool exposes HAR retrieval so Claude Code can access the network trace without using the REST API directly
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
| 17. Webhooks | v1.2 | 0/2 | Not started | - |
| 18. Watches | v1.2 | 0/TBD | Not started | - |
| 19. HAR Export | v1.2 | 0/TBD | Not started | - |
