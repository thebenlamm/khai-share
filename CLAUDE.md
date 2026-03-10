# Khai (חי) - Browser Automation MCP Server

> **When Claude can't do something that requires credentials, payments, or live site testing - summon Khai.**

## Doc Update Rule

When adding, changing, or removing features, routes, or MCP tools, update ALL of these before considering work complete:
1. **README.md** — features list, REST API reference, file structure
2. **CLAUDE.md** — MCP tools table, REST API examples, "When to Suggest Khai" list
3. **khai_mcp/server.py** — MCP `instructions` string (what Claude Code sees on connect)

## Architecture

Khai has two layers:
1. **Express server** (`src/server.js`) — Puppeteer browser automation on `localhost:3001`
2. **MCP server** (`khai_mcp/server.py`) — Python MCP wrapper exposing Express API as Claude Code tools

## Setup (first time)

```bash
npm install
pip install -e .
cp config/credentials.example.json config/credentials.json
```

Then edit `config/credentials.json` with your site's credentials.

## Running Khai

Start the Express server:
```bash
npm start
```

Start the MCP server (SSE mode):
```bash
khai-mcp --sse
```

Or configure in Claude Code's MCP settings for stdio mode.

Optionally set `KHAI_API_KEY` env var to require API key authentication on all `/api/*` endpoints (checked via `X-Khai-Key` header).

## MCP Tools

These are the tools available when Khai is connected as an MCP server:

| Tool | Description |
|------|-------------|
| `khai_list_sites` | List configured sites and accounts |
| `khai_start_test` | Start an authenticated crawl test (supports webhookUrl) |
| `khai_test_status` | Check crawl test progress |
| `khai_test_results` | Get full crawl test results |
| `khai_execute_actions` | Run browser action sequences (supports webhookUrl) |
| `khai_action_status` | Check action session status |
| `khai_action_results` | Get full action session results |
| `khai_run_audit` | Start a security/configuration audit (supports webhookUrl) |
| `khai_audit_results` | Get audit status and results |
| `khai_check_links` | Check a site for broken links (supports webhookUrl) |
| `khai_watch_create` | Create a scheduled watch to monitor an authenticated page for changes |
| `khai_watch_list` | List all configured watches and their status |
| `khai_watch_delete` | Delete a watch by id |
| `khai_watch_history` | Get recent run history for a watch |

**Action types:** `navigate`, `wait`, `screenshot`, `evaluate`, `create-note`, `send-fax`, `send-sms`, `twilio-a2p`

## Async Polling Pattern

All operations are async:
1. **Start** — returns an ID (`testId`, `auditId`, `sessionId`, `jobId`)
2. **Poll** — check status until `completed` or `error`
3. **Results** — get full data

## Webhooks

Any async start operation accepts an optional `webhookUrl` parameter. When provided, Khai POSTs the full operation results to that URL on completion.

- **Signing**: Set `KHAI_WEBHOOK_SECRET` env var. Khai computes HMAC-SHA256 of the JSON body and sends it as `X-Khai-Signature: sha256=<hex>`.
- **Retry**: Up to 3 attempts with exponential backoff (1s, 4s, 16s). No retry on 4xx.
- **Status**: Results include a `webhook` field: `{status: "delivered"|"failed", attempts, ...}`.
- **Headers**: `X-Khai-Event: operation.completed`, `X-Khai-Operation: test|audit|action|link-check`, `X-Khai-Operation-Id: <id>`.

## REST API Quick Reference

The Express server exposes a REST API on `localhost:3001`. The MCP tools call this under the hood.

### Health & Configuration

```bash
# Health check (no auth required)
curl http://localhost:3001/health

# Check configured sites
curl http://localhost:3001/api/sites
```

### Crawl Testing

