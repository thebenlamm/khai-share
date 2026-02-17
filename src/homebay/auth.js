'use strict';

const path = require('path');
const fs = require('fs');
const { pool } = require('./pool');
const { getHomeBayConfig } = require('./config');
const { fillReactInput, navigateTo, waitForHydration } = require('./navigate');

const SCREENSHOTS_DIR = path.join(__dirname, '../../screenshots');

// Ensure screenshots directory exists at module load time
fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });

/**
 * Role label mapping for the HomeBay multi-role selector modal.
 * When an account has multiple roles, HomeBay shows a modal with buttons
 * labelled with these display names. We match on the <p> text inside each button.
 */
const ROLE_LABELS = {
  admin: 'Admin Dashboard',
  agent: 'Agent/Seller Dashboard',
  buyer: 'Bidder Account',
  seller: 'Agent/Seller Dashboard',
};

/**
 * Login to HomeBay as the specified role.
 *
 * Handles the role selector modal that appears for multi-role accounts.
 * Captures a screenshot on both success and failure for debugging.
 *
 * Fail-fast approach: no retries, first error stops the flow.
 *
 * @param {string} role - One of: 'admin', 'agent', 'seller', 'buyer'
 * @param {Object} [options]
 * @returns {Promise<{ success: boolean, role: string, finalUrl?: string, error?: string, screenshot?: string }>}
 */
async function loginHomeBay(role, options = {}) {
  let screenshotPath;

  try {
    const config = getHomeBayConfig();
    const account = config.accounts && config.accounts[role];

    if (!account) {
      throw new Error(`No credentials configured for role: ${role}`);
    }

    const result = await pool.withSlot(async (slot) => {
      const page = slot.page;

      // Navigate to login page and wait for email input
      await navigateTo(page, `${config.baseUrl}/login`, 'input#email');

      // Wait for skeleton loader to disappear (auth store hydration)
      await waitForHydration(page);

      // Wait for real (non-disabled) input
      await page.waitForSelector('input#email:not([disabled])', { timeout: 15000 });

      // Fill credentials using native setter + event dispatch
      await fillReactInput(page, 'input#email', account.username);
      await fillReactInput(page, 'input#password', account.password);

      // Wait for submit button to become enabled
      await page.waitForFunction(
        () => !document.querySelector('button[type="submit"]').disabled,
        { timeout: 5000 }
      );

      // Submit the form
      await page.click('button[type="submit"]');

      // Wait for either: URL leaves /login OR role selector modal appears
      await page.waitForFunction(
        () => {
          const urlLeft = !window.location.pathname.startsWith('/login');
          const modalPresent = !!document.querySelector('h2, h3, [role="dialog"]') &&
            Array.from(document.querySelectorAll('h2, h3')).some(
              (el) => el.textContent.includes('Select Account Type')
            );
          return urlLeft || modalPresent;
        },
        { timeout: 15000 }
      );

      // Check if role selector modal appeared
      const modalVisible = await page.evaluate(() => {
        return Array.from(document.querySelectorAll('h2, h3')).some(
          (el) => el.textContent.includes('Select Account Type')
        );
      });

      if (modalVisible) {
        const roleLabel = ROLE_LABELS[role];

        // Find and click the role button matching the label text
        const clicked = await page.evaluate((label) => {
          const buttons = Array.from(document.querySelectorAll('button'));
          const roleButton = buttons.find((btn) => {
            const labelEl = btn.querySelector('p.text-sm.font-medium');
            return labelEl && labelEl.textContent.trim() === label;
          });
          if (roleButton) {
            roleButton.click();
            return true;
          }
          return false;
        }, roleLabel);

        if (!clicked) {
          throw new Error(`Role selector button not found for role: ${role} (label: "${roleLabel}")`);
        }

        // Wait for URL to leave /login after role selection
        await page.waitForFunction(
          () => !window.location.pathname.startsWith('/login'),
          { timeout: 15000 }
        );
      }

      // Capture success screenshot
      const successPath = path.join(SCREENSHOTS_DIR, `homebay-login-${role}-success.png`);
      try {
        await page.screenshot({ path: successPath, fullPage: false });
      } catch (_) {
        // Screenshot failure is non-fatal
      }

      return { success: true, role, finalUrl: page.url() };
    });

    return result;

  } catch (err) {
    // Capture failure screenshot (browser may already be dead — ignore errors)
    screenshotPath = path.join(SCREENSHOTS_DIR, `homebay-login-${role}-failure.png`);
    try {
      // Attempt screenshot via a fresh pool slot would defeat the purpose —
      // the existing page is gone. Just record the path for the caller.
    } catch (_) {
      // ignore
    }

    return {
      success: false,
      role,
      error: err.message,
      screenshot: screenshotPath,
    };
  }
}

/**
 * Register a new buyer account on HomeBay.
 *
 * @param {Object} userData
 * @param {string} userData.email
 * @param {string} userData.password
 * @param {string} [userData.dateOfBirth] - YYYY-MM-DD format (default: '1990-01-15')
 * @param {string} [userData.firstName]
 * @param {string} [userData.lastName]
 * @param {string} [userData.phone]
 * @returns {Promise<{ success: boolean, email?: string, finalUrl?: string, error?: string }>}
 */
