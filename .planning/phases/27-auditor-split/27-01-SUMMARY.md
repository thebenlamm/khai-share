---
phase: 27-auditor-split
plan: "01"
subsystem: audit-checks
tags: [auditor, refactor, extraction, modules, testability]
dependency_graph:
  requires: []
  provides: [src/agent/audit-checks/*, AuditContext, checkModules]
  affects: [src/agent/auditor.js]
tech_stack:
  added: []
  patterns: [module-per-category, shared-context-object, ctx-parameter-injection]
key_files:
  created:
    - src/agent/audit-checks/context.js
    - src/agent/audit-checks/index.js
    - src/agent/audit-checks/publicPages.js
    - src/agent/audit-checks/redirects.js
    - src/agent/audit-checks/securityHeaders.js
    - src/agent/audit-checks/cookieSecurity.js
    - src/agent/audit-checks/cors.js
    - src/agent/audit-checks/authBypass.js
    - src/agent/audit-checks/sensitivePaths.js
    - src/agent/audit-checks/apiEndpoints.js
    - src/agent/audit-checks/rateLimiting.js
    - src/agent/audit-checks/ssl.js
    - src/agent/audit-checks/seo.js
    - src/agent/audit-checks/performance.js
    - src/agent/audit-checks/authenticated.js
    - src/agent/audit-checks/authorization.js
    - test/audit-checks.test.js
  modified: []
decisions:
  - "AuditContext carries all shared HTTP helpers and result state; check modules receive it as ctx parameter — zero coupling to SiteAuditor"
  - "ssl.js imports https directly (not via ctx) since it needs tls socket access; all other modules operate solely through ctx methods"
metrics:
  duration_seconds: 453
  completed_date: "2026-04-07"
  tasks_completed: 2
  files_created: 17
  files_modified: 0
---

# Phase 27 Plan 01: Audit Check Module Extraction Summary

**One-liner:** Extracted all 14 audit category methods from SiteAuditor into independent modules under `src/agent/audit-checks/`, each accepting an `AuditContext` ctx parameter and proven independently testable via 13-test suite.

## What Was Built

The 1,239-line monolithic `auditor.js` audit methods have been extracted into a composable module system:

- **`context.js`** — `AuditContext` class with `_request`, `_followRedirects`, `_khaiRequest`, `_isKhaiAvailable`, `_addResult`, `_shouldRun` helpers copied verbatim from SiteAuditor. Constructor accepts `{ baseUrl, profile, useKhai, khaiPort, siteName, categories }` and initializes `results` with `categories: {}` and zero-summary.

- **14 check modules** — each exports `async function run(ctx)` with body extracted from the corresponding `testXxx()` method in auditor.js. The only transformation: `this.xxx` → `ctx.xxx`.

- **`index.js`** — registry mapping all 14 category names to their modules via `{ checkModules }` export.

- **`test/audit-checks.test.js`** — 13 tests across 4 describe blocks proving AUDIT-03 independence:
  - AuditContext constructor, `_addResult` (pass/fail tracking), `_shouldRun` (null = all, filtered = subset)
  - All 14 modules present in registry and individually requireable
  - `publicPages.run()` integration with mocked `_request` (pass on 200, fail on 404)
  - `securityHeaders.run()` integration with mocked headers (failures on empty, passes on full set)

## Commits

| Task | Commit | Description |
|------|--------|-------------|
| Task 1 | 642b96d | feat(27-01): extract all 14 audit check modules from SiteAuditor |
| Task 2 | 97ff503 | test(27-01): add audit-checks.test.js proving independent testability |

## Verification

```
node -e "require('./src/agent/audit-checks')"  # PASS: 14 modules loaded
node --test test/audit-checks.test.js          # PASS: 13/13 tests
grep -r "require.*auditor" src/agent/audit-checks/  # PASS: empty
grep -r "SiteAuditor" src/agent/audit-checks/       # PASS: empty
```

## Deviations from Plan

None — plan executed exactly as written. The only minor note: `ssl.js` requires `https` directly (in addition to using `ctx` methods) because it needs raw TLS socket access via `https.request()` for certificate inspection. This is consistent with the original `auditor.js` implementation; the plan's instruction to extract verbatim includes this direct `https` usage.

## Known Stubs

None. All modules are complete functional extractions, not placeholders.

## Self-Check: PASSED
