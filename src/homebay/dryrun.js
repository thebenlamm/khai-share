'use strict';

const { pool } = require('./pool');
const { fillReactInput, navigateTo, waitForHydration } = require('./navigate');
const { getHomeBayConfig } = require('./config');

/**
 * DryRunTester — validates form behavior without server-side effects.
 *
 * Uses Puppeteer request interception to block POST/PUT/DELETE requests,
 * allowing client-side validation testing without creating database records,
 * sending emails, or triggering external services.
 *
 * Captures both HTML5 validation state (checkValidity + ValidityState) and
 * React validation errors ([role="alert"], .error elements).
 */
class DryRunTester {
  /**
   * @param {Object} config
   * @param {string} [config.baseUrl] - Base URL for HomeBay (defaults to credentials)
   */
  constructor(config = {}) {
    const homebayConfig = getHomeBayConfig();
    this.baseUrl = config.baseUrl || homebayConfig.baseUrl;
  }

  /**
   * Test form validation without submitting to the server.
   *
   * @param {string|null} role - User role to authenticate as (null = no auth)
   * @param {string} formUrl - Relative path to form page (e.g., "/register")
   * @param {Object} formData - Object mapping field names to values (e.g., { email: "test@example.com", password: "short" })
   * @param {string[]} expectedErrors - Array of expected validation error messages
   * @returns {Promise<{ html5Valid: Object, reactErrors: Array, passed: boolean }>}
   */
  async testFormValidation(role, formUrl, formData, expectedErrors = []) {
    return await pool.withSlot(async (slot) => {
      const { page } = slot;

      try {
        // Enable request interception to block form submissions
        await page.setRequestInterception(true);

        const interceptedRequests = [];

        page.on('request', (req) => {
          // Check if request is already handled (prevents double-handling errors)
          if (req.isInterceptResolutionHandled()) {
            return;
          }

          const method = req.method();
          const url = req.url();

          // Block POST/PUT/DELETE (form submissions and mutations)
          if (method === 'POST' || method === 'PUT' || method === 'DELETE') {
            console.log(`[DryRun] Aborting ${method} to ${url}`);
            interceptedRequests.push({ method, url });
            req.abort('failed');
          } else {
            // Allow GET, HEAD, OPTIONS (for page load, styles, scripts)
            req.continue();
          }
        });

        // Navigate to form page
        const fullUrl = this.baseUrl + formUrl;
        await navigateTo(page, fullUrl);

        // Wait for HomeBay hydration (skeleton loader disappears)
        await waitForHydration(page).catch(() => {
          console.log('[DryRun] No skeleton loader found, assuming page is ready');
        });

        // Additional wait for form to be ready
        await page.waitForSelector('form', { timeout: 10000 });

        // Fill form fields using React-aware input method
        for (const [fieldName, value] of Object.entries(formData)) {
          const selector = `input[name="${fieldName}"], input[id="${fieldName}"], textarea[name="${fieldName}"], textarea[id="${fieldName}"], select[name="${fieldName}"], select[id="${fieldName}"]`;

          try {
            await fillReactInput(page, selector, value);
          } catch (err) {
            console.log(`[DryRun] Could not fill field ${fieldName}: ${err.message}`);
          }
        }

        // Click submit button (will be intercepted and blocked)
        try {
          await page.click('button[type="submit"]');
        } catch (err) {
          // Fallback: evaluate click
          await page.evaluate(() => {
            const btn = document.querySelector('button[type="submit"]');
            if (btn) btn.click();
          });
        }

        // Wait for validation messages to render
        await page.waitForTimeout(1000);

        // Capture HTML5 validation state
        const html5Valid = await page.evaluate(() => {
          const form = document.querySelector('form');
          if (!form) return { error: 'Form not found' };

          const isValid = form.checkValidity(); // Don't use reportValidity() - shows browser UI
          const inputs = Array.from(form.querySelectorAll('input, select, textarea'));
          const inputStates = inputs.map(input => ({
            name: input.name || input.id,
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
            }
          }));

          return { isValid, inputs: inputStates };
        });

        // Capture React validation errors
        const reactErrors = await page.evaluate(() => {
          return Array.from(document.querySelectorAll('[role="alert"], .error, .text-red'))
            .map(el => ({
              text: el.textContent.trim(),
              visible: el.offsetParent !== null
            }))
            .filter(err => err.visible && err.text.length > 0)
            .map(err => err.text);
        });

        // Check if expected errors are present
        let passed = true;
        const foundErrors = [...reactErrors];

        // Also include HTML5 validation messages
        if (html5Valid.inputs) {
          html5Valid.inputs.forEach(input => {
            if (!input.valid && input.validationMessage) {
              foundErrors.push(input.validationMessage);
            }
          });
        }

        // Verify that all expected errors are found
        for (const expectedError of expectedErrors) {
          const found = foundErrors.some(msg =>
            msg.toLowerCase().includes(expectedError.toLowerCase()) ||
            expectedError.toLowerCase().includes(msg.toLowerCase())
          );
          if (!found) {
            console.log(`[DryRun] Expected error not found: "${expectedError}"`);
            passed = false;
          }
        }

        console.log(`[DryRun] Test ${passed ? 'PASSED' : 'FAILED'} — ${interceptedRequests.length} request(s) blocked`);

        return {
          html5Valid,
          reactErrors,
          foundErrors,
          passed,
          interceptedRequests
        };

      } catch (error) {
        console.error('[DryRun] Error during form validation test:', error);
        return {
          error: error.message,
          passed: false
        };
      } finally {
        // Disable request interception for the next use
        try {
          await page.setRequestInterception(false);
        } catch (_) {
          // ignore
        }
      }
    });
  }
}

module.exports = { DryRunTester };
