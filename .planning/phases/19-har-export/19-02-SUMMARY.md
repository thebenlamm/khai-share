---
phase: 19-har-export
plan: "02"
subsystem: mcp-tools
tags: [har, mcp, documentation, khai_action_har, record_har]
dependency_graph:
  requires: [har-recorder-utility, har-action-integration, har-rest-endpoint]
  provides: [khai_action_har-mcp-tool, record_har-mcp-param]
  affects: [khai_mcp/server.py, CLAUDE.md, README.md]
tech_stack:
  added: []
  patterns: [mcp-tool-wrapping-rest-endpoint, raw-json-response-handling]
key_files:
  created: []
  modified:
    - khai_mcp/server.py
    - CLAUDE.md
    - README.md
decisions:
  - "HAR endpoint returns raw JSON (not {success,data} envelope), so khai_action_har checks for success:false instead of calling _unwrap"
  - "uv.lock committed alongside server.py since uv created it during verification — enables reproducible builds"
metrics:
  duration: "~8 minutes"
  completed_date: "2026-03-10"
  tasks_completed: 2
  files_changed: 3
---

# Phase 19 Plan 02: HAR Export MCP Tools Summary

**One-liner:** Added `khai_action_har` MCP tool and `record_har` parameter to `khai_execute_actions`, with full doc sync across CLAUDE.md, README.md, and server.py instructions.

## What Was Built

### Task 1: MCP Server Updates (khai_mcp/server.py)

**khai_execute_actions extended:**
- Added `record_har: bool = False` parameter after `webhook_url`
- Updated docstring with param description and note to use `khai_action_har` after completion
- Added `if record_har: payload["recordHar"] = True` to payload construction
- Returns section updated to mention HAR retrieval path

**khai_action_har tool created (new):**
- Decorated with `@mcp.tool(annotations={"readOnlyHint": True})`
- Calls `GET /api/actions/har/{session_id}`
- Handles raw HAR JSON response (not wrapped in `{success, data}` envelope)
- Falls back to checking `success: False` for error detection
- Returns descriptive error if session not found, incomplete, or HAR not enabled

**MCP instructions string updated:**
- Added `khai_action_har` to tool list
- Added "HAR Recording" section explaining workflow: use `record_har=True`, then `khai_action_har` after completion; mentions Chrome DevTools import and HAR viewers

### Task 2: Documentation Updates

**CLAUDE.md:**
- Added `khai_action_har` row to MCP Tools table
- Added `recordHar: true` execute example and `GET /api/actions/har/{sessionId}` curl to Actions REST section
- Added "Network traffic analysis and HAR recording during browser sessions" to "When to Suggest Khai" list

**README.md:**
- Added `khai_action_har` row to MCP Tools table
- Added HAR recording to Features section
- Added `GET /api/actions/har/:id` to REST API Reference Actions section

## API Surface Added

### MCP Tool: khai_action_har
```python
khai_action_har(session_id: str) -> dict
# Returns HAR 1.2 JSON object or {"error": "..."} dict
```

### MCP Tool: khai_execute_actions (extended)
```python
khai_execute_actions(..., record_har: bool = False) -> dict
# When record_har=True, sends recordHar=True to POST /api/actions/execute
```

## Deviations from Plan

### Auto-fixed Issues

None — plan executed exactly as written.

One note on implementation: the plan offered two alternative implementations for `khai_action_har` (one using `_unwrap`, one using raw response check). The second approach (checking `success: False` without calling `_unwrap`) was used as specified in the "Note" section, since the `/har` endpoint streams raw HAR JSON rather than the standard `{success, data}` envelope.

## Self-Check: PASSED

- FOUND: khai_mcp/server.py (modified — khai_action_har and record_har param)
- FOUND: CLAUDE.md (modified — khai_action_har in 3 places)
- FOUND: README.md (modified — khai_action_har in 2 places)
- FOUND commit 0b648c0 (Task 1: MCP server updates)
- FOUND commit d366857 (Task 2: Documentation updates)
- `uv run python -c "from khai_mcp.server import khai_action_har; print('OK')"` → OK
- `grep -c khai_action_har CLAUDE.md README.md khai_mcp/server.py` → 1, 2, 5 (all >0)
