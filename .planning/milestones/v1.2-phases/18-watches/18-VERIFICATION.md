---
phase: 18-watches
verified: 2026-03-10T18:00:00Z
status: passed
score: 11/11 must-haves verified
re_verification: false
---

# Phase 18: Watches Verification Report

**Phase Goal:** Scheduled monitoring via watches — create, manage, and trigger recurring operations with cron-based scheduling and change detection
**Verified:** 2026-03-10
**Status:** PASSED
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | WatchManager stores watch definitions (site, account, url, selector, schedule, webhookUrl) | VERIFIED | `src/agent/watchManager.js` lines 40-51: full data model with all fields |
| 2 | WatchManager schedules runs via cron and fires automatically | VERIFIED | `_scheduleWatch()` calls `cron.schedule()` with UTC timezone; `node-cron ^4.2.1` in package.json |
| 3 | Each run logs in with Puppeteer, navigates, captures text and PNG screenshot | VERIFIED | `_runWatch()` lines 282-351: full login flow, content extract, `page.screenshot()` |
| 4 | WatchManager compares current snapshot to previous (content hash + visual diff) | VERIFIED | Lines 365-399: SHA-256 hash comparison + pixelmatch visual diff at >1% threshold |
| 5 | When change detected, WatchManager calls deliverWebhook with change payload | VERIFIED | Lines 404-424: `deliverWebhook()` called with full payload when `changed && watch.webhookUrl` |
| 6 | Run results appended to per-watch history and persisted atomically to disk | VERIFIED | `_appendRecord()` with 100-run cap; `_save()` uses tmp+rename atomic pattern |
| 7 | POST /api/watches creates watch and returns object with id (201) | VERIFIED | `src/routes/watches.js` lines 15-34: validation, addWatch, returns 201 with watch |
| 8 | GET/PUT/DELETE /api/watches and GET /api/watches/:id fully implemented | VERIFIED | All 5 CRUD endpoints at lines 37-99 with 404 on miss |
| 9 | GET /api/watches/:id/history and POST /api/watches/:id/run functional | VERIFIED | Lines 102-136: history with limit param, fire-and-forget run returning 202 |
| 10 | 4 MCP tools exposed (khai_watch_create, khai_watch_list, khai_watch_delete, khai_watch_history) | VERIFIED | `khai_mcp/server.py` lines 327-408: all 4 tools with correct API calls |
| 11 | README.md and CLAUDE.md document the 4 new MCP tools | VERIFIED | README.md lines 81-84; CLAUDE.md lines 60-63; both have all 4 tool rows |

**Score:** 11/11 truths verified

