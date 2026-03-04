---
phase: 06-visual-diff-against-reference-pages
plan: 02
subsystem: homebay-visual-testing
tags: [api-routes, visual-regression, baseline-management, homebay]
completed: 2026-03-04T13:41:50Z
duration_minutes: 1
one_liner: "Wire visual diff API routes with baseline management for HomeBay visual regression testing"
dependency_graph:
  requires: [06-01-visual-infrastructure]
  provides: [visual-diff-api-endpoints, baseline-management-endpoints]
  affects: [homebay-api-surface]
tech_stack:
  added: []
  patterns: [express-async-routes, ok-fail-envelope, fs-operations]
key_files:
  created: []
  modified:
    - path: src/routes/homebay.js
      changes: Added 4 visual diff API endpoints with baseline management
      additions: 135
decisions:
  - summary: "Use inline fs operations for baseline management (simple file copy) vs separate module"
    rationale: "Baseline operations are straightforward file copies - no complex logic requiring separate module. Keeps API routes self-contained."
  - summary: "Return 404 for missing baseline on compare endpoint vs 200 with warning"
    rationale: "404 is semantically correct - the baseline resource doesn't exist. Client can distinguish from empty baseline."
metrics:
  tasks_completed: 2
  files_modified: 1
  loc_added: 135
  test_files_added: 0
requirements: [VIS-05]
---

# Phase 06 Plan 02: Wire Visual Diff API Routes Summary

**One-liner:** Wire visual diff API routes with baseline management for HomeBay visual regression testing

## What Was Built

Added 4 new API endpoints to src/routes/homebay.js for HomeBay visual regression testing:

1. **POST /api/homebay/visual/:role** - Capture screenshots of critical pages after authentication
2. **POST /api/homebay/visual/:role/compare** - Compare current screenshots against baseline (returns diff report)
3. **POST /api/homebay/visual/:role/set-baseline** - Copy current screenshots to baseline directory
4. **GET /api/homebay/visual/:role/baseline** - List existing baseline screenshots

All endpoints follow established HomeBay API patterns:
- ok/fail response envelope (consistency with existing routes)
- Role parameter validation against validRoles array
- Console logging with [HomeBay Visual] prefix
- HTTP status codes: 400 for validation errors, 404 for missing baselines, 500 for exceptions

## Tasks Completed

| # | Task | Commit | Files |
|---|------|--------|-------|
| 1 | Add visual diff API routes to src/routes/homebay.js | b6a1394 | src/routes/homebay.js |
| 2 | Commit changes with conventional commit message | b6a1394 | N/A |

## Deviations from Plan

None - plan executed exactly as written.

## Technical Decisions

**1. Inline fs operations for baseline management**
- **Context:** Baseline set/list operations require fs.copyFileSync and fs.readdirSync
- **Decision:** Implement inline in route handlers rather than separate module
- **Rationale:** Operations are straightforward file copies with no complex logic. Keeping inline reduces indirection and makes routes self-contained. If complexity grows, can extract to visual.js later.

**2. Return 404 for missing baseline on compare**
- **Context:** When user calls POST /visual/:role/compare without baseline
- **Decision:** Return 404 status code with fail() envelope
- **Rationale:** Semantically correct - baseline is a resource that doesn't exist. Allows client to distinguish "no baseline yet" from "baseline exists but all screenshots match" (200 with matched=N).

## Integration Points

**New dependencies:**
- src/homebay/visual.js → captureHomeBayRole, compareAgainstBaseline (imported at line 14)

**API surface expansion:**
- 4 new endpoints under /api/homebay/visual
- All validated against ALLOWED_ROLES (reused from existing routes)
- Consistent error handling via ok/fail envelope

**Directory structure:**
- screenshots/homebay-current/{role}/ - Current screenshots from captureHomeBayRole
- screenshots/homebay-baselines/{role}/ - Baseline screenshots for comparison
- Created on demand via fs.mkdirSync({ recursive: true })

## Verification Results

**Automated checks:**
- ✓ JavaScript syntax validation (node -c src/routes/homebay.js)
- ✓ 3 POST /visual routes confirmed (grep count)
- ✓ 1 GET /visual route confirmed

**Pattern consistency:**
- ✓ Role validation matches existing /perf/:role endpoint
- ✓ ok/fail envelope used for all responses
- ✓ Console logging with [HomeBay Visual] prefix
- ✓ HTTP status codes: 400 validation, 404 missing, 500 error

## Files Modified

**src/routes/homebay.js** (+135 lines)
- Added import for captureHomeBayRole and compareAgainstBaseline
- Added POST /visual/:role endpoint (screenshot capture)
- Added POST /visual/:role/compare endpoint (comparison)
- Added POST /visual/:role/set-baseline endpoint (baseline management)
- Added GET /visual/:role/baseline endpoint (list baselines)
- All routes follow Express async/await error handling pattern

## Commits

- b6a1394 - feat(06-02): wire visual diff API routes and baseline management

## Next Steps

Phase 06 is now complete (2/2 plans done). Visual regression testing infrastructure is fully wired to API routes. Users can:
- Capture screenshots via POST /visual/:role
- Set baselines via POST /visual/:role/set-baseline
- Run comparisons via POST /visual/:role/compare
- Check baseline status via GET /visual/:role/baseline

Ready to proceed to Phase 07 (Dry-run form submission testing) or other roadmap phases as prioritized.

## Self-Check: PASSED

**Created files:** N/A (API routes only)

**Modified files:**
- ✓ FOUND: src/routes/homebay.js (135 additions confirmed)

**Commits:**
```bash
$ git log --oneline --all | grep b6a1394
b6a1394 feat(06-02): wire visual diff API routes and baseline management
```
- ✓ FOUND: b6a1394

All claims verified.
