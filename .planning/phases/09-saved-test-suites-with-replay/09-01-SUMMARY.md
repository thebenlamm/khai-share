---
phase: 09-saved-test-suites-with-replay
plan: 01
subsystem: test-orchestration
tags: [suite-runner, json-schema, validation, test-orchestration]
completed: 2026-03-04T15:03:43Z
duration_minutes: 2.5
requirements_fulfilled: [SUITE-01, SUITE-02, SUITE-03, SUITE-04, SUITE-05, SUITE-06]

dependencies:
  requires:
    - homebay/auth.js (loginHomeBay, registerHomeBay)
    - homebay/performance.js (auditHomeBayRole)
    - homebay/visual.js (captureHomeBayRole, compareAgainstBaseline)
    - homebay/animationTest.js (testHomeBayAnimations)
  provides:
    - agent/suiteRunner.js (SuiteRunner class)
    - config/suites/suite.schema.json (JSON Schema validator)
    - config/suites/*.json (suite manifest storage)
  affects:
    - None (new standalone module)

tech_stack:
  added:
    - ajv (JSON schema validation)
    - ajv-formats (date-time format support)
  patterns:
    - JSON Schema validation with ajv
    - Test orchestration with type-based dispatch
    - Tag-based test filtering
    - Timeout enforcement via Promise.race
    - JSONL append-only history logging

key_files:
  created:
    - config/suites/suite.schema.json (JSON Schema for suite validation)
    - src/agent/suiteRunner.js (SuiteRunner orchestration class)
    - config/suites/homebay-smoke.json (Example smoke test suite)
  modified:
    - package.json (ajv, ajv-formats dependencies)
    - package-lock.json (dependency tree)

decisions:
  - Use ajv (not JSON.parse alone) for schema validation to enforce required fields, enums, and constraints
  - Suite timeout enforced via Promise.race to prevent indefinite hangs
  - Tag filtering at test level (suite.tags informational only; test.tags used for filtering)
  - Fail-fast on critical test failures when test.critical === true
  - History stored in JSONL format (newline-delimited JSON) for append-only durability
  - Results directory structure: reports/suites/{suiteId}/{runId}/summary.json

metrics:
  tasks_completed: 3
  files_created: 3
  files_modified: 2
  tests_added: 0
  lines_of_code: ~350
---

# Phase 09 Plan 01: Suite Orchestration with Schema Validation

**One-liner:** JSON Schema validation and SuiteRunner orchestration for multi-test suites with tag filtering, timeout enforcement, and JSONL history logging

## Overview

Implemented the foundation for saved test suites: a JSON Schema validator for suite manifests and a SuiteRunner class that orchestrates multiple test types (auth, performance, visual, animation) with tag-based filtering, suite-level timeout enforcement, and aggregated result reporting.

## Core Components

### 1. JSON Schema (config/suites/suite.schema.json)

Draft-07 schema enforcing:
- **Required fields**: suite.id, suite.name, suite.version, tests array
- **Test types**: auth, performance, visual, dry-run, animation (enum)
- **Roles**: admin, agent, seller, buyer (enum)
- **Timeout bounds**: 1s - 1 hour (1000 - 3600000ms)
- **ID format**: Kebab-case suite IDs via regex pattern
- **Versioning**: Semantic version pattern (X.Y.Z)
- **Date-time**: ISO 8601 timestamps via ajv-formats

### 2. SuiteRunner Class (src/agent/suiteRunner.js)

**Constructor:**
- Validates suite manifest against JSON Schema using ajv
- Throws descriptive error if validation fails (e.g., "suite/id is required")
- Accepts options: runId, tags (array), dryRun (boolean)

**execute() method:**
- Wraps _runTests() in Promise.race with suite.suite.timeout
- Returns aggregated results object or throws timeout error

**_runTests() method:**
- Iterates suite.tests array
- Applies tag filtering: skips tests where !this.tags.some(t => test.tags?.includes(t))
- Executes each test via _executeTest()
- Fail-fast on critical test failures (test.critical === true)

**_executeTest() method:**
- Dispatches based on test.type using switch statement:
  - `auth`: loginHomeBay(role) or registerHomeBay(email, password, dob)
  - `performance`: auditHomeBayRole(role)
  - `visual`: captureHomeBayRole(role) or compareAgainstBaseline(role)
  - `animation`: testHomeBayAnimations(role, config)
  - `dry-run`: Throws "not yet implemented" (Phase 2)
- Catches errors and returns structured result with status, duration, error

**_generateResults() method:**
- Aggregates per-test results into suite summary
- Calculates totals: total, passed, failed, skipped, passRate
- Determines overall status: error (timeout/exception), failed (any test failed), passed

**_saveResults() method:**
- Writes to `reports/suites/{suiteId}/{runId}/summary.json`
- Appends to `reports/suites/history.jsonl` (one JSON object per line)
- History entry: { runId, suiteId, status, duration, passRate, timestamp, tags }

### 3. Example Suite (config/suites/homebay-smoke.json)

Fast critical-path smoke test:
1. **Buyer login** (critical - fails suite if login breaks)
2. **Performance audit** on buyer critical pages
3. **Visual capture** of buyer pages (no comparison - just baseline refresh)

Total runtime target: <2 minutes

## Implementation Details

### Schema Validation Flow

1. SuiteRunner constructor loads suite.schema.json
2. Creates Ajv instance with ajv-formats (for date-time support)
3. Compiles schema into validation function
4. Validates suite manifest
5. Throws if invalid: "Suite validation failed: suite/id is required"

**Why ajv not JSON.parse()**: JSON.parse() only checks syntax. ajv validates structure, required fields, enums, patterns, and constraints per SUITE-01 requirement.

### Tag Filtering Logic

```javascript
if (this.tags.length > 0) {
  const testTags = test.tags || [];
  const matchesTag = this.tags.some(t => testTags.includes(t));

  if (!matchesTag) {
    this.results.push({ ...test, status: 'skipped', reason: 'Tag filter mismatch' });
    continue;
  }
}
```

**Example:**
- User requests `tags: ['smoke']`
- Suite has 5 tests: 3 with `tags: ['smoke']`, 2 with `tags: ['full']`
- SuiteRunner runs 3 tests, skips 2

### Timeout Enforcement

```javascript
await Promise.race([
  this._runTests(),
  new Promise((_, reject) =>
    setTimeout(() => reject(new Error(`Suite timeout after ${timeout}ms`)), timeout)
  )
]);
```

If suite exceeds timeout (default 300000ms = 5 minutes), Promise.race rejects with timeout error. _generateResults() captures error and marks suite status as 'error'.

### Critical Test Fail-Fast

```javascript
if (test.critical && testResult.status === 'failed') {
  throw new Error(`Critical test failed: ${test.type} (${testResult.error})`);
}
```

If any test marked `critical: true` fails, suite stops immediately. Used for auth tests - no point running performance/visual tests if login is broken.

## Deviations from Plan

None - plan executed exactly as written.

## Testing Status

**Manual verification completed:**
1. Schema compiles with ajv + ajv-formats: PASS
2. SuiteRunner.js syntax validation: PASS
3. Module exports SuiteRunner class: PASS
4. homebay-smoke.json parses correctly: PASS
5. Invalid suite rejected with validation error: PASS

**Not yet tested:**
- End-to-end suite execution (requires API route from Plan 09-02)
- Tag filtering with real tests
- Timeout enforcement with slow tests
- History.jsonl accumulation over multiple runs

## Known Limitations

1. **dry-run test type** not implemented (throws "not yet implemented")
2. **No test result validation** - assumes test modules return correct structure
3. **No parallel test execution** - tests run sequentially
4. **No test retries** - one failure = permanent failure
5. **No suite-level setup/teardown** - each test is independent

## Directory Structure

```
config/suites/
├── suite.schema.json          # JSON Schema validator
└── homebay-smoke.json         # Example smoke test suite

reports/suites/
├── history.jsonl              # Append-only execution log
└── {suiteId}/
    └── {runId}/
        └── summary.json       # Per-run aggregated results
```

## Next Steps

**Plan 09-02: Suite API Routes**
- GET /api/suites - List available suite manifests
- POST /api/suites/run - Execute suite by ID with optional tags filter
- GET /api/suites/:runId/status - Poll execution status
- GET /api/suites/:runId/results - Get aggregated results
- GET /api/suites/history - Query history.jsonl with filtering

## Performance Notes

- **Schema validation**: <1ms (one-time cost in constructor)
- **Tag filtering**: O(n*m) where n=tests, m=tags (negligible for typical suite sizes)
- **Suite timeout**: No overhead (Promise.race is zero-cost until timeout fires)
- **History append**: Synchronous file append (blocking but fast for single-line writes)

## Self-Check: PASSED

Verified all deliverables exist and function correctly:

**Files created:**
- [x] config/suites/suite.schema.json exists and is valid JSON
- [x] src/agent/suiteRunner.js exists and passes syntax check
- [x] config/suites/homebay-smoke.json exists and is valid JSON

**Functionality:**
- [x] SuiteRunner exports as function
- [x] Schema compiles with ajv + ajv-formats
- [x] Invalid suite rejected with descriptive error
- [x] Suite manifest parses correctly

**Commits:**
- [x] 76f73e5: chore(09-01): add JSON Schema for suite validation
- [x] 2fcd8c6: feat(09-01): implement SuiteRunner class with test orchestration
- [x] 3d68b35: feat(09-01): add homebay-smoke example suite manifest

All success criteria met.
