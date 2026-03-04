---
phase: 12-suite-history-and-replay
plan: 01
subsystem: agent
tags: [suite-runner, replay, historical-runs, configuration-preservation]
completed: 2026-03-04T17:30:21Z
duration: 59
requires: [SUITE-09]
provides:
  - SuiteRunner.replayRun() static method
  - Enhanced summary.json with suite config preservation
affects:
  - reports/suites/{suiteId}/{runId}/summary.json (now includes suite + originalTests)
  - SuiteRunner class API surface (adds static replayRun method)
tech_stack:
  added: []
  patterns:
    - "Historical run replay via config preservation"
    - "Static factory method for alternate instantiation"
key_files:
  created: []
  modified:
    - src/agent/suiteRunner.js
decisions:
  - "Store full suite manifest in summary.json for replay without config/suites/ dependency"
  - "Use static method pattern (not instance method) since replay creates new SuiteRunner internally"
  - "Preserve original tags and dryRun settings from historical run"
  - "Validate config exists and throw descriptive error for pre-Phase-12 runs"
metrics:
  tasks_completed: 2
  tests_added: 0
  files_modified: 1
  loc_added: 50
---

# Phase 12 Plan 01: Suite History and Replay Summary

**One-liner:** Historical suite runs preserved with full config in summary.json, enabling replay via static SuiteRunner.replayRun() method

## What Was Built

Added replay capability to SuiteRunner by preserving full suite configuration in summary.json and implementing a static replayRun() method that loads historical config and re-executes with new runId.

## Implementation Details

### Task 1: Config Preservation in _saveResults()

Modified `_saveResults()` method to write enhanced summary.json:

```javascript
const summaryWithConfig = {
  ...results,
  suite: this.suite.suite,        // Full suite metadata
  originalTests: this.suite.tests // Original test definitions before execution
};
fs.writeFileSync(summaryPath, JSON.stringify(summaryWithConfig, null, 2));
```

**Why:** Enables replay without depending on config/suites/ manifests which may be modified or deleted. Follows Chrome DevTools Recorder pattern (research: Phase 12 "Store full config for replay").

**Result:** summary.json now contains:
- All existing fields (suiteId, status, duration, tests results, etc.)
- NEW: `suite` object with full metadata (id, name, version, description, timeout)
- NEW: `originalTests` array with pristine test definitions

### Task 2: Static replayRun() Method

Added static method to SuiteRunner class (after constructor, line ~44):

```javascript
static async replayRun(suiteId, runId) {
  // Load historical summary
  const summaryPath = path.join(SUITES_REPORTS_DIR, suiteId, runId, 'summary.json');
  if (!fs.existsSync(summaryPath)) {
    throw new Error(`Historical run not found: ${suiteId}/${runId}`);
  }

  const summary = JSON.parse(fs.readFileSync(summaryPath, 'utf8'));

  // Validate config exists (Phase 12+ requirement)
  if (!summary.suite || !summary.originalTests) {
    throw new Error(`Historical run ${runId} is missing suite config (was it saved before Phase 12?)`);
  }

  // Reconstruct suite manifest
  const suite = {
    suite: summary.suite,
    tests: summary.originalTests
  };

  // Execute with new runId, preserving original options
  const newRunId = new Date().toISOString().replace(/[:.]/g, '-');
  const runner = new SuiteRunner(suite, {
    runId: newRunId,
    tags: summary.tags || [],
    dryRun: summary.dryRun || false
  });

  console.log(`[SuiteRunner] Replaying ${suiteId}/${runId} as ${newRunId}`);
  return await runner.execute();
}
```

**Design decisions:**
- **Static method** (not instance) - replay doesn't need existing instance state; creates new SuiteRunner internally
- **New runId generated** - preserves original config but creates new timestamp for results
- **Preserve original options** - tags and dryRun settings carried forward from historical run
- **Validation with descriptive errors** - throws helpful error for pre-Phase-12 runs missing config

## Example Usage

### Summary.json Structure (After Phase 12)