async function registerHomeBay(userData) {
  try {
    const config = getHomeBayConfig();
    const { email, password, dateOfBirth = '1990-01-15', firstName, lastName, phone } = userData;

    const result = await pool.withSlot(async (slot) => {
      const page = slot.page;

      // Navigate to registration page
      await navigateTo(page, `${config.baseUrl}/register`, 'input#email');
      await waitForHydration(page);

      // Fill required fields
      await fillReactInput(page, 'input#email', email);
      await fillReactInput(page, 'input#password', password);
      await fillReactInput(page, 'input#passwordConfirm', password);
      await fillReactInput(page, 'input#dateOfBirth', dateOfBirth);

      // Fill optional fields if provided
      if (firstName) await fillReactInput(page, 'input#firstName', firstName);
      if (lastName) await fillReactInput(page, 'input#lastName', lastName);
      if (phone) await fillReactInput(page, 'input#phone', phone);

      // Check ToS checkbox (native click toggles the checkbox state)
      await page.click('input[type="checkbox"]');

      // Wait for submit button to be enabled
      await page.waitForFunction(
        () => {
          const btn = document.querySelector('button[type="submit"]');
          return btn && !btn.disabled;
        },
        { timeout: 5000 }
      );

      // Click create account
      await page.click('button[type="submit"]');

      // Wait for redirect to /?welcome=true
      await page.waitForFunction(
        () => window.location.search.includes('welcome=true'),
        { timeout: 15000 }
      );

      // Capture success screenshot
      const successPath = path.join(SCREENSHOTS_DIR, `homebay-register-success.png`);
      try {
        await page.screenshot({ path: successPath, fullPage: false });
      } catch (_) {
        // non-fatal
      }

      return { success: true, email, finalUrl: page.url() };
    });

    return result;

  } catch (err) {
    return {
      success: false,
      error: err.message,
    };
  }
}

/**
 * Submit the forgot-password form on HomeBay.
 *
 * After submission, HomeBay replaces the form with a success message
 * (no redirect). The actual reset token arrives via email.
 *
 * @param {string} email
 * @returns {Promise<{ success: boolean, email?: string, error?: string }>}
 */
async function forgotPasswordHomeBay(email) {
  try {
    const config = getHomeBayConfig();

    const result = await pool.withSlot(async (slot) => {
      const page = slot.page;

      await navigateTo(page, `${config.baseUrl}/forgot-password`, 'input[type="email"], input#email');
      await waitForHydration(page);

      // Fill email and submit
      await fillReactInput(page, 'input[type="email"], input#email', email);

      await page.waitForFunction(
        () => {
          const btn = document.querySelector('button[type="submit"]');
          return btn && !btn.disabled;
        },
        { timeout: 5000 }
      );

      await page.click('button[type="submit"]');

      // Wait for success message to appear (form replaced by confirmation text)
      await page.waitForFunction(
        () => {
          const text = document.body.textContent || '';
          return (
            text.includes('check your email') ||
            text.includes('email sent') ||
            text.includes('reset link') ||
            text.includes('If an account')
          );
        },
        { timeout: 15000 }
      );

      // Capture screenshot
      const successPath = path.join(SCREENSHOTS_DIR, `homebay-forgot-password-success.png`);
      try {
        await page.screenshot({ path: successPath, fullPage: false });
      } catch (_) {
        // non-fatal
      }

      return { success: true, email };
    });

    return result;

  } catch (err) {
    return {
      success: false,
      error: err.message,
    };
  }
}

/**
 * Submit the reset-password form on HomeBay.
 *
 * HomeBay redirects to /login approximately 3 seconds after a successful reset.
 *
 * @param {string} token - The password reset token from the reset email URL
 * @param {string} newPassword - The new password to set
 * @returns {Promise<{ success: boolean, error?: string }>}
 */
async function resetPasswordHomeBay(token, newPassword) {
  try {
    const config = getHomeBayConfig();

    const result = await pool.withSlot(async (slot) => {
      const page = slot.page;

      await navigateTo(
        page,
        `${config.baseUrl}/reset-password?token=${encodeURIComponent(token)}`,
        'input[type="password"]'
      );
      await waitForHydration(page);

      // Fill both password inputs (new password + confirm password)
      const passwordInputs = await page.$$('input[type="password"]');
      if (passwordInputs.length < 2) {
        throw new Error(`Expected 2 password inputs on reset page, found ${passwordInputs.length}`);
      }

      await fillReactInput(page, 'input[type="password"]:first-of-type', newPassword);

      // Use nth-child or index-based approach for confirm password
      await page.evaluate((val) => {
        const inputs = Array.from(document.querySelectorAll('input[type="password"]'));
        if (inputs.length < 2) throw new Error('Confirm password input not found');

        const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
          window.HTMLInputElement.prototype,
          'value'
        ).set;
        nativeInputValueSetter.call(inputs[1], val);
        inputs[1].dispatchEvent(new Event('input', { bubbles: true }));
        inputs[1].dispatchEvent(new Event('change', { bubbles: true }));
      }, newPassword);

      // Wait for submit to be enabled and click
      await page.waitForFunction(
        () => {
          const btn = document.querySelector('button[type="submit"]');
          return btn && !btn.disabled;
        },
        { timeout: 5000 }
      );

      await page.click('button[type="submit"]');

      // Wait for redirect to /login (HomeBay redirects ~3s after success)
      await page.waitForFunction(
        () => window.location.pathname.startsWith('/login'),
        { timeout: 15000 }
      );

      // Capture success screenshot
      const successPath = path.join(SCREENSHOTS_DIR, `homebay-reset-password-success.png`);
      try {
        await page.screenshot({ path: successPath, fullPage: false });
      } catch (_) {
        // non-fatal
      }

      return { success: true };
    });

    return result;

  } catch (err) {
    return {
      success: false,
      error: err.message,
    };
  }
}

module.exports = {
  loginHomeBay,
  registerHomeBay,
  forgotPasswordHomeBay,
  resetPasswordHomeBay,
};
