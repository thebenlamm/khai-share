---
phase: 24-quick-wins
plan: "01"
subsystem: security-hardening
tags: [security, path-injection, mcp, httpx, error-normalization]
dependency_graph:
  requires: []
  provides: [safePath-validated-disk-writes, httpx-params-forwarding]
  affects: [src/routes/actions.js, khai_mcp/server.py, khai_mcp/client.py]
tech_stack:
  added: []
  patterns: [safePath-validation, httpx-params-keyword]
key_files:
  created: []
  modified:
    - src/routes/actions.js
    - khai_mcp/client.py
    - khai_mcp/server.py
decisions:
  - "Use safePath(PROJECT_ROOT, ...) for all disk write paths in actions.js — prevents path traversal on sessionId-based filenames"
  - "httpx params= keyword forwarded from client.get() for all query string params — prevents URL encoding bugs on special characters"
  - "QW-03 verified by grep: all route .error fields use err.message or string literals — no code changes needed"
metrics:
  duration_minutes: 2
  completed_date: "2026-04-07"
  tasks_completed: 2
  files_modified: 3
---

# Phase 24 Plan 01: Security Hardening Quick Wins Summary

SafePath validation for HAR/action report disk writes, httpx params= for MCP query strings, and error field consistency verification across all routes.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Add safePath validation to actions.js disk writes | 23e040e | src/routes/actions.js |
| 2 | Switch MCP server.py query parameters to httpx params= and verify error fields | 69e5af9 | khai_mcp/client.py, khai_mcp/server.py |

## What Was Built

**Task 1 — safePath in actions.js:**
- Added `const { safePath, PROJECT_ROOT } = require('../utils/safePath')` import
- HAR directory write: `path.join(__dirname, '../../reports/har')` → `safePath(PROJECT_ROOT, 'reports', 'har')`
- HAR file path: `path.join(harDir, sessionId + '.har')` → `safePath(harDir, sessionId + '.har')`
- Action report directory: `path.join(__dirname, '../../reports/actions')` → `safePath(PROJECT_ROOT, 'reports', 'actions')`
- Action report file: `path.join(reportsDir, sessionId.json)` → `safePath(reportsDir, sessionId.json)`

**Task 2 — httpx params= in server.py and client.py:**
- `client.py get()`: Added `params: dict | None = None` parameter, forwarded as `c.get(path, params=params)`
- `server.py khai_watch_history`: `f"/api/watches/{watch_id}/history?limit={limit}"` → `params={"limit": limit}`
- `server.py khai_baseline_list`: `f"/api/baselines?site={site}"` → `params={"site": site} if site else None`

**Task 2 — QW-03 error field verification:**
- Grepped all `src/routes/*.js` for `.error =` assignments
- Confirmed: `session.error = error.message`, `test.error = errorDetail` (string), `test.error = error.message || '...'`
- No raw error objects or stacks assigned to error fields. No code changes needed.

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None.

## Self-Check: PASSED

All files found. Both task commits verified in git log.
