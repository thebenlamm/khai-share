# Phase 7: Dry-run form submission testing - Research

**Researched:** 2026-03-04
**Domain:** Form validation testing, request interception, client-side validation
**Confidence:** HIGH

## Summary

Dry-run form submission testing validates form behavior without actually submitting data to the server. This phase enables testing form validation logic, error messages, and submission workflows without side effects (no database writes, no emails sent, no actual transactions). The approach combines three techniques: (1) Puppeteer's request interception to block/mock server requests, (2) HTML5 Constraint Validation API to test client-side validation programmatically, and (3) page evaluation to inject preventDefault handlers and inspect form state.

HomeBay uses React controlled components with Next.js client-side navigation, requiring the same React-aware form filling patterns established in Phase 1 (fillReactInput with native setter + event dispatch). Dry-run testing is particularly valuable for HomeBay's registration, login, password reset, auction bid submission, and payment forms where real submission would create test data pollution or trigger external services.

**Primary recommendation:** Build a DryRunTester class that wraps the existing BrowserPool and reuses fillReactInput/navigateTo from src/homebay/navigate.js. Use page.setRequestInterception() to abort form POST/PUT requests, page.evaluate() with checkValidity()/reportValidity() to test HTML5 validation, and form state inspection to verify error messages appear correctly.

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| puppeteer | ^24.37.3 | Browser automation + request interception | Already in use, built-in setRequestInterception() |
| uuid | ^9.0.0 | Session/test ID generation | Already in use for flowTester |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| None required | - | - | Puppeteer provides all needed primitives |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Puppeteer's setRequestInterception | Mockiavelli library | Mockiavelli adds structured mock API but introduces dependency; built-in interception sufficient for aborting requests |
| Manual preventDefault injection | Jest + JSDOM | Jest testing requires separate test harness; Puppeteer tests real browser behavior with actual DOM |
| Native checkValidity() | Custom validation library | Custom libraries duplicate browser validation; HTML5 API is standard and works with HomeBay's forms |

**Installation:**
```bash
# No new dependencies required
# All needed libraries already in package.json
```

## Architecture Patterns

### Recommended Project Structure
```
src/
├── homebay/
│   ├── navigate.js          # Existing — reuse fillReactInput, navigateTo, waitForHydration
│   ├── auth.js              # Existing — reference for form patterns
│   ├── pool.js              # Existing — BrowserPool for concurrency
│   └── dryrun.js            # NEW — DryRunTester class
├── routes/
│   └── homebay.js           # Add POST /api/homebay/dryrun routes
└── agent/
    └── formFuzzer.js        # Reference — similar form discovery patterns
```

### Pattern 1: Request Interception for Dry-Run
**What:** Enable page.setRequestInterception(true), listen to 'request' event, abort POST/PUT/DELETE requests to prevent actual submission
**When to use:** All form submission tests where server-side effects must be avoided
**Example:**
```javascript
// Source: https://pptr.dev/guides/network-interception
await page.setRequestInterception(true);
page.on('request', interceptedRequest => {
  if (interceptedRequest.isInterceptResolutionHandled()) return;

  const method = interceptedRequest.method();
  const url = interceptedRequest.url();

  // Abort form submissions to prevent server-side effects
  if (method === 'POST' || method === 'PUT' || method === 'DELETE') {
    console.log(`[DryRun] Aborting ${method} to ${url}`);
    interceptedRequest.abort();
  } else {
    interceptedRequest.continue();
  }
});
```

