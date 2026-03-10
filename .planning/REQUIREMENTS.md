# Requirements: Khai v1.3 — Auto-Assertions

**Defined:** 2026-03-10
**Core Value:** Give Claude Code the ability to log into websites, take screenshots, run security audits, and test flows that require real browser interaction and stored credentials.

## v1.3 Requirements

### Baselines

- [x] **BASE-01**: User can create a baseline from a completed crawl test, snapshotting page URLs, titles, status codes, and response timing
- [x] **BASE-02**: User can list all saved baselines for a site
- [x] **BASE-03**: User can view a baseline's snapshot data (what was captured)
- [x] **BASE-04**: User can delete a baseline that is no longer needed
- [x] **BASE-05**: User can update an existing baseline from a new crawl test, preserving the baseline ID and threshold config

### Regression Detection

- [x] **REGR-01**: When a crawl test completes, Khai automatically compares results against the site's active baseline (one per site+account) and flags regressions
- [x] **REGR-02**: Regressions include specific diffs: changed titles, new/missing pages, status code changes, timing degradation
- [ ] **REGR-03**: Regression results are included in the crawl test results payload (alongside existing issue data)
- [ ] **REGR-04**: Webhook payloads for crawl completion include regression summary when a baseline exists

### Thresholds

- [x] **THRS-01**: User can set timing thresholds at baseline creation time (stored with the baseline JSON)
- [x] **THRS-02**: Default thresholds are applied when no custom thresholds are set

### MCP Tools

- [ ] **MCPA-01**: MCP tool to create a baseline from a completed crawl test
- [ ] **MCPA-02**: MCP tool to list, view, and delete baselines for a site

## Future Requirements (v1.4+)

### DOM Element Assertions

- **DOM-01**: User can specify CSS selectors for key DOM elements to include in baseline snapshots
- **DOM-02**: Regressions flag missing or changed DOM elements based on selector config

## Out of Scope

| Feature | Reason |
|---------|--------|
| DOM element assertions | Rabbit hole — selector config system is a separate milestone |
| Auto-update baseline on success | Race condition risk with concurrent crawls; explicit update only |
| Multiple baselines per site+account | One active baseline per site+account keeps comparison simple |
| Load/stress testing thresholds | Functional QA, not performance benchmarking |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| BASE-01 | Phase 20 | Complete |
| BASE-02 | Phase 20 | Complete |
| BASE-03 | Phase 20 | Complete |
| BASE-04 | Phase 20 | Complete |
| BASE-05 | Phase 20 | Complete |
| THRS-01 | Phase 20 | Complete |
| THRS-02 | Phase 20 | Complete |
| REGR-01 | Phase 21 | Complete |
| REGR-02 | Phase 21 | Complete |
| REGR-03 | Phase 21 | Pending |
| REGR-04 | Phase 21 | Pending |
| MCPA-01 | Phase 22 | Pending |
| MCPA-02 | Phase 22 | Pending |

**Coverage:**
- v1.3 requirements: 13 total
- Mapped to phases: 13
- Unmapped: 0

---
*Requirements defined: 2026-03-10*
*Last updated: 2026-03-10 after roadmap creation*
