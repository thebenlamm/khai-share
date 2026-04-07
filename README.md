# Khai (חי)

Browser automation and authenticated website testing for Claude Code via MCP.

Original concept and early code inspiration came from [Dr Ben Sofer](https://drbensoffer.com/).

Khai has two parts:

1. A local Express server on `127.0.0.1:3001` that drives Puppeteer.
2. A Python MCP server that exposes the Express API as Claude Code tools.

Use it when Claude needs live browser access, stored credentials, screenshots, checkout testing, or authenticated monitoring.

## What It Can Do

- Authenticated crawl tests with screenshots, issue collection, and optional baselines
- Action sessions for targeted browser work such as `navigate`, `wait`, `screenshot`, `evaluate`, `create-note`, `send-fax`, `send-sms`, and `twilio-a2p`
- Security and configuration audits
- Broken-link checks
- Scheduled page watches with change history and optional webhooks
- REST-only features such as test suites, visual regression, flow testing, fuzzing, Lighthouse metrics, password rotation, and communications monitoring

## Architecture

- Express app: [src/app.js](/Users/benlamm/Workspace/khai-share/src/app.js)
- Express entrypoint: [src/server.js](/Users/benlamm/Workspace/khai-share/src/server.js)
- MCP server: [khai_mcp/server.py](/Users/benlamm/Workspace/khai-share/khai_mcp/server.py)
- Static local UI: [src/public/index.html](/Users/benlamm/Workspace/khai-share/src/public/index.html)

The MCP server forwards tool calls to the Express API. The Express server must be running before the MCP tools will work.

## Quick Start

### 1. Install dependencies

```bash
npm install
pip install -e .
```

Requirements:

- Node.js `>=20`
- Python `>=3.10`

### 2. Configure credentials

```bash
cp config/credentials.example.json config/credentials.json
```

Edit `config/credentials.json` with the sites and accounts Khai should use.

### 3. Start the Express server

```bash
npm start
```

This starts the local API and UI on `http://127.0.0.1:3001`.

### 4. Start the MCP server

Stdio mode:

```bash
khai-mcp
```

SSE mode:

```bash
khai-mcp --sse
# or
MCP_SSE_PORT=3105 khai-mcp --sse
```

Claude Code MCP config examples:

```json
{
  "khai": {
    "type": "command",
    "command": ["khai-mcp"]
  }
}
```

```json
{
  "khai": {
    "type": "sse",
    "url": "http://localhost:3105/sse"
  }
}
```

## Environment Variables

| Variable | Purpose | Default |
| --- | --- | --- |
| `KHAI_API_KEY` | Requires `X-Khai-Key` on all `/api/*` routes | unset |
| `KHAI_WEBHOOK_SECRET` | Signs outbound webhook bodies with `X-Khai-Signature` | unset |
| `KHAI_ALLOW_EVAL` | Enables the `evaluate` action type | disabled |
| `KHAI_ALLOW_EXTERNAL_NAV` | Allows `navigate` to leave the configured site host | disabled |
| `PORT` | Express server port | `3001` |
| `MCP_SSE_PORT` | MCP SSE port | `3105` |

See [.env.example](/Users/benlamm/Workspace/khai-share/.env.example).

## Credentials File Shape

The minimum useful shape is:

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
          "username": "YOUR_ADMIN_EMAIL",
          "password": "YOUR_ADMIN_PASSWORD"
        }
      }
    }
  }
}
```

Optional sections in the example config:

- `payment`: test cards and checkout selectors
- `communications`: email, SMS, fax, or platform monitoring settings

See [config/credentials.example.json](/Users/benlamm/Workspace/khai-share/config/credentials.example.json).

## MCP Tools

These are the tools currently exposed by the Python MCP server:

| Tool | Purpose |
| --- | --- |
| `khai_list_sites` | List configured sites and accounts |
| `khai_start_test` | Start an authenticated crawl test |
| `khai_test_status` | Poll crawl status |
| `khai_test_results` | Fetch crawl results |
| `khai_execute_actions` | Start an action session |
| `khai_action_status` | Poll action-session status |
| `khai_action_results` | Fetch action-session results |
| `khai_action_har` | Fetch a HAR file for a completed action session |
| `khai_run_audit` | Start an audit |
| `khai_audit_results` | Poll/fetch audit results |
| `khai_check_links` | Start a broken-link check |
| `khai_watch_create` | Create a scheduled watch |
| `khai_watch_list` | List watches |
| `khai_watch_delete` | Delete a watch |
| `khai_watch_history` | Fetch watch history |
| `khai_baseline_create` | Create a crawl baseline from a completed test |
| `khai_baseline_list` | List baselines |
| `khai_baseline_get` | Fetch a baseline |
| `khai_baseline_update` | Refresh a baseline from a new crawl |
| `khai_baseline_delete` | Delete a baseline |

Important naming note:

- MCP arguments use snake_case such as `webhook_url`, `record_har`, `max_depth`, `start_path`.
- The Express API uses camelCase such as `webhookUrl`, `recordHar`, `maxDepth`, `startPath`.

## Common MCP Workflow

1. Call `khai_list_sites`.
2. Start a crawl, audit, link check, or action session.
3. Poll status until it completes.
4. Fetch the full results.

All start-style operations are asynchronous.

## REST API

The Express server is also usable directly on `http://127.0.0.1:3001`.

### Core

