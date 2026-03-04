---
phase: 08-animation-and-transition-screenshot-testing
plan: 02
type: execution-summary
subsystem: homebay/animation-testing
tags: [animation, screenshots, testing, api-integration]
completed: 2026-03-04T14:52:30Z
duration_min: 1

dependencies:
  requires:
    - 08-01: "Animation capture primitives (captureSkeletonTransition, getHomeBayAnimations)"
    - 01-02: "BrowserPool with withSlot pattern"
    - 05-02: "Inline login pattern to avoid nested pool acquisition"
  provides:
    - "POST /api/homebay/animation/:role endpoint"
    - "testHomeBayAnimations orchestration function"
    - "Per-role animation test configuration"
  affects:
    - "config/homebay-animations.json": "New animation config"
    - "src/routes/homebay.js": "New API route"

tech_stack:
  added:
    - "config/homebay-animations.json": "Per-role animation test definitions"
  patterns:
    - "Inline authentication to avoid nested pool.withSlot calls"
    - "Structured results with screenshot paths and animation metadata"
    - "Per-role configuration pattern (matches homebay-perf.json structure)"

key_files:
  created:
    - path: "src/homebay/animationTest.js"
      lines: 290
      exports: ["testHomeBayAnimations"]
    - path: "config/homebay-animations.json"
      lines: 45
      purpose: "Per-role page definitions for animation testing"
  modified:
    - path: "src/routes/homebay.js"
      changes: "Added POST /api/homebay/animation/:role route"

decisions:
  - title: "Inline login pattern"
    rationale: "Avoid nested pool acquisition (same as performance.js)"
    alternatives: "Pass page to shared login function"
    chosen: "Inline - simpler and proven pattern"
  - title: "Capture skeleton during first navigation"
    rationale: "Login flow naturally triggers skeleton transition"
    alternatives: "Separate navigation just for skeleton capture"
    chosen: "Integrated capture - more realistic timing"
  - title: "Role-specific screenshot directories"
    rationale: "Organize by role and timestamp for multi-test comparison"
    alternatives: "Flat directory with role in filename"
    chosen: "Hierarchical - better organization"

metrics:
  files_created: 2
  files_modified: 1
  commits: 2
  tests_added: 0
  api_endpoints: 1
---

# Phase 08 Plan 02: Animation Testing API Integration Summary

**One-liner:** Wired animation capture into HomeBay testing API with per-role configuration and skeleton transition orchestration.

## What Was Built

### Core Functionality

1. **testHomeBayAnimations(role, options)** - Main orchestration function
   - Uses pool.withSlot for browser management
   - Inlines login logic (no nested pool calls)
   - Captures skeleton transition during login (3 states)
   - Navigates to configured pages and detects animations
   - Returns structured results with screenshot paths

2. **POST /api/homebay/animation/:role** - API endpoint
   - Validates role parameter
   - Calls testHomeBayAnimations
   - Returns structured results with ok/fail envelope
   - Logs screenshot count to console

3. **config/homebay-animations.json** - Per-role configuration
   - Defines pages for all 4 roles (buyer, agent, seller, admin)
   - Specifies output directory and login capture flag
   - Follows same pattern as homebay-perf.json

### Architecture Decisions

**Inline Login Pattern (from Phase 05)**
```javascript
// Copy login logic from auth.js into _performLogin helper
// Avoids nested pool acquisition:
// pool.withSlot -> testHomeBayAnimations -> loginHomeBay -> pool.withSlot ❌
// pool.withSlot -> testHomeBayAnimations -> _performLogin ✓
```

**Skeleton Capture Timing**
- Navigate to /login first
- Capture skeleton transition (3 states)
- Navigate again and complete login
- This provides realistic timing for skeleton animations

**Screenshot Organization**
```
screenshots/animations/
  buyer-2026-03-04T145000Z/
    login/
      skeleton-visible.png
      skeleton-fading.png
      content-hydrated.png
    pages/
      auction-listings-0.png
      buyer-dashboard-1.png
```

## Implementation Details

### Task 1: Animation Test Orchestrator

**File:** `src/homebay/animationTest.js` (290 lines)

**Key Functions:**
- `loadAnimationConfig()` - Loads config/homebay-animations.json
- `_performLogin(page, role, config)` - Inlined auth logic
- `testHomeBayAnimations(role, options)` - Main entry point

