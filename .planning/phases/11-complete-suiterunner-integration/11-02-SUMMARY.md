---
phase: 11-complete-suiterunner-integration
plan: 02
subsystem: suiterunner
tags: [schema, manifest, accessibility, test-types]
one_liner: Suite schema now supports all 6 test types including accessibility with nullable role for unauthenticated tests

dependency_graph:
  requires: [SUITE-01]
  provides: [SUITE-02]
  affects: [suiterunner-api]

tech_stack:
  added: []
  patterns: [json-schema-validation, nullable-fields]

key_files:
  created:
    - config/suites/homebay-comprehensive.json
  modified:
    - config/suites/suite.schema.json

decisions:
  - id: null-role-support
    summary: Allow null role for unauthenticated tests (dry-run, accessibility without login)
    rationale: Some test types don't require authentication (e.g., dry-run form validation, public accessibility audits)
    alternatives: [require-role-always, separate-schema-per-type]
    chosen: nullable-role
    impact: Schema now accepts role null without validation errors

metrics:
  duration_minutes: 1.3
  tasks_completed: 2
  files_modified: 2
  commits: 3
  completed: 2026-03-04T17:15:04Z
---

# Phase 11 Plan 02: Suite Schema & Comprehensive Manifest Summary

## Objective

Update suite JSON schema to include accessibility test type and create a comprehensive example suite demonstrating all 6 test types.

## What Was Built

### 1. Schema Enum Update (Task 1)
- Added "accessibility" to test.type enum in `config/suites/suite.schema.json`
- Schema now validates all 6 test types: auth, performance, visual, dry-run, animation, accessibility
- Total enum count: 6 test types

### 2. Comprehensive Suite Manifest (Task 2)
- Created `config/suites/homebay-comprehensive.json` with example tests for all 6 types
- Suite configuration:
  - ID: `homebay-comprehensive`
  - Timeout: 600000ms (10 minutes)
  - Environment: staging
  - Tags: comprehensive, all-features
- Test examples:
  1. **Auth test** - Buyer login (critical: true, fail-fast)
  2. **Performance test** - Core Web Vitals (critical-only pages)
  3. **Visual test** - Baseline capture (compare: false)
  4. **Animation test** - Progress capture at 0%, 50%, 100%
  5. **Accessibility test** - WCAG 2.0 A/AA audits (tags: wcag2a, wcag2aa)
  6. **Dry-run test** - Unauthenticated form validation with expectedErrors

### 3. Schema Fix for Nullable Role (Deviation)
- **Issue found**: Schema required role to be a string, but dry-run test uses role: null
- **Fix applied**: Added null to role type and enum
- **Rule applied**: Rule 2 (Auto-add missing critical functionality)
- **Rationale**: Some tests (dry-run, public accessibility audits) don't require authentication
- Updated description: "HomeBay role for auth/performance/visual tests (null for unauthenticated tests)"

## Config Examples by Test Type

### Auth
```json
{
  "type": "auth",
  "role": "buyer",
  "config": { "flow": "login" },
  "critical": true
}
```

### Performance
```json
{
  "type": "performance",
  "role": "buyer",
  "config": { "pages": "critical-only" }
}
```

### Visual
```json
{
  "type": "visual",
  "role": "buyer",
  "config": { "compare": false }
}
```

### Animation
```json
{
  "type": "animation",
  "role": "buyer",
  "config": {
    "captureProgress": true,
    "progressPoints": [0, 50, 100]
  }
}
```

### Accessibility
```json
{
  "type": "accessibility",
  "role": "buyer",
  "config": {
    "tags": ["wcag2a", "wcag2aa"]
  }
}
```

