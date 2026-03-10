# Khai (חי) - Browser Automation MCP Server

> **18 = Life** - Bringing Projects to Life

Khai is an MCP (Model Context Protocol) server that gives Claude Code browser automation superpowers. It handles things Claude can't do on its own: logging into websites, taking screenshots of authenticated pages, testing checkout flows, checking for broken links, and running security audits.

## Architecture

Khai has two layers:

1. **Express server** (`src/server.js`) — Puppeteer-powered browser automation on `localhost:3001`
2. **MCP server** (`khai_mcp/server.py`) — Python MCP wrapper that exposes the Express API as Claude Code tools

Claude Code talks to the MCP server, which forwards requests to the Express server.

## Quick Start

### 1. Install dependencies

```bash
npm install
pip install -e .   # or: cd khai_mcp && pip install -e ..
```

### 2. Configure credentials

```bash
cp config/credentials.example.json config/credentials.json
# Edit credentials.json with your site's login credentials
```

### 3. Start the Express server

```bash
npm start
```

### 4. Add to Claude Code's MCP config

**SSE mode** (recommended for shared/persistent use):

```bash
khai-mcp --sse  # or: MCP_SSE_PORT=3105 khai-mcp
```

Add to your Claude Code MCP settings:
```json
{
  "khai": {
    "type": "sse",
    "url": "http://localhost:3105/sse"
  }
}
```

**Stdio mode** (simpler, single-session):

```json
{
  "khai": {
    "type": "command",
    "command": ["khai-mcp"]
  }
}
```

## MCP Tools

| Tool | Description |
|------|-------------|
| `khai_list_sites` | List configured sites and accounts |
| `khai_start_test` | Start an authenticated crawl test (supports webhook_url) |
| `khai_test_status` | Check crawl test progress |
| `khai_test_results` | Get full crawl test results |
| `khai_execute_actions` | Run browser action sequences (navigate, screenshot, etc.) (supports webhook_url) |
| `khai_action_status` | Check action session status |
| `khai_action_results` | Get full action session results |
| `khai_run_audit` | Start a security/configuration audit (supports webhook_url) |
| `khai_audit_results` | Get audit status and results |
| `khai_check_links` | Check a site for broken links (supports webhook_url) |
| `khai_watch_create` | Create a scheduled watch to monitor an authenticated page for changes |
| `khai_watch_list` | List all configured watches and their status |
| `khai_watch_delete` | Delete a watch by id |
| `khai_watch_history` | Get recent run history for a watch |

### Workflow

1. `khai_list_sites()` — discover configured sites
2. Start a test/audit/action sequence — returns an ID
3. Poll status until complete
4. Get results

All operations are async: start, poll, get results.

### Webhooks

The four start tools (`khai_start_test`, `khai_execute_actions`, `khai_run_audit`, `khai_check_links`) accept an optional `webhook_url` parameter. When provided, Khai POSTs the full operation results to that URL on completion.

- Set `KHAI_WEBHOOK_SECRET` env var to enable HMAC-SHA256 signing (`X-Khai-Signature: sha256=<hex>`)
- Delivery retries up to 3 times with exponential backoff (1s, 4s, 16s); no retry on 4xx responses
- Results include a `webhook` field with delivery status (`delivered`/`failed`, attempts, timestamps)

## Features

- **Authenticated crawling** — log into any configured site and crawl protected pages, with login failure detection and session expiry handling
- **Deep link discovery** — configurable depth (1-10 levels), reports broken links, slow pages, JS errors
- **Issue deduplication** — fingerprint-based dedup with severity tiers (critical/high/medium/low), filters benign patterns (Sentry, analytics)
- **Screenshot capture** — full-page screenshots of every page visited, plus animation/transition capture
- **Test suites** — saved test definitions with tag filtering, replay, run history, and trend analysis
- **Accessibility audits** — axe-core integration for WCAG compliance checking
- **Security auditing** — exposed files (.env, .git), missing headers, auth bypass
- **Lighthouse audits** — performance, accessibility, SEO scoring
- **Visual regression** — screenshot comparison over time with pixelmatch
- **Flow testing** — multi-step test sequences (login, navigate, fill forms, assert, screenshot)
- **API & form fuzzing** — edge-case input testing for endpoints and form fields
- **Link checking** — crawl sites for broken links with configurable concurrency
- **Webhook notifications** — POST results to any URL on operation completion with HMAC-SHA256 signing, 3-attempt retry, and exponential backoff
- **Purchase testing** — fill payment forms (requires confirmation before completing)
- **Communication monitoring** — email, SMS, fax inbox monitoring with verification code extraction
- **Password rotation** — automated password changes with 2FA support

