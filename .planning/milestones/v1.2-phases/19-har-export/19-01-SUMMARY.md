---
phase: 19-har-export
plan: "01"
subsystem: har-recording
tags: [har, cdp, puppeteer, network-trace, action-sessions]
dependency_graph:
  requires: []
  provides: [har-recorder-utility, har-action-integration, har-rest-endpoint]
  affects: [src/routes/actions.js, khai-mcp/server.py]
tech_stack:
  added: []
  patterns: [cdp-session, har-1.2, streaming-file-response]
key_files:
  created:
    - src/utils/har-recorder.js
  modified:
    - src/routes/actions.js
decisions:
  - "HAR recorder uses CDP Network domain via page.target().createCDPSession() — standard Puppeteer pattern, no extra deps"
  - "Response bodies capped at 1MB to prevent memory exhaustion on large binary responses"
  - "Partial HAR saved on all terminal states (completed, error, login-failed) — partial traces are valuable for debugging"
  - "saveHar() helper centralizes stop+disk-write logic to avoid duplication across 3 terminal state branches"
  - "harFile stored as absolute path in session object; /har endpoint streams from disk, never buffers full file in memory"
metrics:
  duration: "137 seconds"
  completed_date: "2026-03-10"
  tasks_completed: 2
  files_changed: 2
---

# Phase 19 Plan 01: HAR Export Summary

**One-liner:** CDP-based HAR 1.2 recorder integrated into action sessions with `recordHar` parameter and `/har/:sessionId` streaming endpoint.

## What Was Built

### Task 1: HarRecorder Utility (src/utils/har-recorder.js)

A CDP-based HAR recorder class:
- **`new HarRecorder(page)`** — constructor takes a Puppeteer Page
- **`start()`** — creates CDP session, enables Network domain, attaches 4 event listeners
- **`stop()`** — fetches response bodies in parallel, detaches CDP session, returns HAR 1.2 JSON object

CDP events captured:
- `Network.requestWillBeSent` — records request start time, URL, method, headers, postData
- `Network.responseReceived` — records status, headers, mimeType, protocol
- `Network.loadingFinished` — records encoded data length, marks entry complete
- `Network.loadingFailed` — marks entry with error info (still included in HAR)

Body capture: attempts `Network.getResponseBody` for each completed entry; skips if >1MB; wraps in try/catch for binary/cached responses. Headers converted from CDP object format to HAR `[{name, value}]` array. Query strings parsed via `new URL().searchParams`. Protocol strings normalized (h2 -> HTTP/2, etc.).

### Task 2: Action Route Integration (src/routes/actions.js)

Changes made:
- Added `fs` and `path` imports at top
- Destructured `recordHar = false` from `req.body` in `/execute` handler
- Added `recordHar` and `harFile: null` to session object in `activeSessions`
- Added `saveHar()` helper in background IIFE that stops recorder and writes to `reports/har/{sessionId}.har`
- HAR recording starts after `khai.init()` and before login, when `session.recordHar` is true
- `saveHar()` called in all 3 terminal state branches: completed, error, login-failed
- `harFile` field added to GET `/status/:id` and GET `/results/:id` responses
- `harFile` added to all 3 webhook delivery payloads
- `recordHar: true` added to start response when recording is enabled
- New `GET /har/:sessionId` endpoint streams HAR file with `Content-Type: application/json` and `Content-Disposition: attachment` header

## API Changes

### POST /api/actions/execute (extended)
```json
{
  "site": "example.com",
  "account": "admin",
  "actions": [...],
  "recordHar": true
}
```
Response includes `recordHar: true` when enabled.

### GET /api/actions/status/:id (extended)
Response now includes `"harFile": "/abs/path/to/reports/har/action-xxx.har"` (null if not recording or not yet complete).

### GET /api/actions/results/:id (extended)
Response now includes `"harFile": "/abs/path/to/reports/har/action-xxx.har"`.

### GET /api/actions/har/:id (new)
Streams the HAR JSON file for download. Returns 404 with error message if session not found or `recordHar` was not enabled.

## Deviations from Plan

### Auto-fixed Issues

None — plan executed exactly as written.

**One enhancement applied beyond the spec:** Added an `error` event handler to the `fs.createReadStream` in the `/har` endpoint to prevent unhandled stream errors from crashing the server (standard Node.js defensive pattern).

## Self-Check: PASSED

- FOUND: src/utils/har-recorder.js
- FOUND: src/routes/actions.js
- FOUND commit 5b6d9ea (Task 1: HarRecorder utility)
- FOUND commit 45aa580 (Task 2: action route integration)
