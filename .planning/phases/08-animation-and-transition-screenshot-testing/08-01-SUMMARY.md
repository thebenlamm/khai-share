---
phase: 08-animation-and-transition-screenshot-testing
plan: 01
subsystem: agent
tags: [animation-capture, web-animations-api, screenshot-testing, homebay-specific]

dependency_graph:
  requires:
    - src/homebay/navigate.js (waitForHydration pattern)
    - src/agent/visualRegression.js (will consume animation captures)
    - src/homebay/pool.js (browser resource management pattern)
  provides:
    - Animation detection and control via Web Animations API
    - Animation state capture at specific progress points
    - HomeBay skeleton transition capture (3 states)
  affects:
    - Future visual regression tests (stable screenshots)
    - HomeBay-specific test flows (skeleton loader testing)

tech_stack:
  added:
    - Web Animations API (browser-native, no new dependencies)
  patterns:
    - Animation detection via document.getAnimations({ subtree: true })
    - Promise-based animation waiting with timeout fallback
    - Programmatic animation seeking via currentTime manipulation
    - CSS injection for global animation pausing

key_files:
  created:
    - src/agent/animationCapture.js (311 lines, 4 exports)
    - src/homebay/animations.js (189 lines, 2 exports)
  modified: []

decisions:
  - title: Use Web Animations API over CSS-only detection
    rationale: Unified interface for animations and transitions, access to animation.finished Promise, ability to pause and seek
    alternatives_considered: CSS animation-name detection via getComputedStyle (brittle, no transition support)
  - title: Shadow DOM support via document.getAnimations({ subtree: true })
    rationale: Future-proof for Web Components, covers all animations including those in shadow roots
    alternatives_considered: querySelector-only detection (misses shadow DOM elements)
  - title: Timeout on animation.finished Promise
    rationale: Cancelled animations never resolve finished Promise (Pitfall 2 from research)
    implementation: Promise.race with timeout fallback
  - title: Separate generic agent and HomeBay-specific modules
    rationale: Reusable animation capture for all Khai tests, HomeBay helpers for common patterns
    structure: agent/animationCapture.js (generic) → homebay/animations.js (specific)

metrics:
  duration_minutes: 2
  tasks_completed: 2
  files_created: 2
  lines_added: 500
  commits: 2
  completed_date: 2026-03-04
---

# Phase 08 Plan 01: Animation-Aware Screenshot Capture

**One-liner:** Web Animations API-based screenshot capture with HomeBay skeleton transition detection (3-state capture: visible/fading/hydrated)

## What Was Built

Created animation-aware screenshot capabilities using browser-native Web Animations API to solve non-deterministic screenshot problems during UI transitions.

### Core Functionality

**Generic Animation Capture Agent** (`src/agent/animationCapture.js`):
- `waitForAnimations()` - Wait for running animations to complete before screenshot (solves timing-dependent non-determinism)
- `captureAnimationStates()` - Programmatically seek animations to specific progress points (0-100%) and capture
- `pauseAllAnimations()` - Freeze all animations/transitions for stable hover/tooltip screenshots
- `getAnimationInfo()` - Inspect animation metadata for debugging timing issues

**HomeBay-Specific Helpers** (`src/homebay/animations.js`):
- `captureSkeletonTransition()` - Capture HomeBay skeleton loader in 3 states (visible → fading → hydrated)
- `getHomeBayAnimations()` - Check for active animations on skeleton, countdown, modal elements

### Technical Implementation

**Web Animations API Integration:**
- Uses `document.getAnimations({ subtree: true })` to detect all animations including Shadow DOM
- Filters to running animations via `playState === 'running'`
- Waits for completion using `animation.finished` Promise with timeout fallback
- Seeks animations programmatically via `animation.currentTime` manipulation

**Error Handling:**
- Try-catch wrapper for browsers without Web Animations API support
- Timeout on `animation.finished` to handle cancelled animations (never resolve)
- Graceful degradation when no animations detected (returns empty array)
- Element existence checks before animation queries

**Pattern Consistency:**
- Follows existing Khai module patterns (no classes, exports object with named functions)
- Console logs with `[AnimationCapture]` and `[HomeBayAnimations]` prefixes
- Accepts Puppeteer `page` parameter (matches homebay/navigate.js pattern)
- JSDoc documentation with `@param`, `@returns`, and `@example` blocks

## Deviations from Plan

None - plan executed exactly as written.

## Testing & Verification

**Module Exports:**
```bash
✓ animationCapture exports: waitForAnimations, captureAnimationStates, pauseAllAnimations, getAnimationInfo
✓ animations exports: captureSkeletonTransition, getHomeBayAnimations
```

**Web Animations API Usage:**
```bash
✓ document.getAnimations({ subtree: true }) - 4 occurrences
✓ animation.finished Promise - implemented with timeout fallback
✓ Syntax validation passed for both modules
```

**Pattern Verification:**
- ✓ No new npm dependencies (Web Animations API is browser-native)
- ✓ Follows agent/*.js module pattern (animationCapture.js)
- ✓ Follows homebay/*.js pattern (animations.js accepts page param, no pool management)
- ✓ Console logs use module-specific prefixes

## Integration Points

**Upstream Dependencies:**
- `src/homebay/navigate.js` - Extended `waitForHydration` pattern to capture states (not just wait)
- `src/homebay/pool.js` - Follows `withSlot()` resource management pattern (will use in Plan 02)

**Downstream Consumers (Future):**
- `src/agent/visualRegression.js` - Will consume animation-stabilized screenshots for pixel comparison
- HomeBay test flows - Will use skeleton transition capture for auth flow screenshots
- Future visual regression tests - Stable screenshots during animations

## Future Enhancements (Out of Scope)

- Video capture of full animation sequences (requires ffmpeg integration)
- Animation performance metrics (FPS, dropped frames)
- Animation A/B testing (compare animation timings across versions)
- Automated animation regression detection (compare animation curves)

## Commits

| Hash | Message |
|------|---------|
| 8e24197 | feat(08-01): add HomeBay animation helpers |
| dda1023 | feat(08-01): add animation capture agent with Web Animations API |

## Self-Check: PASSED

**Created Files:**
```bash
✓ FOUND: src/agent/animationCapture.js (311 lines)
✓ FOUND: src/homebay/animations.js (189 lines)
```

**Commits:**
```bash
✓ FOUND: 8e24197 (feat(08-01): add HomeBay animation helpers)
✓ FOUND: dda1023 (feat(08-01): add animation capture agent with Web Animations API)
```

**Exports:**
```bash
✓ animationCapture: 4 functions (waitForAnimations, captureAnimationStates, pauseAllAnimations, getAnimationInfo)
✓ animations: 2 functions (captureSkeletonTransition, getHomeBayAnimations)
```

All claims verified. Plan complete.