## Configuration

Edit `config/credentials.json` to add your sites:

```json
{
  "sites": {
    "yoursite.com": {
      "baseUrl": "https://yoursite.com",
      "accounts": {
        "admin": {
          "loginUrl": "/admin/login",
          "usernameField": "input[name='email']",
          "passwordField": "input[name='password']",
          "submitButton": "button[type='submit']",
          "username": "admin@yoursite.com",
          "password": "your-password"
        }
      }
    }
  },
  "payment": {
    "testMode": true,
    "requireConfirmation": true,
    "cards": {
      "primary": {
        "number": "4111111111111111",
        "expiry": "12/28",
        "cvv": "123"
      }
    }
  }
}
```

## REST API Reference

The Express server also exposes a REST API directly on `localhost:3001`. This is what the MCP server calls under the hood.

### Health & Configuration
- `GET /health` — Health check (no auth required)
- `GET /api/sites` — List configured sites

### Crawl Testing
- `POST /api/test/start` — Start a crawl test
- `GET /api/test/:id/status` — Test status
- `GET /api/test/:id/results` — Test results
- `POST /api/test/:id/stop` — Stop a test
- `DELETE /api/test/:id` — Delete a test

### Actions (Browser Automation)
- `POST /api/actions/execute` — Execute action sequence
- `GET /api/actions/status/:id` — Action status (summary)
- `GET /api/actions/results/:id` — Action results (full)

### Audit
- `GET /api/audit/profiles` — List audit profiles
- `POST /api/audit/start` — Start an audit
- `GET /api/audit/:id/status` — Audit status
- `GET /api/audit/:id/results` — Audit results

### Test Suites
- `GET /api/suites` — List saved test suites
- `POST /api/suites/:id/run` — Run a suite (supports `?tags=smoke,critical` and `?dryRun=true`)
- `GET /api/suites/:id/runs/:runId/results` — Get suite run results
- `POST /api/suites/:id/runs/:runId/replay` — Replay a historical run
- `GET /api/suites/:id/runs` — List all runs for a suite
- `GET /api/suites/:id/history` — Trend analysis (supports `?days=30&limit=100`)

### Advanced Testing
- `POST /api/advanced/links/check` — Link checking
- `POST /api/advanced/flows/run` — Flow testing
- `POST /api/advanced/fuzz/api` — API fuzzing
- `POST /api/advanced/fuzz/forms` — Form fuzzing
- `POST /api/advanced/lighthouse` — Lighthouse audit
- `POST /api/advanced/visual/compare` — Visual regression
- `GET /api/advanced/jobs/:id` — Job status
- `GET /api/advanced/jobs/:id/results` — Job results

### Purchases
- `GET /api/purchases/pending` — Pending confirmations
- `POST /api/purchases/:id/confirm` — Confirm/cancel

### Quick Actions
- `POST /api/actions/create-note` — Create a patient note (shorthand)
- `POST /api/actions/send-fax` — Send a fax (shorthand)
- `POST /api/actions/send-sms` — Send an SMS (shorthand)

### Communications
- `POST /api/comms/init` — Start monitoring
- `POST /api/comms/stop` — Stop monitoring
- `GET /api/comms/messages` — Get messages
- `GET /api/comms/unread` — Get unread counts

