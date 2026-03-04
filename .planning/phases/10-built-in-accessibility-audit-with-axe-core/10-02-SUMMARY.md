---
phase: 10-built-in-accessibility-audit-with-axe-core
plan: 02
subsystem: homebay-accessibility-integration
tags: [homebay, accessibility, axe-core, wcag, automation, browser-pool]
completed: 2026-03-04T15:37:03Z

dependency_graph:
  requires: [10-01-accessibility-agent, homebay-pool, homebay-auth-patterns]
  provides: [homebay-a11y-api, per-role-audit, wcag-violations-by-severity]
  affects: [homebay-qa-suite, phase-11-orchestration]

tech_stack:
  added: []
  patterns: [inline-auth-to-avoid-pool-deadlock, csp-bypass-before-navigation, per-page-exclusions]

key_files:
  created:
    - path: src/homebay/accessibility.js
      purpose: HomeBay accessibility audit with inline authentication
      exports: [auditHomeBayRole]
      lines: 148
    - path: config/homebay-a11y.json
      purpose: Per-role critical pages with exclusion selectors
      contains: [buyer, agent, seller, admin]
      lines: 52
  modified:
    - path: src/routes/homebay.js
      changes: Added POST /api/homebay/a11y/:role endpoint
      lines_added: 32

decisions:
  - decision: Inline authentication in accessibility module to avoid nested pool.withSlot() deadlock
    rationale: Established pattern from Phase 5 performance audit - importing loginHomeBay would create nested pool acquisition
    alternatives: Extract shared auth helper - rejected due to pool ownership complexity
  - decision: Alias imports (auditHomeBayPerformance, auditHomeBayAccessibility) to avoid naming collision
    rationale: Both modules export auditHomeBayRole function - aliasing at import clarifies intent
  - decision: CSP bypass before navigation (setBypassCSP(true))
    rationale: HomeBay has strict CSP headers that block axe-core script injection
  - decision: Global + per-page exclusion merging
    rationale: Allows site-wide third-party widget exclusions (Stripe, Intercom) plus page-specific dynamic element exclusions (countdown timers, live counts)

metrics:
  duration_minutes: 2
  tasks_completed: 2
  files_created: 2
  files_modified: 1
  commits: 2
  lines_added: 246
---

# Phase 10 Plan 02: HomeBay Accessibility Integration Summary

**One-liner:** Integrated axe-core accessibility auditing with HomeBay authentication infrastructure for per-role WCAG compliance testing of critical pages

## What Was Built

Completed integration of the AccessibilityAgent (from Plan 10-01) with HomeBay's BrowserPool and authentication system, enabling on-demand WCAG 2.0 Level A/AA compliance testing for all 4 user roles (admin, agent, seller, buyer).

### Key Components