**Flow:**
1. Load config and validate role
2. Acquire browser slot via pool.withSlot
3. Navigate to /login
4. Capture skeleton transition (if enabled)
5. Authenticate as role
6. For each configured page:
   - Navigate and wait
   - Detect animations via getHomeBayAnimations
   - Take screenshot if animations found
7. Return structured results

**Error Handling:**
- Missing credentials: throw descriptive error
- Role not in config: throw validation error
- Page navigation errors: capture in results.pages[].error

### Task 2: Config and API Route

**config/homebay-animations.json** (45 lines)
- 4 role sections (buyer, agent, seller, admin)
- Per-role pages with path, name, captureOn
- Global outputRoot and captureLogin settings

**src/routes/homebay.js** (new route at line 228)
- POST /api/homebay/animation/:role
- Validates role against ALLOWED_ROLES
- Calls testHomeBayAnimations
- Calculates total screenshot count for logging
- Returns ok/fail envelope

## Deviations from Plan

None - plan executed exactly as written.

## Verification Results

✓ Config structure: All 4 roles present (buyer, agent, seller, admin)
✓ Module exports: testHomeBayAnimations is function
✓ API route: POST /api/homebay/animation/:role wired at line 228
✓ JSON syntax: config/homebay-animations.json valid
✓ JavaScript syntax: All files valid

## Integration Points

**Imports from Plan 08-01:**
- `captureSkeletonTransition(page, outputDir)` - Captures 3 skeleton states
- `getHomeBayAnimations(page)` - Detects active animations

**Imports from Phase 01:**
- `pool.withSlot` - Browser slot management
- `fillReactInput` - Form filling
- `navigateTo` - Page navigation
- `waitForHydration` - Skeleton detection

**Imports from Phase 05:**
- `_performLogin` pattern - Inline auth to avoid nested pool calls

## Testing Notes

**Manual Testing (requires credentials):**
```bash
# Start Khai server
npm start

# Test buyer role
curl -X POST http://localhost:3001/api/homebay/animation/buyer

# Expected output:
# {
#   "success": true,
#   "data": {
#     "role": "buyer",
#     "timestamp": "2026-03-04T14:52:30Z",
#     "login": {
#       "skeletonStates": ["skeleton-visible", "skeleton-fading", "content-hydrated"],
#       "screenshots": [...]
#     },
#     "pages": [
#       { "name": "Auction listings", "url": "...", "animations": {...}, "screenshots": [...] }
#     ]
#   }
# }
```

**Without Credentials:**
API will return 500 with error: "HomeBay credentials not configured"

## Known Limitations

1. **Page paths are educated guesses**
   - Routes like /agent/auctions, /seller/dashboard are assumptions
   - Will update in Phase 2 after actual route discovery

2. **captureOn: "load" only**
   - Future: support "interaction" trigger for bid buttons
   - Current implementation only captures on page load

3. **No animation replay**
   - Screenshots are static captures
   - Phase 9 (Saved Test Suites) will add replay capability

## Files Changed

### Created
1. `src/homebay/animationTest.js` - 290 lines
2. `config/homebay-animations.json` - 45 lines

### Modified
1. `src/routes/homebay.js` - Added 1 route (~30 lines)

## Commits

1. `8b503cc` - feat(08-02): implement HomeBay animation test orchestrator
2. `630f8f2` - feat(08-02): add animation config and API route

## Next Steps

**Phase 08 Complete** - Both plans (08-01, 08-02) finished.

**Next Phase (09-saved-test-suites-with-replay):**
- Save animation test results as reusable suites
- Replay previous captures for regression detection
- Compare animation timing across test runs

**Phase 2 Integration (when Phase 2 starts):**
- Update page paths in config/homebay-animations.json with real routes
- Add interaction-triggered animation captures (bid buttons, form submissions)
- Test countdown timer animations on active auction pages

## Self-Check: PASSED

✓ Created files exist:
  - src/homebay/animationTest.js (290 lines)
  - config/homebay-animations.json (45 lines)

✓ Modified files exist:
  - src/routes/homebay.js (route added at line 228)

✓ Commits exist:
  - 8b503cc: feat(08-02): implement HomeBay animation test orchestrator
  - 630f8f2: feat(08-02): add animation config and API route

✓ Module exports verified:
  - testHomeBayAnimations is function

✓ Config structure verified:
  - All 4 roles present (buyer, agent, seller, admin)

✓ Syntax validation passed:
  - JavaScript files: valid
  - JSON files: valid