### Watches
- `POST /api/watches` — Create a watch
- `GET /api/watches` — List all watches
- `GET /api/watches/:id` — Get a watch
- `PUT /api/watches/:id` — Update a watch
- `DELETE /api/watches/:id` — Delete a watch
- `GET /api/watches/:id/history` — Get watch run history (supports `?limit=N`)
- `POST /api/watches/:id/run` — Trigger an immediate run

```bash
# Create a watch
curl -X POST http://localhost:3001/api/watches \
  -H "Content-Type: application/json" \
  -d '{"site": "yoursite.com", "account": "admin", "url": "/dashboard", "schedule": "0 * * * *", "webhookUrl": "https://example.com/hook"}'

# List all watches
curl http://localhost:3001/api/watches

# Get a watch
curl http://localhost:3001/api/watches/{watchId}

# Update a watch
curl -X PUT http://localhost:3001/api/watches/{watchId} \
  -H "Content-Type: application/json" \
  -d '{"schedule": "*/30 * * * *", "enabled": true}'

# Delete a watch
curl -X DELETE http://localhost:3001/api/watches/{watchId}

# Get watch run history
curl "http://localhost:3001/api/watches/{watchId}/history?limit=10"

# Trigger an immediate run
curl -X POST http://localhost:3001/api/watches/{watchId}/run
```

## File Structure

```
khai-share/
├── khai_mcp/                       # Python MCP server
│   ├── server.py                   # MCP tool definitions
│   └── client.py                   # HTTP client for Express API
├── config/
│   ├── credentials.example.json    # Template - copy to credentials.json
│   ├── credentials.json            # Your credentials (gitignored)
│   ├── audit-profiles/             # Audit profile definitions
│   ├── flows/                      # Multi-step test flows
│   └── schedules.json              # Scheduled tests
├── src/
│   ├── server.js                   # Express server (port 3001)
│   ├── agent/                      # Core automation modules
│   │   ├── crawler.js              # Web crawling with auth, issue dedup, login detection
│   │   ├── actions.js              # Custom action executor
│   │   ├── suiteRunner.js          # Test suite execution, replay, history
│   │   ├── accessibility.js        # axe-core accessibility audits
│   │   ├── animationCapture.js     # Animation/transition screenshot capture
│   │   ├── purchaseTester.js       # Payment form testing
│   │   ├── communicationMonitor.js # Email/SMS/fax monitoring
│   │   ├── auditor.js              # Audit profile runner
│   │   ├── flowTester.js           # Flow definition runner
│   │   ├── apiFuzzer.js            # API endpoint fuzzing
│   │   ├── formFuzzer.js           # Form field fuzzing
│   │   ├── linkChecker.js          # Link validation
│   │   ├── lighthouse.js           # Performance auditing
│   │   ├── visualRegression.js     # Visual diff testing
│   │   ├── passwordRotator.js      # Password rotation
│   │   └── scheduler.js            # Scheduled test execution
│   ├── routes/
│   │   ├── api.js                  # Core test/site/purchase/rotation routes
│   │   ├── actions.js              # Browser action execution routes
│   │   ├── audit.js                # Security audit routes
│   │   ├── advanced.js             # Lighthouse, visual, fuzzing, links, flows
│   │   ├── suites.js               # Test suite management routes
│   │   └── communications.js       # Email/SMS/fax monitoring routes
│   └── public/                     # Web UI
├── screenshots/                    # Test screenshots (auto-generated)
├── reports/                        # Test reports (auto-generated)
└── pyproject.toml                  # Python package config
```

## Security

- **Local only** — Khai runs on localhost, never exposed to the internet
- **Credentials protected** — stored locally in gitignored file, never logged
- **Confirmation required** — all purchases need explicit approval
- **API key support** — set `KHAI_API_KEY` env var to require authentication on `/api/*` endpoints
- **Webhook signing** — set `KHAI_WEBHOOK_SECRET` env var for HMAC-SHA256 signatures on outbound webhook payloads
- **Audit trail** — all actions logged

## Legal

Only test websites you own or have explicit permission to test.
