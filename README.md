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

### Authenticated Testing
- Log into sites as any configured account (admin, patient, user, etc.)
- Navigate protected areas automatically
- Handle session management and cookies

### Deep Crawling
- Discover all links on a site
- Configurable depth (1-10 levels)
- Respects same-origin policy
- Reports broken links, slow pages, JS errors

### Visual Documentation
- Full-page screenshots of every page visited
- Captures state at time of test
- Organized by test ID

### Issue Detection
- HTTP errors (4xx, 5xx)
- Slow page loads (>5 seconds)
- Broken images
- JavaScript console errors
- Accessibility issues
- Missing CSRF tokens
- Exposed sensitive files (.env, .git, etc.)
- Missing security headers

### Purchase Testing
- Fill payment forms automatically
- **Requires your confirmation before completing any purchase**
- Screenshots before and after

### Communication Monitoring
- Monitor incoming emails
- Receive SMS messages
- Capture fax documents
- Auto-extract verification codes

### Audit Profiles
- Define comprehensive test suites per site (public pages, protected pages, APIs, redirects, security checks)
- See `config/audit-profiles/_template.json` for the full schema

### Test Flows
- Define multi-step test sequences (login, navigate, fill forms, assert, screenshot)
- See `config/flows/example.com.json` for examples

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

### Testing
- `GET /api/sites` - List configured sites
- `POST /api/test/start` - Start new test
- `GET /api/test/:id/status` - Get test status
- `GET /api/test/:id/results` - Get results
- `POST /api/test/:id/stop` - Stop test

### Custom Actions
- `POST /api/actions/execute` - Run a sequence of actions (navigate, click, fill, screenshot, etc.)

### Audit Profiles
- `GET /api/audit/profiles` - List available audit profiles
- `POST /api/audit/run` - Run an audit profile

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
│   │   └── _template.json          # Template for new profiles
│   ├── flows/                      # Multi-step test flows
│   │   └── example.com.json        # Example flow definition
│   └── schedules.json              # Scheduled tests
├── scripts/                        # Standalone test scripts
├── screenshots/                    # Test screenshots (auto-generated)
├── reports/                        # Test reports (auto-generated)
└── src/
    ├── server.js                   # Express server (port 3001)
    ├── agent/                      # Core agent modules
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
    ├── routes/                     # Express route handlers
    └── public/                     # Web UI
        ├── index.html              # Main dashboard
        ├── about.html              # Powers & limitations
        ├── guide.html              # User guide
        ├── app.js                  # Frontend JS
        ├── styles.css              # Styling
        └── logo.svg                # Logo
```

## Security

- **Local only** - Khai runs on localhost, never exposed to the internet
- **Credentials protected** - Stored locally in gitignored file, never logged
- **Confirmation required** - All purchases need your explicit approval
- **Audit trail** - All actions logged

## Legal

Only test websites you own or have explicit permission to test.
