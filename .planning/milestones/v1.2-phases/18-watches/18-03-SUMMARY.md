---
phase: 18-watches
plan: "03"
subsystem: mcp
tags: [mcp, watches, tools, documentation]
dependency_graph:
  requires: [18-02]
  provides: [watch-mcp-tools]
  affects: [khai_mcp/server.py, khai_mcp/client.py, README.md, CLAUDE.md]
tech_stack:
  added: []
  patterns: [fastmcp-tool-decorator, unwrap-pattern, cron-schedule-param]
key_files:
  created: []
  modified:
    - khai_mcp/server.py
    - khai_mcp/client.py
    - README.md
    - CLAUDE.md
decisions:
  - "Added put() and delete() to client.py since khai_watch_delete requires DELETE and watch update requires PUT"
  - "khai_watch_delete uses destructiveHint annotation consistent with other delete-style tools"
  - "khai_watch_list uses readOnlyHint consistent with other list/read tools"
metrics:
  duration_seconds: 114
  completed_date: "2026-03-10"
  tasks_completed: 2
  files_modified: 4
---

# Phase 18 Plan 03: Watch MCP Tools and Documentation Summary

4 new MCP tools for watch management added to khai_mcp/server.py with client.delete()/put() methods, full instructions string update, and docs sync across README.md and CLAUDE.md.

## Tasks Completed

| # | Task | Commit | Files |
|---|------|--------|-------|
| 1 | Add 4 MCP tool functions and update instructions | 07b4627 | khai_mcp/server.py, khai_mcp/client.py |
| 2 | Update README.md and CLAUDE.md documentation | d0ae4df | README.md, CLAUDE.md |

## What Was Built

### khai_mcp/server.py

Four new MCP tool functions added after `khai_check_links`:

- `khai_watch_create(site, account, url, schedule, selector=None, webhook_url=None)` — POST /api/watches, `destructiveHint`
- `khai_watch_list()` — GET /api/watches, `readOnlyHint`
- `khai_watch_delete(watch_id)` — DELETE /api/watches/:id, `destructiveHint`
- `khai_watch_history(watch_id, limit=20)` — GET /api/watches/:id/history, `readOnlyHint`

MCP instructions string updated with 4 tool entries in Available tools list and a new Watches paragraph explaining the polling-free change-detection model.

### khai_mcp/client.py

Added `put()` and `delete()` HTTP methods following the same pattern as `get()` and `post()`. These were missing and required by khai_watch_delete (and future watch update operations).

### Documentation

- README.md: 4 new rows in MCP tools table; new Watches REST API section with all 7 endpoints and curl examples
- CLAUDE.md: 4 new rows in MCP tools table; "Monitoring authenticated pages for content or visual changes on a schedule" added to When to Suggest Khai

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing critical functionality] Added put() method to client.py**
- **Found during:** Task 1, review of client.py
- **Issue:** client.py had get(), post(), and health() but no put() or delete(). Plan only mentioned delete() but put() is also required for /api/watches/:id (PUT) and consistent API completeness.
- **Fix:** Added both put() and delete() following the exact same httpx pattern as get()/post()
- **Files modified:** khai_mcp/client.py
- **Commit:** 07b4627

## Self-Check: PASSED

- khai_mcp/server.py — FOUND (4 watch tool functions present, syntax OK)
- khai_mcp/client.py — FOUND (put() and delete() added)
- README.md — khai_watch_create present in MCP tools table and Watches REST API section
- CLAUDE.md — khai_watch_create present in MCP tools table
- Commit 07b4627 — FOUND (feat: server.py + client.py)
- Commit d0ae4df — FOUND (docs: README.md + CLAUDE.md)
