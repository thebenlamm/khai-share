'use strict';

const { pool } = require('./pool');
const { fillReactInput, navigateTo, waitForHydration } = require('./navigate');
const { getHomeBayConfig } = require('./config');

/**
 * DryRunTester - validates form behavior without server-side effects.
 *
 * Uses Puppeteer request interception to block POST/PUT/DELETE requests during
 * form testing. Captures HTML5 validation state (checkValidity, ValidityState)
 * and React error elements ([role="alert"], .error) to verify client-side
 * validation logic without polluting test data or triggering external services.
 *
 * Follows HomeBay patterns:
 * - pool.withSlot() for browser acquisition and guaranteed cleanup
 * - fillReactInput() for React controlled component state updates
 * - waitForHydration() to handle HomeBay's skeleton loader
 */
class DryRunTester {
  /**
   * @param {Object} config
   * @param {string} config.baseUrl - HomeBay staging URL
   */
  constructor(config = {}) {
    const homebayConfig = getHomeBayConfig();
    this.baseUrl = config.baseUrl || homebayConfig.baseUrl;
  }

  /**
   * Test form validation in dry-run mode (no submissions reach server).
   *
   * @param {string} role - HomeBay role (admin/agent/seller/buyer)
   * @param {string} formUrl - URL path to the form page
   * @param {Object} formData - Form field values { fieldSelector: value }
   * @param {Array<string>} expectedErrors - Expected validation error messages
   * @returns {Promise<{html5Valid, reactErrors, passed, error?}>}
   */
  async testFormValidation(role, formUrl, formData = {}, expectedErrors = []) {
    return await pool.withSlot(async (slot) => {
      const { page } = slot;

      try {
        console.log(`[DryRun] Starting dry-run test for ${formUrl} (role: ${role})`);

        // Enable request interception IMMEDIATELY after acquiring slot
        await page.setRequestInterception(true);

        // Handler to abort POST/PUT/DELETE, continue others
        page.on('request', (req) => {
          // CRITICAL: Check if already handled (prevents "Request already handled" error)
          if (req.isInterceptResolutionHandled()) {
            return;
          }

          const method = req.method();
          const url = req.url();

          if (method === 'POST' || method === 'PUT' || method === 'DELETE') {
            console.log(`[DryRun] Aborting ${method} to ${url}`);
            req.abort();
          } else {
            req.continue();
          }
        });

        // Navigate to form page
        const fullUrl = formUrl.startsWith('http')
          ? formUrl
          : `${this.baseUrl}${formUrl}`;

        await navigateTo(page, fullUrl);

        // Wait for HomeBay hydration (skeleton loader disappears)
        await waitForHydration(page);

        // Fill form fields using React-aware input helper
        for (const [selector, value] of Object.entries(formData)) {
          try {
            await fillReactInput(page, selector, value);
          } catch (err) {
            console.warn(`[DryRun] Could not fill ${selector}: ${err.message}`);
          }
        }

        // Find and click submit button
        const submitSelector = 'button[type="submit"]';
        const submitExists = await page.$(submitSelector);

        if (!submitExists) {
          console.warn('[DryRun] No submit button found, skipping submit');
        } else {
          // Click submit (won't navigate because request is aborted)
          await page.click(submitSelector).catch((err) => {
            console.warn(`[DryRun] Submit click failed: ${err.message}`);
          });

          // Wait for validation messages to render
          await page.waitForTimeout(1000);
        }

        // Capture HTML5 validation state
        const html5Valid = await page.evaluate(() => {
          const form = document.querySelector('form');
          if (!form) return { error: 'Form not found' };

          // checkValidity() returns boolean without showing browser UI
          // (reportValidity() would show the browser's native validation UI)
          const isValid = form.checkValidity();

          const inputs = Array.from(
            form.querySelectorAll('input, select, textarea')
          );
          const inputStates = inputs.map((input) => ({
            name: input.name || input.id || input.type,
            valid: input.validity.valid,
            validationMessage: input.validationMessage,
            validity: {
              valueMissing: input.validity.valueMissing,
              typeMismatch: input.validity.typeMismatch,
              patternMismatch: input.validity.patternMismatch,
              tooShort: input.validity.tooShort,
              tooLong: input.validity.tooLong,
              rangeUnderflow: input.validity.rangeUnderflow,
              rangeOverflow: input.validity.rangeOverflow,
              stepMismatch: input.validity.stepMismatch,
              badInput: input.validity.badInput,
            },
          }));

          return { isValid, inputs: inputStates };
        });

        // Capture React validation errors
        const reactErrors = await page.evaluate(() => {
          return Array.from(
            document.querySelectorAll('[role="alert"], .error, .text-red')
          )
            .map((el) => ({
              text: el.textContent.trim(),
              visible: el.offsetParent !== null, // Element is visible
            }))
            .filter((err) => err.visible && err.text.length > 0);
        });

        // Determine if test passed
        const passed = this._evaluateTestResult(
          html5Valid,
          reactErrors,
          expectedErrors
        );

        console.log(
          `[DryRun] Test complete - Passed: ${passed}, HTML5 Valid: ${html5Valid.isValid}, React Errors: ${reactErrors.length}`
        );

        return {
          html5Valid,
          reactErrors,
          passed,
        };
      } catch (error) {
        console.error(`[DryRun] Error during test: ${error.message}`);
        return {
          error: error.message,
          html5Valid: null,
          reactErrors: [],
          passed: false,
        };
      }
    });
  }

  /**
   * Evaluate whether test passed based on validation state and expected errors.
   * @private
   */
  _evaluateTestResult(html5Valid, reactErrors, expectedErrors) {
    // If no expected errors specified, pass if any validation triggered
    if (expectedErrors.length === 0) {
      return !html5Valid.isValid || reactErrors.length > 0;
    }

    // Check if all expected errors are present
    const errorTexts = reactErrors.map((e) => e.text.toLowerCase());
    const allExpectedPresent = expectedErrors.every((expected) =>
      errorTexts.some((actual) => actual.includes(expected.toLowerCase()))
    );

    return allExpectedPresent;
  }
}

module.exports = { DryRunTester };
