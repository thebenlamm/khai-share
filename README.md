# Khai (חי) - AI Lifecycle Agent

> **18 = Life** - Bringing Projects to Life

Khai is a local testing agent that works alongside Claude Code. It handles things Claude can't do on its own: logging into websites, taking screenshots of authenticated pages, testing checkout flows, and monitoring communications.

## Quick Start

```bash
npm install
cp config/credentials.example.json config/credentials.json
# Edit credentials.json with your site's login credentials
npm start
```

Open http://localhost:3001

## Using with Claude Code

Drop this folder into your project and open it with Claude Code. The `CLAUDE.md` tells Claude how to use Khai automatically. When you need authenticated testing, just tell Claude:

> "summon khai" or "test my site with khai"

Claude will call Khai's API to crawl your site, take screenshots, and report issues.

## Features

### Generic Site Testing
- **Authenticated crawling** — log into any configured site and crawl protected pages
- **Deep link discovery** — configurable depth (1-10 levels), reports broken links, slow pages, JS errors
- **Screenshot capture** — full-page screenshots of every page visited, organized by test ID
- **Security auditing** — exposed files (.env, .git), missing headers, auth bypass
- **Purchase testing** — fill payment forms (requires your confirmation before completing)
- **Communication monitoring** — email, SMS, fax inbox monitoring with verification code extraction
- **Flow testing** — multi-step test sequences (login, navigate, fill forms, assert, screenshot)
- **API & form fuzzing** — edge-case input testing
- **Lighthouse audits** — performance, accessibility, SEO scoring
- **Visual regression** — screenshot comparison over time
- **Password rotation** — automated password changes with 2FA support

### HomeBay QA Testing