```bash
# Start a crawl test
curl -X POST http://localhost:3001/api/test/start \
  -H "Content-Type: application/json" \
  -d '{"site": "yoursite.com", "account": "admin", "maxDepth": 2}'

# Start a crawl test with webhook notification
curl -X POST http://localhost:3001/api/test/start \
  -H "Content-Type: application/json" \
  -d '{"site": "yoursite.com", "account": "admin", "webhookUrl": "https://example.com/webhook"}'

# Get test status (async polling)
curl http://localhost:3001/api/test/{testId}/status

# Get test results
curl http://localhost:3001/api/test/{testId}/results

# List all tests
curl http://localhost:3001/api/tests

# Stop a running test
curl -X POST http://localhost:3001/api/test/{testId}/stop

# Delete a test
curl -X DELETE http://localhost:3001/api/test/{testId}
```

### Actions (Browser Automation)

```bash
# Execute custom actions (navigate, click, screenshot, etc.)
curl -X POST http://localhost:3001/api/actions/execute \
  -H "Content-Type: application/json" \
  -d '{"site": "yoursite.com", "account": "admin", "actions": [
    {"type": "navigate", "url": "/admin"},
    {"type": "wait", "duration": 2000},
    {"type": "screenshot", "name": "admin-panel"}
  ]}'

# Get action session status (summary only)
curl http://localhost:3001/api/actions/status/{sessionId}

# Get action session results (full output)
curl http://localhost:3001/api/actions/results/{sessionId}
```

### Audit

```bash
# List audit profiles
curl http://localhost:3001/api/audit/profiles

# Start an audit
curl -X POST http://localhost:3001/api/audit/start \
  -H "Content-Type: application/json" \
  -d '{"site": "yoursite.com"}'

# Get audit status
curl http://localhost:3001/api/audit/{auditId}/status

# Get audit results
curl http://localhost:3001/api/audit/{auditId}/results

# List all audits
curl http://localhost:3001/api/audit

# Delete an audit
curl -X DELETE http://localhost:3001/api/audit/{auditId}
```

### Test Suites

```bash
# List saved suites
curl http://localhost:3001/api/suites

# Run a suite (optional tag filter and dry run)
curl -X POST "http://localhost:3001/api/suites/{suiteId}/run?tags=smoke,critical&dryRun=false"

# Get run results
curl http://localhost:3001/api/suites/{suiteId}/runs/{runId}/results

# Replay a historical run
curl -X POST http://localhost:3001/api/suites/{suiteId}/runs/{runId}/replay

# List all runs for a suite
curl http://localhost:3001/api/suites/{suiteId}/runs

# Get trend analysis / history
curl "http://localhost:3001/api/suites/{suiteId}/history?days=30&limit=100"
```

### Advanced Testing

All advanced tests return a `jobId` for async polling via `/api/advanced/jobs/{jobId}` and `/api/advanced/jobs/{jobId}/results`.

```bash
# Link checking
curl -X POST http://localhost:3001/api/advanced/links/check \
  -H "Content-Type: application/json" \
  -d '{"baseUrl": "https://yoursite.com", "maxPages": 50}'

# Flow testing
curl -X POST http://localhost:3001/api/advanced/flows/run \
  -H "Content-Type: application/json" \
  -d '{"site": "yoursite.com"}'

# API fuzzing
curl -X POST http://localhost:3001/api/advanced/fuzz/api \
  -H "Content-Type: application/json" \
  -d '{"baseUrl": "https://api.yoursite.com", "endpoints": [{"path": "/users", "method": "GET"}]}'

# Form fuzzing
curl -X POST http://localhost:3001/api/advanced/fuzz/forms \
  -H "Content-Type: application/json" \
  -d '{"baseUrl": "https://yoursite.com", "pages": ["/contact", "/signup"]}'

# Lighthouse performance audit
curl -X POST http://localhost:3001/api/advanced/lighthouse \
  -H "Content-Type: application/json" \
  -d '{"pages": ["https://yoursite.com", "https://yoursite.com/about"]}'

# Visual regression
curl -X POST http://localhost:3001/api/advanced/visual/compare \
  -H "Content-Type: application/json" \
  -d '{"baselineDir": "baseline", "currentDir": "current"}'

# Job status (for all advanced tests)
curl http://localhost:3001/api/advanced/jobs/{jobId}
curl http://localhost:3001/api/advanced/jobs/{jobId}/results
```

