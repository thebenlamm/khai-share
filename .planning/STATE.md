---
gsd_state_version: 1.0
milestone: v1.3
milestone_name: Auto-Assertions
status: executing
stopped_at: Completed 21-02-PLAN.md (regression detection wiring)
last_updated: "2026-03-10T22:36:37.672Z"
last_activity: "2026-03-10 — 20-01 complete: crawler title capture + BaselineManager CRUD"
progress:
  total_phases: 3
  completed_phases: 2
  total_plans: 4
  completed_plans: 4
  percent: 8
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-03-10)

**Core value:** MCP server giving Claude Code browser automation superpowers -- authenticated testing, screenshots, audits, link checking
**Current focus:** v1.3 Auto-Assertions (Phase 20: Baseline Engine)

## Current Position

Phase: 20 — Baseline Engine (in progress)
Plan: 01 complete (of ~3 in phase)
Status: In progress
Last activity: 2026-03-10 — 20-01 complete: crawler title capture + BaselineManager CRUD

Progress: [█░░░░░░░░░] 8%

## Performance Metrics

**Velocity (across v1.0 + v1.1 + v1.2):**
- Total plans completed: 29
- v1.0: 18 plans across 9 phases
- v1.1: 4 plans across 4 phases
- v1.2: 7 plans across 3 phases

## Accumulated Context

### Decisions

- One active baseline per site+account enforced at createBaseline() — must update or delete to replace
- Default thresholds spread-merged: `{ ...DEFAULT_THRESHOLDS, ...custom }` — any field overridable
- listBaselines() omits snapshot.pages (returns pageCount only) for compact list responses
- safePath + safeId used on testId to prevent path traversal in report reads
- [Phase 20-02]: Error mapping via string matching on message text (consistent with existing route patterns)
- [Phase 21-regression-detection]: Timing regressions use threshold as ceiling (currentLoadTime > threshold), not direct comparison to snapshot loadTime
- [Phase 21-regression-detection]: Title changes skipped when either title is null — null means title not captured, not a real regression
- [Phase 21-regression-detection]: URL matching is exact string equality — no normalization, consistent with crawler recording
- [Phase 21-regression-detection]: Regression detection placed before completedTests.set and writeFileSync so all downstream consumers receive regressions in a single assignment

### v1.3 Key Constraints

- One active baseline per site+account combo (no multiple baselines)
- Thresholds set at baseline creation, stored with baseline JSON
- Crawl tests capture page titles (DONE in 20-01)
- Regressions in crawl results AND webhook payloads
- MCP tools follow 3-tool pattern; REST envelope: {success, data}
- Baseline persistence in config/ directory (follows existing watches.json pattern)

### Pending Todos

None.

### Roadmap Evolution

- v1.0 shipped 2026-03-04 (9 phases, 18 plans)
- v1.1 shipped 2026-03-05 (4 phases, 4 plans -- beta feedback)
- v1.2 shipped 2026-03-10 (3 phases, 7 plans -- integration & monitoring)
- v1.3 started 2026-03-10 (3 phases, auto-assertions)

### Blockers/Concerns

None.

## Session Continuity

Last session: 2026-03-10T22:36:37.670Z
Stopped at: Completed 21-02-PLAN.md (regression detection wiring)
Resume file: None