---

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/agent/watchManager.js` | WatchManager class with schedule, run, diff, webhook, persistence | VERIFIED | 511 lines, full implementation, all required methods present |
| `package.json` | node-cron dependency | VERIFIED | `"node-cron": "^4.2.1"` confirmed |
| `src/routes/watches.js` | Express router for watch CRUD and history | VERIFIED | 137 lines, 7 endpoints, manager singleton exported |
| `src/server.js` | Route registration and WatchManager startup | VERIFIED | watchRoutes registered at `/api/watches`; `startAll()` in listen callback; `stopAll()` in shutdown |
| `khai_mcp/server.py` | 4 new MCP tool functions | VERIFIED | All 4 tool functions present, Python syntax OK |
| `README.md` | Watch tools in MCP table + REST API section | VERIFIED | 4 tool rows + Watches REST section with all 7 endpoints and curl examples |
| `CLAUDE.md` | Watch tools in MCP table + When to Suggest entry | VERIFIED | 4 tool rows + "Monitoring authenticated pages for content or visual changes on a schedule" |

---

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `src/agent/watchManager.js` | `src/utils/browser.js` | `require('../utils/browser')` + `createBrowser()` | WIRED | Line 11: require; line 282: `await createBrowser()` |
| `src/agent/watchManager.js` | `src/utils/webhook.js` | `require('../utils/webhook')` + `deliverWebhook()` | WIRED | Line 13: require; line 420: `await deliverWebhook(...)` |
| `src/agent/watchManager.js` | `node-cron` | `require('node-cron')` + `cron.schedule()` | WIRED | Line 6: require; lines 35/75: `cron.validate()`; line 199: `cron.schedule()` |
| `src/routes/watches.js` | `src/agent/watchManager.js` | `require('../agent/watchManager')` + singleton | WIRED | Line 5: require; line 10: `new WatchManager()`; all endpoints use `manager` |
| `src/server.js` | `src/routes/watches.js` | `app.use('/api/watches', watchRoutes)` | WIRED | Lines 12-13: require; line 66: `app.use()` |
| `khai_mcp/server.py` | `src/routes/watches.js` | `client.post/get/delete('/api/watches...')` | WIRED | Lines 363, 376, 391, 408: all 4 tools call correct endpoints |
| `khai_mcp/client.py` | HTTP DELETE/PUT | `delete()` and `put()` methods | WIRED | Lines 29 and 37: both methods present and used by watch tools |

---

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| WATCH-01 | 18-01 | User can define a watch: site + account + URL + CSS selector + schedule (cron expression) | SATISFIED | `addWatch()` validates all required fields and cron expression |
| WATCH-02 | 18-01 | Watches run on schedule, logging into site and capturing page content/screenshots | SATISFIED | `_scheduleWatch()` + `_runWatch()`: full Puppeteer login + content capture |
| WATCH-03 | 18-01 | Change detection compares current snapshot to previous — content diff and/or visual diff | SATISFIED | SHA-256 hash comparison + pixelmatch at >1% threshold |
| WATCH-04 | 18-01 | Watch fires webhook notification when change detected | SATISFIED | `deliverWebhook()` called with full change payload when `changed === true` |
| WATCH-05 | 18-02 | User can list, create, update, and delete watches via REST API | SATISFIED | All 7 REST endpoints implemented in `src/routes/watches.js` |
| WATCH-06 | 18-01 | Watch history stores snapshots and change events for review | SATISFIED | `_appendRecord()` keeps up to 100 records; `getHistory()` with limit parameter |
| WATCH-07 | 18-03 | MCP tools expose watch management (list, create, delete, get results) | SATISFIED | `khai_watch_create`, `khai_watch_list`, `khai_watch_delete`, `khai_watch_history` in server.py |

All 7 WATCH requirements satisfied. No orphaned requirements found for Phase 18.

---

### Anti-Patterns Found

No anti-patterns detected. Scanned `src/agent/watchManager.js`, `src/routes/watches.js`, and `khai_mcp/server.py` for TODO/FIXME/placeholder comments and stub patterns. None found.

Notable code quality items (informational):
- pixelmatch CJS/ESM compatibility handled correctly with `_pixelmatch.default || _pixelmatch` pattern
- Atomic file writes (tmp + rename) prevent corruption on concurrent saves
- History capped at 100 runs per watch to bound disk usage

---

### Human Verification Required

#### 1. Authenticated Crawl Run End-to-End

**Test:** Configure a real site credential, create a watch via `POST /api/watches`, wait for a scheduled run or trigger via `POST /api/watches/:id/run`, check history via `GET /api/watches/:id/history`
**Expected:** Run record with status `completed` or `changed`, contentHash set, screenshotPath pointing to a real PNG
**Why human:** Requires live Puppeteer browser session against a real credentialed site

#### 2. Change Detection Signal

**Test:** Run a watch twice on a page that changes between runs; verify `diff.contentChanged: true` and webhook fires
**Expected:** Status `changed`, diff populated, webhook delivery record in run history
**Why human:** Requires controlled page modification between runs

#### 3. Visual Diff Accuracy

**Test:** Run watch on a page with minor rendering differences (animations, timestamps)
**Expected:** `pixelDiffPercent` below 0.01 threshold — no false-positive change detection
**Why human:** Requires browser rendering + pixelmatch threshold validation against real pages

---

### Gaps Summary

No gaps. All must-haves verified at all three levels (exists, substantive, wired). All 7 requirements satisfied. Phase goal achieved.

---

_Verified: 2026-03-10_
_Verifier: Claude (gsd-verifier)_
