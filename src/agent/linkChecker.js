const { createBrowser } = require('../utils/browser');
const https = require('https');
const http = require('http');
const { URL } = require('url');

/**
 * LinkChecker - Comprehensive broken link checker
 * Crawls pages with Puppeteer to discover links, then validates each
 * unique URL with HEAD/GET requests using Node.js http/https modules.
 */
class LinkChecker {
  constructor(config) {
    this.baseUrl = config.baseUrl;
    this.maxPages = config.maxPages || 50;
    this.concurrency = config.concurrency || 10;
    this.timeout = config.timeout || 10000;
    this.browser = null;
    this.visited = new Set();
    this.discovered = new Map(); // url -> Set of pages it was found on
    this.checkedUrls = new Map(); // url -> result
  }

  async init() {
    const { browser } = await createBrowser();
    this.browser = browser;
  }

  async crawlAndCheck() {
    if (!this.browser) {
      throw new Error('Browser not initialized. Call init() first.');
    }

    console.log(`[LinkChecker] Crawling ${this.baseUrl} (max ${this.maxPages} pages)`);
    await this._crawlPages(this.baseUrl);
    console.log(`[LinkChecker] Discovered ${this.discovered.size} unique links from ${this.visited.size} pages`);

    console.log(`[LinkChecker] Checking links (concurrency: ${this.concurrency})`);
    await this._checkAllLinks();

    return this._buildReport();
  }

  async _crawlPages(startUrl) {
    const queue = [startUrl];
    const baseHost = new URL(this.baseUrl).host;
    const skipExt = new Set(['png','jpg','jpeg','gif','svg','webp','ico','pdf','zip','mp4','mp3','woff','woff2','ttf','eot','css','js','json','xml']);

    while (queue.length > 0 && this.visited.size < this.maxPages) {
      const url = queue.shift();
      if (this.visited.has(url)) continue;
      this.visited.add(url);
      console.log(`[LinkChecker] Crawling page ${this.visited.size}/${this.maxPages}: ${url}`);

      let page;
      try {
        page = await this.browser.newPage();
        await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
        const links = await page.evaluate(() =>
          Array.from(document.querySelectorAll('a[href], link[href], img[src], script[src]'))
            .map(el => el.getAttribute('href') || el.getAttribute('src') || '')
            .filter(h => h && !h.startsWith('javascript:') && !h.startsWith('mailto:') && !h.startsWith('tel:') && !h.startsWith('data:') && !h.startsWith('#'))
        );
        for (const rawHref of links) {
          try {
            const resolved = new URL(rawHref, url).href.split('#')[0];
            if (!resolved.startsWith('http')) continue;
            if (!this.discovered.has(resolved)) this.discovered.set(resolved, new Set());
            this.discovered.get(resolved).add(url);
            const ext = new URL(resolved).pathname.split('.').pop().toLowerCase();
            if (new URL(resolved).host === baseHost && !this.visited.has(resolved) && !skipExt.has(ext)) {
              queue.push(resolved);
            }
          } catch { /* invalid URL */ }
        }
      } catch (err) {
        console.error(`[LinkChecker] Error crawling ${url}:`, err.message);
      } finally {
        if (page) await page.close();
      }
    }
  }

  async _checkAllLinks() {
    const urls = Array.from(this.discovered.keys());
    let index = 0;
    const worker = async () => {
      while (index < urls.length) {
        const url = urls[index++];
        if (!this.checkedUrls.has(url)) this.checkedUrls.set(url, await this.checkUrl(url));
      }
    };
    await Promise.all(Array.from({ length: this.concurrency }, () => worker()));
  }

  async checkUrl(url) {
    const startTime = Date.now();
    const isInternal = new URL(url).host === new URL(this.baseUrl).host;
    const foundOn = Array.from(this.discovered.get(url) || []);
    // Try HEAD first, fall back to GET if server rejects HEAD
    let result = await this._makeRequest(url, 'HEAD');
    if ((result.error && result.error.includes('method')) || result.status === 405 || result.status === 501) {
      result = await this._makeRequest(url, 'GET');
    }
    return {
      url, status: result.status, isInternal, foundOn,
      responseTime: Date.now() - startTime,
      redirectChain: result.redirectChain || [], error: result.error || null,
    };
  }

  _makeRequest(url, method, chain = [], maxRedirects = 8) {
    return new Promise((resolve) => {
      if (chain.length >= maxRedirects) return resolve({ status: null, error: 'redirect-loop', redirectChain: chain });
      let parsed;
      try { parsed = new URL(url); } catch { return resolve({ status: null, error: 'invalid-url', redirectChain: chain }); }

      const mod = parsed.protocol === 'https:' ? https : http;
      const req = mod.request(url, {
        method, timeout: this.timeout, rejectUnauthorized: true,
        headers: { 'User-Agent': 'KhaiLinkChecker/1.0', Accept: 'text/html,*/*' },
      }, (res) => {
        res.resume();
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          chain.push({ url, status: res.statusCode });
          return this._makeRequest(new URL(res.headers.location, url).href, method, chain, maxRedirects).then(resolve);
        }
        resolve({
          status: res.statusCode, error: null,
          redirectChain: chain.length > 0 ? [...chain, { url, status: res.statusCode }] : [],
        });
      });
      req.on('timeout', () => { req.destroy(); resolve({ status: null, error: 'timeout', redirectChain: chain }); });
      req.on('error', (err) => {
        const certCodes = ['CERT_HAS_EXPIRED', 'ERR_TLS_CERT_ALTNAME_INVALID', 'UNABLE_TO_VERIFY_LEAF_SIGNATURE'];
        const errorMap = { ENOTFOUND: 'dns-error', ECONNREFUSED: 'connection-refused', ECONNRESET: 'connection-reset' };
        const errorType = certCodes.includes(err.code) ? 'certificate-error' : (errorMap[err.code] || 'connection-error');
        resolve({ status: null, error: errorType, redirectChain: chain, detail: err.message });
      });
      req.end();
    });
  }

  _buildReport() {
    const broken = [], slow = [], redirects = [];
    let ok = 0, brk = 0, timeouts = 0, redir = 0, internal = 0, external = 0;

    for (const [, r] of this.checkedUrls) {
      r.isInternal ? internal++ : external++;
      if (r.error || r.status >= 400) {
        brk++;
        if (r.error === 'timeout') timeouts++;
        broken.push({ url: r.url, status: r.status, foundOn: r.foundOn, error: r.error || `HTTP ${r.status}` });
      } else {
        ok++;
      }
      if (r.redirectChain.length > 0) { redir++; redirects.push({ url: r.url, chain: r.redirectChain }); }
      if (r.responseTime > 3000 && !r.error) slow.push({ url: r.url, responseTime: r.responseTime });
    }

    broken.sort((a, b) => b.foundOn.length - a.foundOn.length);
    slow.sort((a, b) => b.responseTime - a.responseTime);

    return {
      totalLinks: this.discovered.size, internal, external, broken, slow, redirects,
      summary: { ok, broken: brk, timeout: timeouts, redirected: redir },
    };
  }

  async close() {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
  }
}

module.exports = LinkChecker;