### Dry-run
```json
{
  "type": "dry-run",
  "role": null,
  "config": {
    "formUrl": "/register",
    "formData": {
      "email": "invalid",
      "password": "short"
    },
    "expectedErrors": ["valid email", "at least 8 characters"]
  }
}
```

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical Functionality] Added null role support to schema**
- **Found during:** Task 2 verification (schema validation)
- **Issue:** Schema validation failed with error "role must be string" for dry-run test with role: null
- **Root cause:** Schema required role to be a string enum, but unauthenticated tests (dry-run, public accessibility audits) don't need authentication
- **Fix:** Updated schema to allow `"type": ["string", "null"]` and added `null` to enum
- **Files modified:** `config/suites/suite.schema.json`
- **Commit:** 2a28c29
- **Why Rule 2:** Missing nullable field validation is critical functionality - without it, valid unauthenticated test manifests would fail schema validation

## Verification Results

### Schema Validation
```bash
$ node -e "const Ajv = require('ajv'); const addFormats = require('ajv-formats'); const fs = require('fs'); const schema = JSON.parse(fs.readFileSync('config/suites/suite.schema.json', 'utf8')); const suite = JSON.parse(fs.readFileSync('config/suites/homebay-comprehensive.json', 'utf8')); const ajv = new Ajv(); addFormats(ajv); const validate = ajv.compile(schema); const valid = validate(suite); console.log(valid ? 'PASS: Suite validates against schema' : 'FAIL: ' + JSON.stringify(validate.errors));"

PASS: Suite validates against schema
```

### Test Type Coverage
```bash
$ node -e "const suite = require('./config/suites/homebay-comprehensive.json'); const types = new Set(suite.tests.map(t => t.type)); const required = ['auth', 'performance', 'visual', 'animation', 'accessibility', 'dry-run']; const missing = required.filter(t => !types.has(t)); console.log(missing.length === 0 ? 'PASS: All 6 test types present' : 'FAIL: Missing ' + missing.join(', '));"

PASS: All 6 test types present
```

## Success Criteria

- [x] config/suites/suite.schema.json enum includes "accessibility" (6 total test types)
- [x] config/suites/homebay-comprehensive.json exists and parses as valid JSON
- [x] Comprehensive suite validates against updated schema via ajv
- [x] Suite manifest includes exactly 6 tests, one of each type
- [x] Dry-run test demonstrates role: null for unauthenticated forms
- [x] Accessibility test demonstrates config.tags for WCAG filtering

## Commits

| Order | Hash | Type | Description |
|-------|------|------|-------------|
| 1 | 7331913 | feat | Add accessibility test type to suite schema |
| 2 | d2e4312 | feat | Create comprehensive suite manifest with all 6 test types |
| 3 | 2a28c29 | fix | Allow null role for unauthenticated tests |

## Next Steps

1. Execute Plan 11-01 to implement SuiteRunner API endpoints
2. Test comprehensive suite execution via `POST /api/suites/homebay-comprehensive/run`
3. Verify all 6 test types execute without "not yet implemented" errors

## Self-Check

Verifying created files and commits exist:

```bash
$ [ -f "config/suites/suite.schema.json" ] && echo "FOUND: config/suites/suite.schema.json" || echo "MISSING: config/suites/suite.schema.json"
FOUND: config/suites/suite.schema.json

$ [ -f "config/suites/homebay-comprehensive.json" ] && echo "FOUND: config/suites/homebay-comprehensive.json" || echo "MISSING: config/suites/homebay-comprehensive.json"
FOUND: config/suites/homebay-comprehensive.json

$ git log --oneline --all | grep -q "7331913" && echo "FOUND: 7331913" || echo "MISSING: 7331913"
FOUND: 7331913

$ git log --oneline --all | grep -q "d2e4312" && echo "FOUND: d2e4312" || echo "MISSING: d2e4312"
FOUND: d2e4312

$ git log --oneline --all | grep -q "2a28c29" && echo "FOUND: 2a28c29" || echo "MISSING: 2a28c29"
FOUND: 2a28c29
```

## Self-Check: PASSED

All files created and commits exist as documented.
