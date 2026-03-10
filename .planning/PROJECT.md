# Khai -- Browser Automation MCP Server

## What This Is

An MCP server that gives Claude Code browser automation superpowers. Khai handles authenticated website testing, security auditing, screenshot capture, link checking, and more -- all controlled through MCP tools or a REST API.

## Core Value

Give Claude Code the ability to log into websites, take screenshots, run security audits, and test flows that require real browser interaction and stored credentials.

## Requirements

### Validated

- Authenticated website crawling with Puppeteer
- Screenshot capture of every page visited
- Multi-step flow testing via JSON flow definitions
- Security auditing (headers, auth bypass, exposed files)
- Visual regression via pixelmatch
- API & form fuzzing
- Link checking
- Async job pattern with status polling
- MCP server integration for Claude Code (Python, SSE + stdio)
- Configuration-driven credentials management
- Communication monitoring (email, SMS, fax)
- Purchase form detection and testing
- Login failure detection with immediate status surfacing (v1.1)
- Fingerprint-based issue deduplication with severity tiers (v1.1)
- Login redirect detection for session expiry (v1.1)
- Benign request pattern filtering (Sentry, analytics) (v1.1)
- Hash fragment URL deduplication in link inventory (v1.1)
- Consistent 3-tool MCP pattern (start/status/results) (v1.1)
- Lighthouse performance audits
- Accessibility audits with axe-core
- Saved test suites with replay and history
- Webhook callbacks with HMAC-SHA256 signing and retry on all async operations (v1.2)
- Authenticated page watches with cron-scheduled change detection (v1.2)
- HAR network trace recording and retrieval via CDP (v1.2)

### Active

- [ ] Auto-generated regression assertions from successful runs



### Out of Scope

- Production testing -- staging/preview only
- Load/stress testing -- this is functional QA, not performance benchmarking
- Document/file context for actions -- scope creep toward general-purpose agent territory
- Natural language action interpretation -- structured JSON is more reliable for repeatable test suites

## Context

Shipped v1.0 MVP (9 phases, 12,010 LOC). Shipped v1.1 Beta Feedback (4 phases, 698 lines). Shipped v1.2 Integration & Monitoring (3 phases, 4,698 lines) — webhooks, watches, and HAR export. Total codebase: 13,236 LOC JavaScript + Python MCP layer.

Tech stack: Node.js, Express, Puppeteer, MCP (Python FastMCP), axe-core, pixelmatch, Lighthouse, node-cron.

## Constraints

- **Local only**: Runs on localhost, never exposed to the internet
- **Concurrency**: Max 3 simultaneous Puppeteer instances (memory constraint)
- **Two-layer architecture**: Express server (JS) + MCP server (Python) -- both must be running

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Two-layer architecture (Express + MCP) | Express handles Puppeteer/browser; MCP provides Claude Code integration | Good |
| Terminal state guard in status endpoint | Prevents accessing closed crawler after login failure | Good |
| Post-processing dedup (not inline) | Preserves raw issues for page-level classification | Good |
| Fingerprint key: url+resourcePath+errCode | Accurate DNS/network dedup without false merges | Good |
| DOM-based login redirect detection | Catches silent session expiry during authenticated crawl | Good |
| Benign patterns on ERR_ABORTED only | Avoids accidentally silencing real request failures | Good |
| 3-tool pattern for all async domains | Consistent MCP API across crawl tests and actions | Good |
| Webhook fires on ALL terminal states | completed, error, login-failed all trigger webhook; 4xx permanent, 5xx retry | Good |
| pixelmatch v7 CJS import with .default fallback | CJS/ESM compatibility without breaking existing imports | Good |
| Visual change threshold >1% pixel diff | Reduces false positives from animations/timestamps | Good |
| CDP-based HAR recorder | page.target().createCDPSession() — standard Puppeteer, no extra deps | Good |
| Response bodies capped at 1MB | Prevents memory exhaustion on large binary responses during HAR capture | Good |
| HAR endpoint returns raw JSON | Not wrapped in {success,data} envelope; MCP tool checks success:false directly | Good |

---
*Last updated: 2026-03-10 after v1.2 milestone*