- `GET /health`
- `GET /api/sites`
- `GET /api/tests`
- `GET /api/screenshot/:testId/:filename`

### Crawl Tests

- `POST /api/test/start`
- `GET /api/test/:testId/status`
- `GET /api/test/:testId/results`
- `POST /api/test/:testId/stop`
- `DELETE /api/test/:testId`
- `POST /api/test/:testId/issue/:issueId/note`
- `POST /api/test/:testId/fill-payment`
- `GET /api/test/:testId/purchases`

### Purchases and Password Rotation

- `GET /api/purchases/pending`
- `POST /api/purchases/:purchaseId/confirm`
- `POST /api/rotate-password`

### Actions

- `POST /api/actions/execute`
- `GET /api/actions/status/:sessionId`
- `GET /api/actions/results/:sessionId`
- `GET /api/actions/har/:sessionId`
- `POST /api/actions/create-note`
- `POST /api/actions/send-fax`
- `POST /api/actions/send-sms`

Supported action types in `/api/actions/execute`:

- `navigate`
- `wait`
- `screenshot`
- `evaluate`
- `create-note`
- `send-fax`
- `send-sms`
- `twilio-a2p`

### Audits

- `GET /api/audit/profiles`
- `POST /api/audit/start`
- `GET /api/audit/:auditId/status`
- `GET /api/audit/:auditId/results`
- `GET /api/audit`
- `DELETE /api/audit/:auditId`

### Advanced

- `POST /api/advanced/visual/compare`
- `POST /api/advanced/visual/set-baseline`
- `GET /api/advanced/flows/configs`
- `POST /api/advanced/flows/run`
- `POST /api/advanced/fuzz/api`
- `POST /api/advanced/fuzz/forms`
- `POST /api/advanced/lighthouse`
- `POST /api/advanced/links/check`
- `GET /api/advanced/jobs`
- `GET /api/advanced/jobs/:jobId`
- `GET /api/advanced/jobs/:jobId/results`
- `GET /api/advanced/scheduler`
- `POST /api/advanced/scheduler`
- `POST /api/advanced/scheduler/:id/start`
- `POST /api/advanced/scheduler/:id/stop`
- `DELETE /api/advanced/scheduler/:id`
- `GET /api/advanced/scheduler/:id/history`

### Test Suites

- `GET /api/suites`
- `POST /api/suites/:suiteId/run`
- `GET /api/suites/:suiteId/runs/:runId/results`
- `POST /api/suites/:suiteId/runs/:runId/replay`
- `GET /api/suites/:suiteId/runs`
- `GET /api/suites/:suiteId/history`

### Communications

- `POST /api/comms/init`
- `POST /api/comms/stop`
- `GET /api/comms/messages`
- `GET /api/comms/unread`
- `POST /api/comms/messages/:messageId/read`
- `POST /api/comms/wait-for-code`
- `POST /api/comms/webhook/:type`
- `POST /api/comms/check`
- `GET /api/comms/status`

### Watches

- `POST /api/watches`
- `GET /api/watches`
- `GET /api/watches/:id`
- `PUT /api/watches/:id`
- `DELETE /api/watches/:id`
- `GET /api/watches/:id/history`
- `POST /api/watches/:id/run`

### Baselines

- `POST /api/baselines`
- `GET /api/baselines`
- `GET /api/baselines/:id`
- `PUT /api/baselines/:id`
- `DELETE /api/baselines/:id`

## Webhooks

Supported async REST starts accept `webhookUrl`:

- `POST /api/test/start`
- `POST /api/actions/execute`
- `POST /api/audit/start`
- `POST /api/advanced/links/check`
- `POST /api/suites/:suiteId/run`
- `POST /api/suites/:suiteId/runs/:runId/replay`
- watch change notifications
- advanced scheduler notifications

Behavior:

- Webhooks must use `http` or `https`
- Private or reserved IP targets are rejected
- Retries happen up to 3 times with backoff: `1s`, `4s`, `16s`
- `4xx` responses are treated as permanent failures
- If `KHAI_WEBHOOK_SECRET` is set, the payload is signed with HMAC-SHA256

## Local UI

When the Express server is running:

- `/` shows the local crawl-test UI
- `/guide.html` shows the capabilities and API guide
- `/about.html` shows the safety, limits, and operational notes

## Project Layout

```text
khai-share/
├── config/              # Credentials, audit profiles, suites, flows, watches, schedules, baselines
├── khai_mcp/            # Python MCP server and HTTP client wrapper
├── reports/             # JSON output for crawls, audits, actions, suites, HAR files
├── screenshots/         # Crawl, action, and watch screenshots
├── scripts/             # Ad hoc helper scripts
├── src/
│   ├── agent/           # Crawlers, audits, watches, fuzzers, suites, regression helpers
│   ├── public/          # Local UI and static documentation pages
│   ├── routes/          # Express route modules
│   └── utils/           # Shared browser, config, webhook, path, and job helpers
└── test/                # Node test suite
```

## Keeping Docs In Sync

If you add or change routes, MCP tools, or operator workflows, update all of:

- [README.md](/Users/benlamm/Workspace/khai-share/README.md)
- [CLAUDE.md](/Users/benlamm/Workspace/khai-share/CLAUDE.md)
- [khai_mcp/server.py](/Users/benlamm/Workspace/khai-share/khai_mcp/server.py)
- The public pages in [src/public](/Users/benlamm/Workspace/khai-share/src/public)