### Pattern 2: HTML5 Validation API Testing
**What:** Use page.evaluate() to call checkValidity(), reportValidity(), and inspect ValidityState on form inputs
**When to use:** Testing client-side validation rules (required, pattern, email, minlength, etc.) without submission
**Example:**
```javascript
// Source: https://developer.mozilla.org/en-US/docs/Web/API/HTMLFormElement/reportValidity
const validationResult = await page.evaluate((selector) => {
  const form = document.querySelector(selector);
  if (!form) return { error: 'Form not found' };

  // Trigger validation and show browser error messages
  const isValid = form.reportValidity();

  // Collect validation state for each input
  const inputs = Array.from(form.querySelectorAll('input, select, textarea'));
  const inputStates = inputs.map(input => ({
    name: input.name || input.id,
    valid: input.validity.valid,
    validationMessage: input.validationMessage,
    validity: {
      valueMissing: input.validity.valueMissing,
      typeMismatch: input.validity.typeMismatch,
      patternMismatch: input.validity.patternMismatch,
      tooLong: input.validity.tooLong,
      tooShort: input.validity.tooShort,
      rangeOverflow: input.validity.rangeOverflow,
      rangeUnderflow: input.validity.rangeUnderflow
    }
  }));

  return { isValid, inputs: inputStates };
}, 'form#login-form');
```

### Pattern 3: React Form State Inspection
**What:** Use page.evaluate() to inspect React error messages, disabled states, and custom validation feedback (not captured by HTML5 API)
**When to use:** HomeBay forms that use React state for validation (e.g., "Passwords must match", "Email already exists")
**Example:**
```javascript
// HomeBay-specific: check for error message elements
const reactValidation = await page.evaluate(() => {
  const errors = Array.from(document.querySelectorAll('[class*="error"], [role="alert"], .text-red'));
  return errors.map(el => ({
    text: el.textContent.trim(),
    visible: el.offsetParent !== null  // Check if actually visible
  }));
});
```

### Pattern 4: Form Submission with preventDefault Injection
**What:** Inject a submit event listener that prevents default submission but still runs client-side validation
**When to use:** Testing forms that trigger validation on submit attempt (not on blur/input)
**Example:**
```javascript
// Inject handler BEFORE clicking submit
await page.evaluate((formSelector) => {
  const form = document.querySelector(formSelector);
  if (form) {
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      console.log('[DryRun] Form submit prevented');
      // Form validation still runs before this handler
    }, { once: true });
  }
}, 'form#register-form');

// Now click submit — validation runs, but form doesn't actually submit
await page.click('button[type="submit"]');
await page.waitForTimeout(500);  // Allow validation messages to render
```

### Anti-Patterns to Avoid
- **Using waitForNavigation after dry-run submit:** Form won't navigate because submit is prevented/aborted — use waitForSelector on error messages or success indicators instead
- **Enabling interception globally:** Only enable setRequestInterception when needed (dry-run tests), not for all HomeBay tests — Phase 1 login tests need real submissions
- **Assuming HTML5 validation covers React validation:** HomeBay may have custom validation (password strength, async email checks) — inspect both HTML5 ValidityState AND React error elements
- **Not clearing interception handlers:** Each test should remove its 'request' handler or create fresh page to avoid interference between tests
- **Ignoring isInterceptResolutionHandled():** Always check before calling abort/continue/respond — multiple handlers may exist

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Form discovery/mapping | Custom form introspection | Reuse formFuzzer._discoverForms() | Already handles input[name/id], select, textarea; captures required/pattern/maxLength |
| React input filling | New input setter | Reuse fillReactInput() from navigate.js | Already solves React controlled component state updates with native setter + events |
| Browser pool management | New concurrency logic | Reuse pool.withSlot() from pool.js | Guarantees cleanup, enforces max-3 constraint, handles timeouts |
| Form state extraction | Custom DOM parsing | HTML5 Validation API + ValidityState | Browser provides complete validation state; no need to parse attributes manually |

**Key insight:** HomeBay already has form testing primitives (formFuzzer for discovery, navigate.js for React input filling, pool.js for concurrency). Dry-run testing is about composing these with request interception, not reimplementing form interaction.

## Common Pitfalls

### Pitfall 1: Request Interception Timing
**What goes wrong:** Enabling setRequestInterception() after navigation starts causes "Target closed" errors
**Why it happens:** Interception must be enabled before page.goto() or before form submission is triggered
**How to avoid:** Enable interception immediately after acquiring browser slot, before any navigation
**Warning signs:** "Protocol error (Target.setAutoAttach): Target closed" or "Session closed" errors