1. **src/homebay/accessibility.js** (148 lines)
   - `auditHomeBayRole(role)` main export - audits all configured critical pages for a role
   - `_performLogin(page, role, config)` private helper - inline authentication to avoid nested pool acquisition
   - `loadA11yConfig()` - reads config/homebay-a11y.json
   - CSP bypass enabled before navigation (required for HomeBay's strict CSP headers)
   - Global + per-page exclusion selector merging
   - Summary counts per page (critical/serious/moderate/minor/needsReview)

2. **config/homebay-a11y.json** (52 lines)
   - Per-role critical page definitions
   - Buyer: /auctions, /dashboard (2 pages)
   - Agent: /agent/dashboard, /agent/listings/new (2 pages)
   - Seller: /seller/dashboard (1 page)
   - Admin: /admin/dashboard (1 page)
   - Global exclusions: #stripe-iframe, .intercom-widget
   - Page-specific exclusions for dynamic content (countdown timers, live bidder counts)

3. **src/routes/homebay.js** (+32 lines)
   - POST /api/homebay/a11y/:role endpoint
   - Role validation against ALLOWED_ROLES
   - ok/fail response envelope (consistent with all Khai APIs)
   - Console logging for audit start/completion/failure

## Implementation Details

### Inline Authentication Pattern

Following the established pattern from Phase 5 (performance audit), authentication is inlined within the accessibility module rather than imported from `auth.js`. This avoids the nested pool acquisition deadlock:

```javascript
// PATTERN: Inline auth to avoid nested pool.withSlot()
return await pool.withSlot(async (slot) => {
  const { page } = slot;
  await page.setBypassCSP(true);  // CRITICAL for HomeBay
  await _performLogin(page, role, config);  // Inline, not imported
  // ... audit logic
});
```

### CSP Bypass Requirement

HomeBay's strict Content Security Policy headers block axe-core's script injection. The `setBypassCSP(true)` call before any navigation is **critical** and must remain in place.

### Global + Per-Page Exclusions

The exclusion selector system supports both:
- **Global exclusions** (apply to all pages for a role): third-party widgets like Stripe iframes, Intercom chat
- **Per-page exclusions** (page-specific): dynamic content like countdown timers, live bidder counts that would generate false positives

Example from config:
```json
{
  "globalExclude": ["#stripe-iframe", ".intercom-widget"],
  "criticalPages": [
    {
      "id": "buyer-dashboard",
      "path": "/dashboard",
      "excludeSelectors": [".countdown-timer", ".live-bidder-count"]
    }
  ]
}
```

### API Response Structure

```json
{
  "success": true,
  "data": {
    "role": "buyer",
    "results": [
      {
        "id": "auctions-list",
        "name": "Browse Auctions",
        "path": "/auctions",
        "violations": [
          {
            "id": "color-contrast",
            "impact": "serious",
            "description": "Ensures text has sufficient color contrast",
            "help": "Elements must have sufficient color contrast",
            "helpUrl": "https://dequeuniversity.com/rules/axe/4.5/color-contrast",
            "nodes": [
              {
                "html": "<button class=\"submit\">Submit</button>",
                "target": [".submit"],
                "failureSummary": "Fix: Increase contrast ratio to 4.5:1"
              }
            ]
          }
        ],
        "violationsBySeverity": {
          "critical": [],
          "serious": [{ /* ... */ }],
          "moderate": [],
          "minor": []
        },
        "incomplete": [],
        "passes": 42,
        "inapplicable": 15,
        "summary": {
          "critical": 0,
          "serious": 1,
          "moderate": 0,
          "minor": 0,
          "needsReview": 0
        }
      }
    ]
  }
}
```

## Verification Results

All automated checks passed:

```
✓ accessibility.js syntax validation
✓ homebay.js syntax validation
✓ auditHomeBayRole exports correctly
✓ POST /api/homebay/a11y/:role route exists
✓ Config contains 4 roles
✓ BrowserPool integration present
✓ CSP bypass present
```

### Integration Verification (requires HomeBay credentials)

```bash
# Start Khai server
npm start

# Test buyer role audit
curl -X POST http://localhost:3001/api/homebay/a11y/buyer

# Expected: 200 response with violations, incomplete, passes counts
# Expected structure: { success: true, data: { role: "buyer", results: [...] } }
```

## Known Limitations

1. **Page paths are estimates** - The paths in `config/homebay-a11y.json` (/auctions, /dashboard, /agent/dashboard, etc.) are based on typical HomeBay structure patterns. They may need adjustment after testing against the actual staging environment.

2. **Exclusion selectors need validation** - The dynamic content selectors (.countdown-timer, .live-bidder-count, .auction-countdown) are guesses based on common real estate auction platform patterns. These should be verified and updated after Phase 2 when actual page structures are available.

3. **No baseline comparison** - This implementation captures current violations but doesn't compare against a baseline to detect regressions. Baseline tracking could be added in a future phase.

4. **Single-page audits only** - Each configured page is audited independently. Multi-page flows (e.g., auction browsing → auction detail → bid placement) are not yet supported.

## Deviations from Plan

None - plan executed exactly as written. All tasks completed successfully with no auto-fixes, no blocking issues, and no architectural changes required.

## Integration Points

### Ready for Phase 11 Orchestration

This accessibility audit capability is now ready to be integrated into the Phase 11 suite orchestration system. The standardized API endpoint pattern (`POST /api/homebay/a11y/:role`) matches the established convention from:
- Performance audits: `POST /api/homebay/perf/:role`
- Visual regression: `POST /api/homebay/visual/:role`
- Animation testing: `POST /api/homebay/animation/:role`
- Dry-run validation: `POST /api/homebay/dryrun/:form`

### Depends On

- **Plan 10-01**: AccessibilityAgent with axe-core integration (provides `auditPage` method)
- **Phase 1**: HomeBay BrowserPool (provides `pool.withSlot()` slot management)
- **Phase 1**: HomeBay authentication patterns (fillReactInput, navigateTo, waitForHydration)

### Enables

- **Phase 11**: Suite orchestration can now include accessibility audits in comprehensive test runs
- **Compliance reporting**: WCAG 2.0 Level A/AA violation tracking for all user roles
- **Regression detection**: Can be run on each deployment to catch new violations

## Self-Check: PASSED

### Created Files Verification
```bash
[ -f "src/homebay/accessibility.js" ] && echo "FOUND: src/homebay/accessibility.js" || echo "MISSING: src/homebay/accessibility.js"
[ -f "config/homebay-a11y.json" ] && echo "FOUND: config/homebay-a11y.json" || echo "MISSING: config/homebay-a11y.json"
```
Result:
```
FOUND: src/homebay/accessibility.js
FOUND: config/homebay-a11y.json
```

### Commits Verification
```bash
git log --oneline --all | grep -q "c988a2a" && echo "FOUND: c988a2a (Task 1)" || echo "MISSING: c988a2a"
git log --oneline --all | grep -q "4a10397" && echo "FOUND: 4a10397 (Task 2)" || echo "MISSING: 4a10397"
```
Result:
```
FOUND: c988a2a (Task 1)
FOUND: 4a10397 (Task 2)
```

All files and commits verified successfully.

## Next Steps

1. **Test against staging** - Run `POST /api/homebay/a11y/buyer` against HomeBay staging to validate page paths and exclusion selectors
2. **Update config if needed** - Adjust paths in `config/homebay-a11y.json` based on actual staging environment structure
3. **Add more critical pages** - Expand the critical page lists based on actual user flows (e.g., auction detail, bid placement, payment)
4. **Establish baselines** - After initial audit, capture baseline violation counts to enable regression detection
5. **Phase 11 integration** - Wire this endpoint into the suite orchestration system for automated compliance testing

## Commits

- `c988a2a`: feat(10-02): add HomeBay accessibility audit with inline authentication
- `4a10397`: feat(10-02): wire accessibility audit API route
