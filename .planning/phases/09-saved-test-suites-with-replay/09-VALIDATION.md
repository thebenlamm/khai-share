---
phase: 09
slug: saved-test-suites-with-replay
status: ready
nyquist_compliant: true
wave_0_complete: false
created: 2026-03-04
---

# Phase 09 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Node.js + native assert |
| **Config file** | none — Wave 0 creates test/suites.test.js |
| **Quick run command** | `node test/suites.test.js` |
| **Full suite command** | `node test/suites.test.js` |
| **Estimated runtime** | ~5 seconds |

---

## Sampling Rate

- **After every task commit:** Run manual curl smoke test (see Per-Task Verification Map)
- **After every plan wave:** Run `node test/suites.test.js` if test file exists
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 5 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 09-01-00 | 01 | 1 | SUITE-01 | syntax | `test -f config/suites/suite.schema.json && node -e "JSON.parse(require('fs').readFileSync('config/suites/suite.schema.json', 'utf8'))"` | ✅ W0 | ⬜ pending |
| 09-01-01 | 01 | 1 | SUITE-01-06 | syntax + unit | `node -c src/agent/suiteRunner.js && node -e "const {SuiteRunner} = require('./src/agent/suiteRunner'); console.log(typeof SuiteRunner);"` | ✅ W0 | ⬜ pending |
| 09-01-02 | 01 | 1 | SUITE-01 | syntax | `test -f config/suites/homebay-smoke.json && node -e "const suite = JSON.parse(require('fs').readFileSync('config/suites/homebay-smoke.json', 'utf8')); console.log(suite.suite.id);"` | ✅ W0 | ⬜ pending |
| 09-02-01 | 02 | 2 | SUITE-07-09 | syntax | `node -c src/routes/suites.js` | ✅ W0 | ⬜ pending |
| 09-02-02 | 02 | 2 | SUITE-07-09 | integration | `grep -n "app.use('/api/suites'" src/server.js` | ✅ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

**Manual smoke tests per task:**
- After 09-01: None (syntax checks only)
- After 09-02-01: `curl http://localhost:3001/api/suites` (requires server running)
- After 09-02-02: `curl -X POST http://localhost:3001/api/suites/homebay-smoke/run` (requires server running)

---

## Wave 0 Requirements

- [ ] `test/suites.test.js` — Basic unit tests for SUITE-01 through SUITE-09
  - Schema validation works (rejects invalid suites)
  - SuiteRunner constructor accepts valid suite
  - Tag filtering logic works (skips non-matching tests)
  - Timeout enforcement works (suite times out if exceeds limit)
  - History.jsonl appended after execution
  - API routes return ok/fail envelopes
  - Results stored in correct directory structure

*Create test file in Wave 1 of Plan 09-01 or as separate Wave 0 plan if needed.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Suite execution produces correct reports | SUITE-09 | File system verification | 1. Run suite via API, 2. Check reports/suites/{suiteId}/{runId}/summary.json exists, 3. Verify structure matches schema |
| Tag filtering skips tests correctly | SUITE-04 | Runtime behavior | 1. Run suite with `?tags=smoke`, 2. Verify only smoke-tagged tests executed in results |
| Critical test failure stops suite | SUITE-02 | Runtime behavior | 1. Modify homebay-smoke.json to make critical test fail, 2. Run suite, 3. Verify subsequent tests skipped |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references (test/suites.test.js noted)
- [x] No watch-mode flags
- [x] Feedback latency < 5s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** approved 2026-03-04
