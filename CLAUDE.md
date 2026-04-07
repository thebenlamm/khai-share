# Khai Contributor Notes

Khai is a local browser-automation stack with:

1. An Express server on `127.0.0.1:3001`
2. A Python MCP server that exposes selected Express functionality to Claude Code

This file is the short maintenance reference for people changing the product.

## Update Rule

When a feature, route, tool, action type, or operator workflow changes, update all relevant docs before considering the work done:

1. [README.md](/Users/benlamm/Workspace/khai-share/README.md)
2. [CLAUDE.md](/Users/benlamm/Workspace/khai-share/CLAUDE.md)
3. [khai_mcp/server.py](/Users/benlamm/Workspace/khai-share/khai_mcp/server.py)
4. [src/public/guide.html](/Users/benlamm/Workspace/khai-share/src/public/guide.html)
5. [src/public/about.html](/Users/benlamm/Workspace/khai-share/src/public/about.html)

## Architecture

- Express app and middleware: [src/app.js](/Users/benlamm/Workspace/khai-share/src/app.js)
- Express entrypoint: [src/server.js](/Users/benlamm/Workspace/khai-share/src/server.js)
- MCP server: [khai_mcp/server.py](/Users/benlamm/Workspace/khai-share/khai_mcp/server.py)
- MCP HTTP client wrapper: [khai_mcp/client.py](/Users/benlamm/Workspace/khai-share/khai_mcp/client.py)
- Static docs/UI: [src/public](/Users/benlamm/Workspace/khai-share/src/public)

The MCP server is not authoritative for product behavior. The Express routes and agents are.

## Setup

```bash
npm install
pip install -e .
cp config/credentials.example.json config/credentials.json
```

Start the Express server:

```bash
npm start
```

Start the MCP server:

```bash
khai-mcp
# or
khai-mcp --sse
```

## Environment Variables

| Variable | Effect | Default |
| --- | --- | --- |
| `KHAI_API_KEY` | Requires `X-Khai-Key` on `/api/*` requests | unset |
| `KHAI_WEBHOOK_SECRET` | Signs outbound webhooks | unset |
| `KHAI_ALLOW_EVAL` | Enables `evaluate` action | disabled |
| `KHAI_ALLOW_EXTERNAL_NAV` | Lets `navigate` leave the configured site host | disabled |
| `PORT` | Express port | `3001` |
| `MCP_SSE_PORT` | MCP SSE port | `3105` |

## Naming Conventions

The docs need to stay explicit about this:

- MCP tools use snake_case parameters such as `webhook_url`, `record_har`, `max_depth`, `start_path`.
- The REST API uses camelCase fields such as `webhookUrl`, `recordHar`, `maxDepth`, `startPath`.

Do not silently mix them in examples.

## MCP Tools

These are the currently exposed tools:

| Tool | Purpose |
| --- | --- |
| `khai_list_sites` | List configured sites and accounts |
| `khai_start_test` | Start an authenticated crawl |
| `khai_test_status` | Poll crawl status |
| `khai_test_results` | Fetch crawl results |
| `khai_execute_actions` | Start an action session |
| `khai_action_status` | Poll action status |
| `khai_action_results` | Fetch action results |
| `khai_action_har` | Fetch captured HAR output |
| `khai_run_audit` | Start an audit |
| `khai_audit_results` | Poll/fetch audit results |
| `khai_check_links` | Start a broken-link job |
| `khai_watch_create` | Create a scheduled watch |
| `khai_watch_list` | List watches |
| `khai_watch_delete` | Delete a watch |
| `khai_watch_history` | Fetch watch history |
| `khai_baseline_create` | Create a baseline from a completed crawl |
| `khai_baseline_list` | List baselines |
| `khai_baseline_get` | Fetch a baseline |
| `khai_baseline_update` | Update a baseline |
| `khai_baseline_delete` | Delete a baseline |

Supported action types in `khai_execute_actions`:

- `navigate`
- `wait`
- `screenshot`
- `evaluate`
- `create-note`
- `send-fax`
- `send-sms`
- `twilio-a2p`

If action support changes, update:

- [khai_mcp/server.py](/Users/benlamm/Workspace/khai-share/khai_mcp/server.py)
- [README.md](/Users/benlamm/Workspace/khai-share/README.md)
- [src/public/guide.html](/Users/benlamm/Workspace/khai-share/src/public/guide.html)

## REST Surface

Primary route modules:

- Core crawl routes: [src/routes/api.js](/Users/benlamm/Workspace/khai-share/src/routes/api.js)
- Actions: [src/routes/actions.js](/Users/benlamm/Workspace/khai-share/src/routes/actions.js)
- Audits: [src/routes/audit.js](/Users/benlamm/Workspace/khai-share/src/routes/audit.js)
- Advanced jobs: [src/routes/advanced.js](/Users/benlamm/Workspace/khai-share/src/routes/advanced.js)
- Suites: [src/routes/suites.js](/Users/benlamm/Workspace/khai-share/src/routes/suites.js)
- Watches: [src/routes/watches.js](/Users/benlamm/Workspace/khai-share/src/routes/watches.js)
- Baselines: [src/routes/baselines.js](/Users/benlamm/Workspace/khai-share/src/routes/baselines.js)
- Communications: [src/routes/communications.js](/Users/benlamm/Workspace/khai-share/src/routes/communications.js)

If you add a route, confirm whether it should also appear in:

- the README REST reference
- the public guide
- the MCP server instructions string

## Operational Notes

- The Express server binds to `127.0.0.1`, not all interfaces.
- `/health` and static files do not require `KHAI_API_KEY`; `/api/*` does when the key is set.
- Crawl viewports currently support `desktop`, `tablet`, and `mobile`.
- MCP docs currently advertise `desktop` and `mobile`; if you decide to expose `tablet` intentionally through MCP docs, update examples everywhere.
- Watch schedules are cron expressions interpreted in UTC.
- Webhook delivery rejects private/reserved IP targets and retries `1s`, `4s`, `16s`.
- Action-session status/results are stored in an in-memory `JobStore`; persisted action JSON is written to `reports/actions`, but the REST session endpoints themselves are memory-backed.

## Tests

Run the Node test suite with:

```bash
npm test
```

Useful focused checks:

```bash
node --test test/webhook.test.js
node --test test/jobStore.test.js
node --test test/response.test.js
```

For the Python wrapper:

```bash
pytest
```

## Documentation Standard

Prefer documentation that is:

- explicit about what is available through MCP versus REST-only
- explicit about async start/poll/results flows
- explicit about parameter names and defaults
- short enough to scan without losing accuracy

Avoid aspirational or speculative feature lists. If the code does not expose it today, do not document it as available.
