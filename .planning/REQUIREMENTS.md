# Requirements: Khai v1.2 — Integration & Monitoring

**Defined:** 2026-03-10
**Core Value:** Give Claude Code the ability to log into websites, take screenshots, run security audits, and test flows that require real browser interaction and stored credentials.

## v1.2 Requirements

### Webhooks

- [x] **HOOK-01**: User can add optional `webhookUrl` parameter to any async operation (test, audit, action, link check)
- [x] **HOOK-02**: Khai POSTs full operation results to the webhook URL on completion
- [x] **HOOK-03**: Webhook delivery retries up to 3x with exponential backoff on target failure
- [x] **HOOK-04**: Webhook payloads are signed with HMAC-SHA256 using a configurable shared secret
- [x] **HOOK-05**: Webhook delivery status is included in operation results (delivered, failed, retrying)

### Watches

- [x] **WATCH-01**: User can define a watch: site + account + URL + CSS selector (optional) + schedule (cron expression)
- [x] **WATCH-02**: Watches run on schedule, logging into the site and capturing page content/screenshots
- [x] **WATCH-03**: Change detection compares current snapshot to previous — content diff and/or visual diff
- [x] **WATCH-04**: Watch fires webhook notification when a change is detected
- [x] **WATCH-05**: User can list, create, update, and delete watches via REST API
- [x] **WATCH-06**: Watch history stores snapshots and change events for review
- [x] **WATCH-07**: MCP tools expose watch management (list, create, delete, get results)

### HAR Export

- [x] **HAR-01**: User can enable HAR recording for any action session via parameter
- [x] **HAR-02**: HAR capture records all network requests/responses via CDP during the session
- [x] **HAR-03**: HAR files are saved to disk and retrievable via REST API endpoint
- [x] **HAR-04**: MCP tool exposes HAR retrieval for completed action sessions

## Future Requirements (v1.3)

### Auto-Assertions

- **ASSERT-01**: Auto-generate regression assertions from a successful crawl baseline (titles, elements, status codes, timing)
- **ASSERT-02**: Subsequent runs compare against baseline and flag regressions
- **ASSERT-03**: Configurable thresholds for timing-based assertions

## Out of Scope

| Feature | Reason |
|---------|--------|
| Document/file context for actions | Scope creep toward general-purpose agent territory |
| Natural language action interpretation | Structured JSON is more reliable for repeatable test suites |
| Push notifications (native/mobile) | Webhooks cover all notification needs |
| Auto-assertions | Deferred to v1.3 — needs watch history to calibrate baselines |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| HOOK-01 | Phase 17 | Complete |
| HOOK-02 | Phase 17 | Complete |
| HOOK-03 | Phase 17 | Complete |
| HOOK-04 | Phase 17 | Complete |
| HOOK-05 | Phase 17 | Complete |
| WATCH-01 | Phase 18 | Complete |
| WATCH-02 | Phase 18 | Complete |
| WATCH-03 | Phase 18 | Complete |
| WATCH-04 | Phase 18 | Complete |
| WATCH-05 | Phase 18 | Complete |
| WATCH-06 | Phase 18 | Complete |
| WATCH-07 | Phase 18 | Complete |
| HAR-01 | Phase 19 | Complete |
| HAR-02 | Phase 19 | Complete |
| HAR-03 | Phase 19 | Complete |
| HAR-04 | Phase 19 | Complete |

**Coverage:**
- v1.2 requirements: 16 total
- Mapped to phases: 16
- Unmapped: 0

---
*Requirements defined: 2026-03-10*
*Last updated: 2026-03-10 after roadmap creation*
