---
phase: 7
slug: dry-run-form-submission-testing
status: draft
nyquist_compliant: true
wave_0_complete: false
created: 2026-03-04
---

# Phase 7 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Jest 29.x (standard for Node.js projects) |
| **Config file** | jest.config.js (Wave 0 installs if missing) |
| **Quick run command** | `npm test -- --testPathPattern=dryrun` |
| **Full suite command** | `npm test` |
| **Estimated runtime** | ~10 seconds |

---

## Sampling Rate

- **After every task commit:** Manual smoke test (run one dry-run test against HomeBay staging via curl)
- **After every plan wave:** Run full dry-run test suite via `npm test -- --testPathPattern=dryrun`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 10 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 07-01-01 | 01 | 1 | DRYRUN-01, DRYRUN-02, DRYRUN-03 | unit | `grep "setRequestInterception" src/homebay/dryrun.js` | ✅ | ⬜ pending |
| 07-01-02 | 01 | 1 | DRYRUN-02 | unit | `grep "discoverForms" src/agent/formFuzzer.js` | ✅ | ⬜ pending |
| 07-02-01 | 02 | 1 | DRYRUN-04, DRYRUN-05 | integration | `grep '"register"' config/homebay-dryrun.json` | ✅ | ⬜ pending |
| 07-02-02 | 02 | 1 | DRYRUN-04, DRYRUN-05 | integration | `curl -X POST http://localhost:3001/api/homebay/dryrun/register` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `jest.config.js` — Jest configuration for Node.js project (if missing)
- [ ] `test/dryrun.test.js` — Unit tests for DryRunTester class (mock Puppeteer page)
- [ ] `test/integration/homebay-dryrun.test.js` — Integration tests against HomeBay staging
- [ ] Framework install: `npm install --save-dev jest` — if not already present

**Note:** HomeBay is a testing tool (not production app), so testing the tests is optional. Wave 0 gaps listed for completeness but may be deferred. Manual smoke testing via curl is sufficient for MVP validation.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Form submissions actually prevented during dry-run | DRYRUN-01 | Requires checking staging database for absence of new records | 1. Run `curl -X POST http://localhost:3001/api/homebay/dryrun/register`<br>2. Check console logs for `[DryRun] Aborting POST` messages<br>3. Query HomeBay staging DB for new user records (should be none)<br>4. Verify response shows validation results without `201 Created` status |
| Real submissions still work (dry-run didn't break Phase 1 auth) | N/A (regression check) | Phase gate sanity check | 1. Run `curl -X POST http://localhost:3001/api/homebay/register` with valid data<br>2. Verify user created successfully<br>3. Confirms request interception is scoped to dry-run tests only |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references (optional for testing tools)
- [x] No watch-mode flags
- [x] Feedback latency < 10s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** approved 2026-03-04
