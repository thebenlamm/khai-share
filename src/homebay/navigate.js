'use strict';

/**
 * React-aware navigation helpers for HomeBay (Next.js) pages.
 *
 * Key constraints from research:
 * - React controlled inputs require native setter + event dispatch — page.type() alone
 *   does NOT trigger React's synthetic event system reliably.
 * - Next.js client-side routing does NOT trigger full page loads, so waitForNavigation()
 *   times out. Use waitForSelector() on content that appears after navigation instead.
 * - HomeBay shows animate-pulse skeleton while the auth store hydrates from localStorage.
 *   Wait for hydration before interacting with form inputs.
 */

/**
 * Fill a React controlled input field.
 *
 * Uses the native HTMLInputElement setter + synthetic input/change events.
 * This is the ONLY reliable way to trigger React's state update for controlled
 * inputs — keyboard events alone do not update the underlying React state.
 *
 * @param {import('puppeteer').Page} page
 * @param {string} selector - CSS selector for the input element
 * @param {string} value - Value to set
 * @returns {Promise<void>}
 */
async function fillReactInput(page, selector, value) {
  await page.waitForSelector(selector, { timeout: 15000 });

  await page.evaluate((sel, val) => {
    const input = document.querySelector(sel);
    if (!input) {
      throw new Error(`Input not found: ${sel}`);
    }

    // Use native setter to bypass React's synthetic event wrapping
    const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      'value'
    ).set;
    nativeInputValueSetter.call(input, val);

    // Dispatch events so React reconciles its controlled state
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }, selector, value);
}

/**
 * Navigate to a URL and optionally wait for a selector to appear.
 *
 * Uses networkidle2 (≤2 pending requests for 500ms) which is safe for auth
 * pages. For auction pages with persistent WebSocket connections (Phase 2+),
 * callers should use domcontentloaded + a content selector instead.
 *
 * @param {import('puppeteer').Page} page
 * @param {string} url - Fully qualified URL to navigate to
 * @param {string} [readySelector] - CSS selector to wait for after navigation
 * @returns {Promise<void>}
 */
async function navigateTo(page, url, readySelector) {
  await page.goto(url, { waitUntil: 'networkidle2', timeout: 15000 });

  if (readySelector) {
    await page.waitForSelector(readySelector, { timeout: 15000 });
  }
}

/**
 * Click an element and wait for new content to appear.
 *
 * Do NOT use waitForNavigation — it times out on Next.js client-side routing
 * because Next.js route changes do not trigger full page loads.
 *
 * @param {import('puppeteer').Page} page
 * @param {string} clickSelector - CSS selector of the element to click
 * @param {string} readySelector - CSS selector to wait for after click
 * @returns {Promise<void>}
 */
async function clickAndWaitForContent(page, clickSelector, readySelector) {
  await page.click(clickSelector);
  await page.waitForSelector(readySelector, { timeout: 15000 });
}

/**
 * Wait for HomeBay's skeleton loader to disappear.
 *
 * HomeBay shows animate-pulse skeleton elements while the auth store hydrates
 * from localStorage. Interacting with inputs before hydration completes can
 * produce stale state that React overwrites on the next render.
 *
 * @param {import('puppeteer').Page} page
 * @returns {Promise<void>}
 */
async function waitForHydration(page) {
  await page.waitForFunction(
    () => !document.querySelector('.animate-pulse'),
    { timeout: 10000 }
  );
}

module.exports = { fillReactInput, navigateTo, clickAndWaitForContent, waitForHydration };
