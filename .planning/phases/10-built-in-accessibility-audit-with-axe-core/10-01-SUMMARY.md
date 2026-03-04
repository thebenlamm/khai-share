---
phase: 10-built-in-accessibility-audit-with-axe-core
plan: 01
subsystem: agent
tags: [accessibility, wcag, axe-core, audit]
requirements: [A11Y-01, A11Y-07]
dependency_graph:
  requires: []
  provides: [AccessibilityAgent, axe-core-integration]
  affects: []
tech_stack:
  added: ["@axe-core/puppeteer"]
  patterns: [agent-class, wcag-audit, severity-grouping]
key_files:
  created:
    - src/agent/accessibility.js
  modified:
    - package.json
    - package-lock.json
decisions:
  - summary: "Use @axe-core/puppeteer instead of raw axe-core for Puppeteer integration"
    rationale: "Provides native Puppeteer bindings and handles script injection automatically"
  - summary: "Enable CSP bypass before navigation in auditPage method"
    rationale: "Required for HomeBay and other sites with strict Content Security Policy headers that would block axe-core script injection"
  - summary: "Group violations by severity (critical, serious, moderate, minor)"
    rationale: "Enables priority-based remediation - fix critical violations first"
  - summary: "Use networkidle2 wait strategy for page loading"
    rationale: "Ensures page fully loaded before audit, matches pattern from LighthouseAgent"
metrics:
  duration_minutes: 2
  tasks_completed: 2
  files_created: 1
  files_modified: 2
  commits: 2
  completed_date: "2026-03-04"
---

# Phase 10 Plan 01: AccessibilityAgent with axe-core Integration Summary

**One-liner:** Generic AccessibilityAgent class that runs WCAG 2.0/2.1/2.2 audits on any page with axe-core, CSP bypass, and severity-grouped violations.

## What Was Built

Created reusable **AccessibilityAgent** class in `src/agent/accessibility.js` that:
- Runs axe-core accessibility audits on any Puppeteer page
- Applies WCAG 2.0/2.1/2.2 rules via configurable tag filtering (default: wcag2a, wcag2aa)
- Bypasses Content Security Policy headers to enable script injection (critical for HomeBay)
- Excludes third-party elements (Stripe iframes, chat widgets) from audits
- Returns structured results with violations grouped by severity (critical, serious, moderate, minor)
- Tracks incomplete issues requiring manual review
- Follows established Khai agent patterns (mirrors LighthouseAgent architecture)

## Implementation Details

### 1. Package Installation
- Installed `@axe-core/puppeteer` package (provides native Puppeteer bindings for axe-core)
- Added to dependencies in package.json

### 2. AccessibilityAgent Class Structure
- **Constructor**: Accepts `config` object with:
  - `pages`: Array of URLs to audit (optional)
  - `tags`: WCAG rule tags (default: `['wcag2a', 'wcag2aa']`)
  - `excludeSelectors`: CSS selectors to exclude (default: `[]`)
- **auditPage(page, url, name)**: Main audit method
- **_groupBySeverity(violations)**: Private helper for violation categorization

### 3. auditPage Method Flow
1. **CSP Bypass** (CRITICAL): `await page.setBypassCSP(true)`
   - Required for sites with strict CSP headers like HomeBay
   - Allows axe-core to inject its analysis scripts
2. **Navigation**: `await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 })`
   - Ensures page fully loaded before audit
3. **Build Audit**:
   ```javascript
   let builder = new AxePuppeteer(page).withTags(this.tags);
   if (this.excludeSelectors.length > 0) {
     builder = builder.exclude(this.excludeSelectors);
   }
   ```
4. **Run Analysis**: `const results = await builder.analyze()`
5. **Process Results**:
   - Group violations by severity (critical, serious, moderate, minor)
   - Count passes and inapplicable rules
   - Store in `this.results` array
   - Return structured object

