const puppeteer = require('puppeteer');

const DEFAULT_ARGS = [
  '--disable-dev-shm-usage',
  '--disable-gpu',
];

const DEFAULT_VIEWPORT = { width: 1920, height: 1080 };

/**
 * Create a Puppeteer browser instance with consistent, secure defaults.
 *
 * @param {Object} options
 * @param {boolean} [options.headless=true] - Run headless (true) or visible (false)
 * @param {string[]} [options.extraArgs=[]] - Additional Chrome args
 * @param {Object|null} [options.viewport] - Viewport size, null for default window size
 * @returns {{ browser: Browser, page: Page }}
 */
async function createBrowser(options = {}) {
  const {
    headless = true,
    extraArgs = [],
    viewport = DEFAULT_VIEWPORT,
  } = options;

  const args = [...DEFAULT_ARGS, ...extraArgs];

  const browser = await puppeteer.launch({
    headless,
    args,
    defaultViewport: viewport === null ? null : undefined,
  });

  const page = await browser.newPage();
  if (viewport) {
    await page.setViewport(viewport);
  }

  return { browser, page };
}

module.exports = { createBrowser, DEFAULT_ARGS, DEFAULT_VIEWPORT };