Purpose-built test suite for [HomeBay](https://homebay.com) real estate auction platform. Tests all 4 user roles (admin, agent, seller, buyer) through authentication and critical workflows.

**What's built (Phase 1):**

| Module | What it does |
|--------|-------------|
| `src/homebay/pool.js` | BrowserPool — max 3 concurrent Puppeteer instances, 30s queue timeout, 5-min force-kill, crash recovery, `withSlot` guaranteed cleanup |
| `src/homebay/config.js` | Loads HomeBay credentials from `credentials.json`, validates all 4 roles on startup, staging health check |
| `src/homebay/navigate.js` | React-aware form filling (native value setter + event dispatch), Next.js navigation (waitForSelector, not waitForNavigation), hydration detection |
| `src/homebay/auth.js` | Login (all 4 roles + role-selector modal), registration, forgot-password, reset-password — all with screenshot capture |
| `src/routes/homebay.js` | 7 Express API endpoints at `/api/homebay/*` |

**Key technical decisions:**
- React controlled inputs require `Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set` + synthetic events — `page.type()` alone does NOT trigger React state updates
- Next.js client-side routing does NOT trigger full page loads, so `waitForNavigation()` times out — use `waitForSelector()` on expected content instead
- HomeBay shows `.animate-pulse` skeleton during auth store hydration — must wait for it to disappear before filling forms
- Max 3 concurrent browsers enforced for 8GB MacBook Air memory constraint

**What's planned (Phases 2-4):**
- Phase 2: All role workflows (agent creates auction, buyer bids, seller monitors) + Stripe payment testing
- Phase 3: Multi-browser concurrent bidding with WebSocket event verification
- Phase 4: One-command orchestrated test suite with HTML reporting

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
        },
        "user": {
          "loginUrl": "/login",
          "usernameField": "input[name='email']",
          "passwordField": "input[name='password']",
          "submitButton": "button[type='submit']",
          "username": "user@yoursite.com",
          "password": "user-password"
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

## API Reference

### Generic Testing
- `GET /api/sites` - List configured sites
- `POST /api/test/start` - Start new crawl test
- `GET /api/test/:id/status` - Get test status
- `GET /api/test/:id/results` - Get results
- `POST /api/test/:id/stop` - Stop test

### HomeBay Testing (`/api/homebay/*`)

| Method | Endpoint | Body | What it does |
|--------|----------|------|-------------|
| `POST` | `/api/homebay/login` | `{ role: "admin"\|"agent"\|"seller"\|"buyer" }` | Login as a specific role |
| `POST` | `/api/homebay/login/all` | none | Health check + login all 4 roles sequentially |
| `POST` | `/api/homebay/register` | `{ email, password, dateOfBirth?, firstName?, lastName?, phone? }` | Register new buyer account |
| `POST` | `/api/homebay/forgot-password` | `{ email }` | Submit forgot-password form |
| `POST` | `/api/homebay/reset-password` | `{ token, newPassword }` | Reset password with email token |
| `GET` | `/api/homebay/health` | — | Check if HomeBay staging is reachable |
| `GET` | `/api/homebay/config` | — | Show configured roles (no passwords) |

All endpoints return `{ success: true, data: {...} }` or `{ success: false, error: "..." }`.

**Login response includes:** `{ success, role, finalUrl }` on success, `{ success: false, role, error, screenshot }` on failure.

**Login/all response includes:** `{ results: [...], summary: { total, succeeded, failed, health } }`.

### Custom Actions
- `POST /api/actions/execute` - Run a sequence of actions (navigate, click, fill, screenshot, etc.)

### Audit
- `GET /api/audit/profiles` - List available audit profiles
- `POST /api/audit/start` - Start an audit
- `GET /api/audit/:id/status` - Audit status
- `GET /api/audit/:id/results` - Audit results

### Purchases
- `GET /api/purchases/pending` - Pending confirmations
- `POST /api/purchases/:id/confirm` - Confirm/cancel

### Communications
- `POST /api/comms/init` - Start monitoring
- `POST /api/comms/stop` - Stop monitoring
- `GET /api/comms/messages` - Get messages
- `GET /api/comms/unread` - Get unread counts

## File Structure

```
khai/
├── config/
│   ├── credentials.example.json    # Template - copy to credentials.json
│   ├── credentials.json            # Your credentials (gitignored)
│   ├── audit-profiles/             # Site audit definitions
│   ├── flows/                      # Multi-step test flows
│   └── schedules.json              # Scheduled tests
├── screenshots/                    # Test screenshots (auto-generated)
├── reports/                        # Test reports (auto-generated)
└── src/
    ├── server.js                   # Express server (port 3001)
    ├── homebay/                    # HomeBay QA testing module
    │   ├── pool.js                 # BrowserPool (max 3, queue, timeout, crash recovery)
    │   ├── config.js               # Credential loading, validation, health check
    │   ├── navigate.js             # React form filling, Next.js navigation helpers
    │   └── auth.js                 # Login, register, forgot/reset password flows
    ├── agent/                      # Generic agent modules
    │   ├── crawler.js              # Web crawling with auth
    │   ├── actions.js              # Custom action executor
    │   ├── purchaseTester.js       # Payment form testing
    │   ├── communicationMonitor.js # Email/SMS/fax monitoring
    │   ├── auditor.js              # Audit profile runner
    │   ├── flowTester.js           # Flow definition runner
    │   ├── apiFuzzer.js            # API endpoint fuzzing
    │   ├── formFuzzer.js           # Form field fuzzing
    │   ├── linkChecker.js          # Link validation
    │   ├── lighthouse.js           # Performance auditing
    │   ├── visualRegression.js     # Visual diff testing
    │   ├── passwordRotator.js      # Password rotation
    │   └── scheduler.js            # Scheduled test execution
    ├── routes/
    │   ├── api.js                  # Generic test/audit/action routes
    │   └── homebay.js              # HomeBay-specific API routes
    └── public/                     # Web UI
```

## Security

- **Local only** - Khai runs on localhost, never exposed to the internet
- **Credentials protected** - Stored locally in gitignored file, never logged
- **Confirmation required** - All purchases need your explicit approval
- **Audit trail** - All actions logged

## Legal

Only test websites you own or have explicit permission to test.