### 4. Result Structure
```javascript
{
  url: "https://example.com",
  name: "Homepage",
  violations: [...],  // Full axe-core violation objects
  violationsBySeverity: {
    critical: [...],
    serious: [...],
    moderate: [...],
    minor: [...]
  },
  incomplete: [...],  // Issues requiring manual review
  passes: 42,        // Count of passed rules
  inapplicable: 8,   // Count of inapplicable rules
  timestamp: "2026-03-04T15:30:00Z"
}
```

## Verification Results

### Automated Checks (All Passed)
- ✓ CSP bypass present in auditPage method
- ✓ AxePuppeteer integration wired with withTags and exclude
- ✓ Tag filtering implemented
- ✓ Severity grouping implemented
- ✓ Syntax validation passes (`node -c`)
- ✓ @axe-core/puppeteer in package.json dependencies
- ✓ AccessibilityAgent class exports correctly

## Integration Points

**Ready for Plan 02 (HomeBay Integration):**
- AccessibilityAgent can be instantiated with HomeBay-specific configuration:
  ```javascript
  const agent = new AccessibilityAgent({
    tags: ['wcag2a', 'wcag2aa'],
    excludeSelectors: ['#stripe-iframe', '.intercom-widget']
  });
  ```
- CSP bypass already implemented (critical for HomeBay's strict headers)
- Follows same pattern as LighthouseAgent (generic agent → HomeBay routes)
- Can be called from HomeBay API routes with BrowserPool-managed pages

**Pattern Match with Existing Agents:**
- Mirrors LighthouseAgent structure (constructor + auditPage method)
- Uses same error handling pattern (console.error + rethrow)
- Stores results in `this.results` array for batch processing

## Key Decisions

### Why @axe-core/puppeteer instead of raw axe-core?
- Provides native Puppeteer bindings
- Handles script injection automatically
- Simpler API than manual script injection with `page.evaluate()`

### Why CSP bypass?
- HomeBay and many production sites use strict Content Security Policy headers
- These headers would block axe-core's injected analysis scripts
- `page.setBypassCSP(true)` disables CSP enforcement only for the test browser
- Critical constraint documented in research and JSDoc

### Why group violations by severity?
- Enables priority-based remediation (fix critical issues first)
- Standard accessibility workflow: critical → serious → moderate → minor
- Matches industry best practices for WCAG compliance projects

### Why networkidle2?
- Ensures page fully loaded before running audit
- Consistent with LighthouseAgent wait strategy
- Prevents false positives from dynamically-loaded content

## Deviations from Plan

None - plan executed exactly as written.

## Files Changed

### Created
- `src/agent/accessibility.js` (109 lines)
  - AccessibilityAgent class with full axe-core integration
  - CSP bypass, tag filtering, exclusion support
  - Severity grouping and result structuring

### Modified
- `package.json` - Added @axe-core/puppeteer dependency
- `package-lock.json` - Locked @axe-core/puppeteer and transitive dependencies

## Commits

| Task | Commit | Message |
|------|--------|---------|
| 1 | a758a2a | feat(10-01): add AccessibilityAgent skeleton with axe-core dependency |
| 2 | 817f621 | feat(10-01): implement auditPage method with axe-core integration |

## Next Steps

**Plan 02 (HomeBay Accessibility Routes):**
- Create `/api/homebay/accessibility` endpoint
- Integrate AccessibilityAgent with BrowserPool
- Add role-specific accessibility testing (admin, agent, seller, buyer)
- Configure HomeBay-specific exclusions (Stripe, analytics, chat widgets)
- Store results for HTML reporting

**Future Enhancements (Out of Scope):**
- Custom axe-core rule definitions
- Automated screenshot capture of violations
- Integration with CI/CD pipelines
- Historical trend tracking

## Self-Check: PASSED

**Created files exist:**
- ✓ FOUND: src/agent/accessibility.js

**Commits exist:**
- ✓ FOUND: a758a2a
- ✓ FOUND: 817f621

**Package dependency:**
- ✓ FOUND: @axe-core/puppeteer in package.json
