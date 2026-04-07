# Requirements: Khai -- Internal Quality

**Defined:** 2026-04-06
**Core Value:** Reduce maintenance drag by eliminating duplicated logic, splitting god modules, and normalizing patterns

## v1.4 Requirements

Requirements for internal quality milestone. Each maps to roadmap phases.

### Quick Wins

- [x] **QW-01**: actions.js disk writes use safePath validation
- [x] **QW-02**: MCP server.py uses httpx params= instead of f-string URLs
- [x] **QW-03**: All routes store err.message (not err.stack) in job error field
- [x] **QW-04**: Suites route supports webhookUrl on run start
- [x] **QW-05**: JobStore variable names follow consistent convention across routes

### Login Extraction

- [x] **LOGIN-01**: Shared login utility in src/utils/login.js handles standard email/password flow
- [x] **LOGIN-02**: Shared login utility supports magic link auth path
- [x] **LOGIN-03**: Shared login utility supports loginTrigger (button click before form)
- [x] **LOGIN-04**: Shared login utility supports Twilio two-step login
- [x] **LOGIN-05**: Shared login utility supports skipLogin for public crawls
- [x] **LOGIN-06**: All 6 agents use shared login utility instead of inline implementation

### Async Job Helper

- [x] **ASYNC-01**: runAsyncJob helper in jobStore.js encapsulates create/run/complete/error/webhook lifecycle
- [x] **ASYNC-02**: All route handlers use runAsyncJob instead of inline IIFE pattern
- [x] **ASYNC-03**: Consistent endTime, error format, and webhook delivery across all operations

### Auditor Split

- [x] **AUDIT-01**: Audit check functions extracted to src/agent/audit-checks/ modules
- [ ] **AUDIT-02**: SiteAuditor becomes orchestrator that loads and runs check modules
- [x] **AUDIT-03**: Each check module is independently testable with shared context

### MCP Transform

- [ ] **MCP-01**: Centralized snake_case to camelCase transformer in client.py
- [ ] **MCP-02**: All MCP tool functions use build_payload helper instead of manual dict construction
- [ ] **MCP-03**: All query string parameters use httpx params= for proper URL encoding

## Future Requirements

None -- this is a cleanup milestone.

## Out of Scope

| Feature | Reason |
|---------|--------|
| Browser connection pooling | Would require architectural change to browser.js; agents work fine with individual browsers at current scale |
| Agent lifecycle interface standardization | Low leverage -- each agent's interface works, just inconsistent; align opportunistically during login extraction |
| Shared result schema across agents | Would require touching every agent and every consumer; too much churn for a refactoring milestone |
| Agent retry/circuit breaker patterns | Overengineering -- current try/catch is sufficient for a local-only tool |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| QW-01 | Phase 24 | Complete |
| QW-02 | Phase 24 | Complete |
| QW-03 | Phase 24 | Complete |
| QW-04 | Phase 24 | Complete |
| QW-05 | Phase 24 | Complete |
| LOGIN-01 | Phase 25 | Complete |
| LOGIN-02 | Phase 25 | Complete |
| LOGIN-03 | Phase 25 | Complete |
| LOGIN-04 | Phase 25 | Complete |
| LOGIN-05 | Phase 25 | Complete |
| LOGIN-06 | Phase 25 | Complete |
| ASYNC-01 | Phase 26 | Complete |
| ASYNC-02 | Phase 26 | Complete |
| ASYNC-03 | Phase 26 | Complete |
| AUDIT-01 | Phase 27 | Complete |
| AUDIT-02 | Phase 27 | Pending |
| AUDIT-03 | Phase 27 | Complete |
| MCP-01 | Phase 28 | Pending |
| MCP-02 | Phase 28 | Pending |
| MCP-03 | Phase 28 | Pending |

**Coverage:**
- v1.4 requirements: 20 total
- Mapped to phases: 20
- Unmapped: 0 -- all covered

---
*Requirements defined: 2026-04-06*
*Last updated: 2026-04-06 after roadmap creation*
