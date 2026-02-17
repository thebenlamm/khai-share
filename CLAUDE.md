# Khai (חי) - AI Lifecycle Agent

> **When Claude can't do something that requires credentials, payments, or live site testing - summon Khai.**

## Setup (first time)

```bash
npm install
cp config/credentials.example.json config/credentials.json
```

Then edit `config/credentials.json` with your site's credentials (login URLs, usernames, passwords, CSS selectors for form fields).

## Running Khai

```bash
npm start
```

Opens at **http://localhost:3001** - you can use the web UI or the API.

Optionally set `KHAI_API_KEY` env var to require API key authentication on all `/api/*` endpoints (checked via `X-Khai-Key` header).

## What Khai Does

- **Authenticated website testing** - logs into your sites with stored credentials and crawls them
- **Deep link crawling** - discovers all pages, checks for broken links, errors, slow loads
- **Screenshot capture** - takes full-page screenshots of every page it visits
- **Purchase testing** - fills payment forms (requires your confirmation before completing)
- **Communication monitoring** - monitors email, SMS, fax inboxes for verification codes
- **Security auditing** - checks for exposed sensitive files, missing security headers, auth bypass
- **Visual regression** - compares screenshots over time to detect visual changes
- **Flow testing** - runs multi-step test flows (login, checkout, form submission)
- **API & form fuzzing** - tests endpoints and forms with edge-case inputs
- **Lighthouse audits** - performance, accessibility, SEO scoring
- **Link checking** - crawls sites for broken links
- **Password rotation** - automates password changes with 2FA support

## How to Summon Khai

When you need Khai, tell Claude: **"summon khai"** or just say **"khai"**

Claude will use Khai's MCP tools (or direct API) to:
1. Start tests against your configured sites
2. Take screenshots of authenticated pages
3. Report issues found (broken links, errors, slow pages)

## API Response Format

All API endpoints return a consistent envelope:

```json
{ "success": true, "data": { ... } }
{ "success": false, "error": "Error message" }
```

## API Quick Reference

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

# Get action session status (async polling)
curl http://localhost:3001/api/actions/status/{sessionId}
```

**Action types:** `navigate`, `wait`, `screenshot`, `evaluate`, `create-note`, `send-fax`, `send-sms`, `twilio-a2p`

### Audit

```bash
# List audit profiles
curl http://localhost:3001/api/audit/profiles

# Start an audit
curl -X POST http://localhost:3001/api/audit/start \
  -H "Content-Type: application/json" \
  -d '{"site": "yoursite.com"}'

# Get audit status (async polling)
curl http://localhost:3001/api/audit/{auditId}/status

# Get audit results
curl http://localhost:3001/api/audit/{auditId}/results

# List all audits
curl http://localhost:3001/api/audit

# Delete an audit
curl -X DELETE http://localhost:3001/api/audit/{auditId}
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
# Rotate a password (reads current creds from config)
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

# Wait for verification code (blocks until received or timeout)
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

## Async Polling Pattern

Most operations (tests, audits, actions, advanced jobs) are async:

1. **Start** - POST returns an ID (`testId`, `auditId`, `sessionId`, `jobId`)
2. **Poll** - GET the status endpoint until `status` is `completed` or `error`
3. **Results** - GET the results endpoint for full data

## Configuration Files

| File | Purpose |
|------|---------|
| `config/credentials.json` | Your site credentials (gitignored, never shared) |
| `config/credentials.example.json` | Template - copy this to get started |
| `config/audit-profiles/*.json` | Audit profiles defining what to test per site |
| `config/flows/*.json` | Multi-step test flows (login, checkout, etc.) |
| `config/schedules.json` | Scheduled recurring tests |

## When to Suggest Khai

Suggest **"Should I summon Khai?"** when the user needs:
- Screenshots of logged-in areas
- Checkout/payment flow testing
- Email/SMS verification code capture
- Comprehensive site crawling with auth
- Any task requiring stored credentials

## Output

- Screenshots: `screenshots/`
- Reports: `reports/`
- Logs: server stdout

## Legal

Only test websites you own or have explicit permission to test.