### Purchase Testing

```bash
# Get pending purchases
curl http://localhost:3001/api/purchases/pending

# Confirm/cancel a purchase
curl -X POST http://localhost:3001/api/purchases/{purchaseId}/confirm \
  -H "Content-Type: application/json" \
  -d '{"confirm": true}'
```

### Password Rotation

```bash
# Rotate a password
curl -X POST http://localhost:3001/api/rotate-password \
  -H "Content-Type: application/json" \
  -d '{"site": "yoursite.com", "account": "admin", "newPassword": "newpass123"}'

# Check rotation status
curl http://localhost:3001/api/rotation/{rotationId}/status
```

### Communications Monitoring

```bash
# Initialize monitor
curl -X POST http://localhost:3001/api/comms/init

# Get messages
curl http://localhost:3001/api/comms/messages
curl http://localhost:3001/api/comms/messages?unread=true

# Get unread count
curl http://localhost:3001/api/comms/unread

# Wait for verification code
curl -X POST http://localhost:3001/api/comms/wait-for-code \
  -H "Content-Type: application/json" \
  -d '{"type": "sms", "timeout": 120000}'

# Check for new messages now
curl -X POST http://localhost:3001/api/comms/check

# Monitor status
curl http://localhost:3001/api/comms/status

# Stop monitor
curl -X POST http://localhost:3001/api/comms/stop
```

## API Response Format

All API endpoints return a consistent envelope:

```json
{ "success": true, "data": { ... } }
{ "success": false, "error": "Error message" }
```

## Configuration Files

| File | Purpose |
|------|---------|
| `config/credentials.json` | Your site credentials (gitignored, never shared) |
| `config/credentials.example.json` | Template - copy this to get started |
| `config/audit-profiles/*.json` | Audit profiles defining what to test per site |
| `config/flows/*.json` | Multi-step test flows (login, checkout, etc.) |
| `config/schedules.json` | Scheduled recurring tests |
| `KHAI_WEBHOOK_SECRET` env var | Shared secret for HMAC-SHA256 webhook signatures |

### Quick Actions

```bash
# Shorthand endpoints that delegate to /actions/execute
curl -X POST http://localhost:3001/api/actions/create-note \
  -H "Content-Type: application/json" \
  -d '{"site": "yoursite.com", "account": "admin", "patientId": "123", "content": {}}'

curl -X POST http://localhost:3001/api/actions/send-fax \
  -H "Content-Type: application/json" \
  -d '{"site": "yoursite.com", "account": "admin", "faxNumber": "+15551234567", "content": "..."}'

curl -X POST http://localhost:3001/api/actions/send-sms \
  -H "Content-Type: application/json" \
  -d '{"site": "yoursite.com", "account": "admin", "phoneNumber": "+15551234567", "message": "..."}'
```

## When to Suggest Khai

Suggest **"Should I summon Khai?"** when the user needs:
- Screenshots of logged-in areas
- Checkout/payment flow testing
- Running saved test suites with trend tracking
- Accessibility audits (axe-core WCAG)
- Email/SMS verification code capture
- Comprehensive site crawling with auth
- Any task requiring stored credentials
- Security auditing of a website
- Broken link checking
- Webhook notifications on operation completion
- Monitoring authenticated pages for content or visual changes on a schedule

## Output

- Screenshots: `screenshots/`
- Reports: `reports/`
- Logs: server stdout

## Development Status

See `.planning/ROADMAP.md` for full status.

## Legal

Only test websites you own or have explicit permission to test.