### Pitfall 2: React Validation vs HTML5 Validation
**What goes wrong:** Test passes checkValidity() but form still shows error messages
**Why it happens:** HomeBay uses custom React validation logic (e.g., "Passwords must match") that runs independently of HTML5 constraints
**How to avoid:** Test both: (1) HTML5 validation via checkValidity(), (2) React error elements via querySelector('[role="alert"]')
**Warning signs:** Form appears invalid to user but validationResult.isValid is true

### Pitfall 3: Interception Handler Leaks
**What goes wrong:** Tests interfere with each other — dry-run mode stays enabled for non-dry-run tests
**Why it happens:** page.on('request', handler) persists until page is closed or handler is removed
**How to avoid:** Use pool.withSlot() to get fresh page per test, or store handler reference and call page.off('request', handler)
**Warning signs:** Unexpected request aborts in tests that should complete successfully

### Pitfall 4: Navigation After Prevented Submit
**What goes wrong:** Test hangs waiting for navigation that never happens
**Why it happens:** preventDefault or request abort prevents form submission, so no redirect occurs
**How to avoid:** Don't use waitForNavigation() in dry-run tests; wait for error messages or validation feedback instead
**Warning signs:** Timeouts on waitForNavigation() after clicking submit button

### Pitfall 5: Hydration Race Conditions
**What goes wrong:** Filling form fields before React hydration completes causes inputs to reset
**Why it happens:** HomeBay shows skeleton loader while auth store hydrates from localStorage (Phase 1 pattern)
**How to avoid:** Call waitForHydration() before filling any inputs (reuse from navigate.js)
**Warning signs:** Filled values disappear after a moment, form appears empty when submit is clicked

## Code Examples

Verified patterns from research and existing codebase:

### Dry-Run Form Test (Complete Flow)
```javascript
// Adapted from auth.js + request interception research
async function testFormValidation(role, formData, expectedErrors) {
  return await pool.withSlot(async (slot) => {
    const page = slot.page;

    // Enable request interception for dry-run
    await page.setRequestInterception(true);
    page.on('request', (req) => {
      if (req.isInterceptResolutionHandled()) return;
      if (req.method() === 'POST') {
        console.log('[DryRun] Aborting POST:', req.url());
        req.abort();
      } else {
        req.continue();
      }
    });

    // Navigate and wait for hydration (HomeBay pattern)
    await navigateTo(page, `${config.baseUrl}/register`, 'input#email');
    await waitForHydration(page);

    // Fill form fields (React-aware)
    for (const [field, value] of Object.entries(formData)) {
      await fillReactInput(page, `input#${field}`, value);
    }

    // Attempt submission (will be aborted)
    await page.click('button[type="submit"]');
    await page.waitForTimeout(1000);  // Allow validation to render

    // Check HTML5 validation state
    const html5Valid = await page.evaluate(() => {
      const form = document.querySelector('form');
      return form ? form.checkValidity() : null;
    });

    // Check React error messages
    const reactErrors = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('[role="alert"], .error'))
        .map(el => el.textContent.trim())
        .filter(t => t.length > 0);
    });

    return {
      html5Valid,
      reactErrors,
      passed: reactErrors.length === expectedErrors.length
    };
  });
}
```

### Inspect ValidityState for Specific Fields
```javascript
// Source: MDN Constraint Validation API
const fieldValidation = await page.evaluate((selector) => {
  const input = document.querySelector(selector);
  if (!input) return { error: 'Input not found' };

  return {
    value: input.value,
    valid: input.validity.valid,
    message: input.validationMessage,
    constraints: {
      required: input.required,
      pattern: input.pattern,
      minLength: input.minLength,
      maxLength: input.maxLength
    },
    failedConstraints: {
      valueMissing: input.validity.valueMissing,
      patternMismatch: input.validity.patternMismatch,
      tooShort: input.validity.tooShort,
      tooLong: input.validity.tooLong
    }
  };
}, 'input#email');
```

### Mock Server Response (Alternative to Abort)
```javascript
// Source: https://pptr.dev/guides/network-interception
// Use when testing success messages without actual submission
await page.setRequestInterception(true);
page.on('request', (req) => {
  if (req.isInterceptResolutionHandled()) return;

  if (req.method() === 'POST' && req.url().includes('/api/register')) {
    req.respond({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ success: true, message: 'Registration successful' })
    });
  } else {
    req.continue();
  }
});
```

### Test Suite Structure (Reuse FlowTester Patterns)
```javascript
// Adapted from flowTester.js step execution
const dryRunTests = [
  {
    name: 'Register with missing required fields',
    formData: { email: 'test@example.com', password: '' },
    expectedErrors: ['Password is required', 'Password must be at least 8 characters']
  },
  {
    name: 'Register with invalid email format',
    formData: { email: 'notanemail', password: 'ValidPass123!' },
    expectedErrors: ['Please enter a valid email address']
  },
  {
    name: 'Register with mismatched passwords',
    formData: {
      email: 'test@example.com',
      password: 'ValidPass123!',
      passwordConfirm: 'DifferentPass456!'
    },
    expectedErrors: ['Passwords must match']
  }
];

