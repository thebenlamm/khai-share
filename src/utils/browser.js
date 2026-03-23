const puppeteer = require('puppeteer');

const DEFAULT_ARGS = [
  '--disable-dev-shm-usage',
  '--disable-gpu',
];

const DEFAULT_VIEWPORT = { width: 1920, height: 1080 };

const _activeBrowsers = new Set();

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

  _activeBrowsers.add(browser);
  browser.on('disconnected', () => _activeBrowsers.delete(browser));

  const page = await browser.newPage();
  if (viewport) {
    await page.setViewport(viewport);
  }

  return { browser, page };
}

async function closeAllBrowsers() {
  const promises = [];
  for (const browser of _activeBrowsers) {
    promises.push(browser.close().catch(() => {}));
  }
  await Promise.all(promises);
  _activeBrowsers.clear();
}

module.exports = { createBrowser, closeAllBrowsers, DEFAULT_ARGS, DEFAULT_VIEWPORT };