```json
{
  "suiteId": "homebay-smoke",
  "suiteName": "HomeBay Smoke Tests",
  "suiteVersion": "1.0.0",
  "runId": "2026-03-04T17-30-15-123Z",
  "status": "passed",
  "startTime": "2026-03-04T17:30:15.123Z",
  "endTime": "2026-03-04T17:32:45.456Z",
  "duration": 150333,
  "summary": { "total": 6, "passed": 6, "failed": 0, "skipped": 0, "passRate": 100 },
  "tests": [ /* per-test results */ ],
  "error": null,
  "tags": ["smoke"],
  "dryRun": false,

  // NEW: Full suite config for replay
  "suite": {
    "id": "homebay-smoke",
    "name": "HomeBay Smoke Tests",
    "version": "1.0.0",
    "description": "Core auth and navigation tests",
    "timeout": 300000,
    "tags": ["smoke", "critical"]
  },
  "originalTests": [
    { "type": "auth", "role": "buyer", "tags": ["auth"] },
    { "type": "auth", "role": "seller", "tags": ["auth"] },
    { "type": "visual", "role": "buyer", "tags": ["visual"], "config": {} }
  ]
}
```

### Replay Example

```javascript
const { SuiteRunner } = require('./src/agent/suiteRunner');

// Replay a historical run
const results = await SuiteRunner.replayRun(
  'homebay-smoke',           // suiteId
  '2026-03-04T17-30-15-123Z' // historical runId
);

// New run created with:
// - Same test configuration (auth buyer, auth seller, visual buyer)
// - Same tags filter ("smoke")
// - Same dryRun setting (false)
// - NEW runId (e.g., "2026-03-04T17-35-22-456Z")
// - NEW results in reports/suites/homebay-smoke/{newRunId}/
```

## Testing Notes

### Verification Tests (All Passed)

1. **Module exports:** `typeof SuiteRunner.replayRun === 'function'` ✓
2. **Config preservation:** summary.json includes `suite` and `originalTests` fields ✓
3. **Signature validation:** `static async replayRun(suiteId, runId)` ✓
4. **Config validation:** Throws error for missing config ✓
5. **Error handling:** Descriptive error for nonexistent historical run ✓
6. **Syntax:** `node -c src/agent/suiteRunner.js` passes ✓

### Error Scenarios

**Missing historical run:**
```javascript
SuiteRunner.replayRun('nonexistent', 'fake-run')
// Error: Historical run not found: nonexistent/fake-run
```

**Pre-Phase-12 historical run:**
```javascript
SuiteRunner.replayRun('old-suite', '2026-02-01T12-00-00-000Z')
// Error: Historical run 2026-02-01T12-00-00-000Z is missing suite config (was it saved before Phase 12?)
```

## Integration Points

### Upstream Dependencies (Input)
- `config/suites/suite.schema.json` - schema validation (unchanged)
- Phase 9 SuiteRunner infrastructure - execution logic (unchanged)

### Downstream Consumers (Output)
- **Phase 12 Plan 02** - Will add API route `POST /api/suites/:suiteId/runs/:runId/replay`
- Enhanced summary.json format - backward compatible (adds fields, doesn't remove)
- history.jsonl - unchanged (only records summary metadata, not full config)

### Files Modified
- `src/agent/suiteRunner.js` (+50 lines)
  - _saveResults() method (lines 260-293): added summaryWithConfig
  - replayRun() static method (lines 44-92): new method

## Deviations from Plan

None - plan executed exactly as written. No auto-fixes or blocking issues encountered.

## Success Criteria Validation

- [x] summary.json files include full suite manifest (`suite` + `originalTests` fields)
- [x] SuiteRunner.replayRun() static method loads historical config from summary.json
- [x] Replay creates new runId and re-executes tests with original configuration
- [x] Replay preserves original tags and dryRun settings from historical run
- [x] Pre-Phase-12 historical runs without config throw descriptive error

## Next Steps

Phase 12 Plan 02 will add the API route:
- `POST /api/suites/:suiteId/runs/:runId/replay`
- Route handler calls `SuiteRunner.replayRun(suiteId, runId)`
- Returns new run results with new runId

## Self-Check: PASSED

**Created files:** None (modifications only)

**Modified files:**
- src/agent/suiteRunner.js: EXISTS ✓

**Commits:**
- d7dc241: feat(12-01): preserve full suite config in summary.json for replay ✓
- 7009829: feat(12-01): add static replayRun() method for historical suite replay ✓

All claims verified.