for (const test of dryRunTests) {
  const result = await testFormValidation('buyer', test.formData, test.expectedErrors);
  console.log(`${test.name}: ${result.passed ? 'PASS' : 'FAIL'}`);
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Submit forms to test endpoints | Request interception + client validation | Puppeteer v1.10+ (2018) | Eliminates test data pollution, no cleanup required |
| Mock entire browser with JSDOM | Puppeteer real browser testing | 2017+ (Puppeteer launch) | Tests actual browser validation behavior, not polyfills |
| Regex validation parsing | HTML5 Constraint Validation API | HTML5 standard (2014) | Browser-native validation introspection, no parsing needed |
| Separate validation test framework | Inline validation checks in E2E tests | Jest + Puppeteer (2018+) | Validation tested in context of real user flows |

**Deprecated/outdated:**
- **waitForNavigation after submit:** Next.js client-side routing doesn't trigger full navigation — use waitForSelector on content instead (HomeBay Phase 1 decision)
- **page.type() for React inputs:** Doesn't trigger React controlled component state updates — use fillReactInput with native setter + events (Phase 1 decision)
- **Global interception without isInterceptResolutionHandled():** Causes race conditions with multiple handlers — always check resolution status (Puppeteer v21+)

## Open Questions

1. **HomeBay async validation (email uniqueness check)**
   - What we know: Registration form may call /api/check-email before submission
   - What's unclear: Whether validation is triggered on blur or only on submit attempt
   - Recommendation: Test both scenarios; if async validation exists, mock the check-email endpoint with request.respond()

2. **Stripe iframe validation in dry-run mode**
   - What we know: Phase 2 will test Stripe Elements iframes for payment (cross-origin frames)
   - What's unclear: Whether request interception affects iframe requests, whether dry-run can test Stripe validation
   - Recommendation: Test iframe.src requests separately; may need to disable interception for stripe.com origins

3. **Multi-step form validation (wizard flows)**
   - What we know: HomeBay may have multi-step forms (auction creation, buyer onboarding)
   - What's unclear: Whether validation is checked at each step or only on final submission
   - Recommendation: Structure dry-run tests as flow steps (like flowTester.js), validate at each step transition

## Validation Architecture

**Note:** Phase 7 is a testing/QA phase with no production code changes to HomeBay. The code being written (DryRunTester class) is test infrastructure, not application features. Validation Architecture section focuses on how to ensure the test infrastructure itself is correct.

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Jest 29.x (standard for Node.js projects) |
| Config file | jest.config.js (to be created in Wave 0) |
| Quick run command | `npm test -- --testPathPattern=dryrun` |
| Full suite command | `npm test` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| N/A | Phase 7 has no requirements defined yet | N/A | N/A | N/A |

**Note:** Phase 7 currently shows "Requirements: TBD" in ROADMAP.md. Once requirements are defined during planning, they should be added to REQUIREMENTS.md and mapped here.

### Sampling Rate
- **Per task commit:** Manual smoke test (run one dry-run test against HomeBay staging)
- **Per wave merge:** Run full dry-run test suite (all forms: login, register, bid, etc.)
- **Phase gate:** Full test suite green + manual verification that real submissions still work (dry-run didn't break Phase 1 auth)

### Wave 0 Gaps
- [ ] `jest.config.js` — Jest configuration for Node.js project
- [ ] `test/dryrun.test.js` — Unit tests for DryRunTester class (mock Puppeteer page)
- [ ] `test/integration/homebay-dryrun.test.js` — Integration tests against HomeBay staging
- [ ] Framework install: `npm install --save-dev jest` — if not already present

*(HomeBay is a testing tool, not a production app, so testing the tests is optional. Wave 0 gaps listed for completeness but may be deferred.)*

## Sources

### Primary (HIGH confidence)
- [Puppeteer Request Interception Guide](https://pptr.dev/guides/network-interception) - Request interception patterns, abort/continue/respond API
- [Puppeteer page.setRequestInterception() API](https://pptr.dev/api/puppeteer.page.setrequestinterception) - Official method documentation
- [MDN Constraint Validation API](https://developer.mozilla.org/en-US/docs/Learn_web_development/Extensions/Forms/Form_validation) - HTML5 validation methods, ValidityState properties, examples
- [MDN reportValidity() method](https://developer.mozilla.org/en-US/docs/Web/API/HTMLFormElement/reportValidity) - Triggers validation and shows browser error messages
- Existing codebase: src/homebay/navigate.js, src/homebay/auth.js, src/agent/formFuzzer.js - Proven patterns for HomeBay form interaction

### Secondary (MEDIUM confidence)
- [HTML5 Forms: Constraint Validation API — SitePoint](https://www.sitepoint.com/html5-forms-javascript-constraint-validation-api/) - Practical examples and checkValidity vs reportValidity
- [The Definitive Guide to the Constraint Validation API - DEV Community](https://dev.to/itxshakil/the-definitive-guide-to-the-constraint-validation-api-3l80) - Comprehensive ValidityState property reference
- [Mockiavelli library for Puppeteer](https://github.com/HLTech/mockiavelli) - Structured mocking alternative (not required but useful reference)
- [React Form Validation (2026 Edition)](https://thelinuxcode.com/react-form-validation-with-formik-and-yup-2026-edition/) - React validation timing best practices
- [How to Handle Form Validation in React (Jan 2026)](https://oneuptime.com/blog/post/2026-01-24-react-form-validation/view) - Validate on blur for most fields, debounce async validations

### Tertiary (LOW confidence)
- [WebSearch: Form validation testing best practices](https://bugbug.io/blog/test-automation/automated-form-testing/) - General form testing strategies (not Puppeteer-specific)
- [Client-Side vs Server-Side Validation](https://surveyjs.io/stay-updated/blog/client-server-data-validation) - Testing both validation layers
- [Puppeteer for E2E Testing](https://dsheiko.com/weblog/end-to-end-testing-with-puppeteer/) - E2E testing patterns with validation

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - Puppeteer built-in capabilities verified against official docs, no new dependencies required
- Architecture: HIGH - Patterns built on proven Phase 1 HomeBay code (fillReactInput, pool.withSlot, waitForHydration)
- Pitfalls: HIGH - Derived from Puppeteer docs (isInterceptResolutionHandled warning) and existing HomeBay constraints (React state updates, hydration timing)

**Research date:** 2026-03-04
**Valid until:** 2026-04-04 (30 days for stable — Puppeteer 24.x API is stable, HTML5 validation is standard)
