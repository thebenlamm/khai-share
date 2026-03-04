const { createBrowser } = require('../utils/browser');

/**
 * LighthouseAgent - Performance metrics collector using Puppeteer CDP
 * No external lighthouse package needed. Collects Core Web Vitals and
 * resource metrics directly via Chrome DevTools Protocol.
 */
class LighthouseAgent {
  constructor(config) {
    this.pages = config.pages || [];
    this.viewportPreset = config.viewport || 'desktop';
    this.browser = null;
    this.results = [];
  }

  async init() {
    const { browser } = await createBrowser({ extraArgs: ['--disable-extensions'] });
    this.browser = browser;
  }

  async auditPage(url, name) {
    const page = await this.browser.newPage();
    const viewport = this.viewportPreset === 'mobile'
      ? { width: 375, height: 812, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }
      : { width: 1920, height: 1080, deviceScaleFactor: 1 };
    await page.setViewport(viewport);

    if (this.viewportPreset === 'mobile') {
      await page.setUserAgent(
        'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1'
      );
    }

    const client = await page.createCDPSession();
    await client.send('Performance.enable');

    // Set up resource tracking
    const resources = [];
    let requestCount = 0;

    page.on('response', async (response) => {
      requestCount++;
      try {
        const headers = response.headers();
        const contentLength = parseInt(headers['content-length'] || '0', 10);
        const contentType = headers['content-type'] || '';
        const reqUrl = response.url();

        let type = 'other';
        if (contentType.includes('javascript') || reqUrl.endsWith('.js')) type = 'js';
        else if (contentType.includes('css') || reqUrl.endsWith('.css')) type = 'css';
        else if (contentType.includes('image') || /\.(png|jpe?g|gif|webp|svg|ico|avif)/.test(reqUrl)) type = 'img';
        else if (contentType.includes('font') || /\.(woff2?|ttf|otf|eot)/.test(reqUrl)) type = 'font';

        resources.push({ url: reqUrl, type, size: contentLength });
      } catch {
        // Response may have been aborted
      }
    });

    // Inject PerformanceObserver for LCP and CLS before navigation
    await page.evaluateOnNewDocument(() => {
      window.__perf = { lcp: 0, cls: 0, fcpTime: 0, inp: 0, worstInteraction: null };

      const lcpObserver = new PerformanceObserver((list) => {
        const entries = list.getEntries();
        if (entries.length > 0) {
          window.__perf.lcp = entries[entries.length - 1].startTime;
        }
      });
      lcpObserver.observe({ type: 'largest-contentful-paint', buffered: true });

      const clsObserver = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          if (!entry.hadRecentInput) {
            window.__perf.cls += entry.value;
          }
        }
      });
      clsObserver.observe({ type: 'layout-shift', buffered: true });

      const paintObserver = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          if (entry.name === 'first-contentful-paint') {
            window.__perf.fcpTime = entry.startTime;
          }
        }
      });
      paintObserver.observe({ type: 'paint', buffered: true });

      const inpObserver = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          // Filter to real interactions (Event Timing API requirement)
          if (!entry.interactionId) continue;

          if (entry.duration > window.__perf.inp) {
            window.__perf.inp = entry.duration;
            window.__perf.worstInteraction = {
              name: entry.name,              // e.g., 'pointerdown', 'click', 'keydown'
              duration: entry.duration,       // Total latency (Core Web Vital)
              inputDelay: entry.processingStart - entry.startTime,
              processingTime: entry.processingEnd - entry.processingStart,
              presentationDelay: entry.duration - (entry.processingEnd - entry.startTime),
            };
          }
        }
      });
      inpObserver.observe({ type: 'event', buffered: true, durationThreshold: 40 });
    });

    let metrics = {
      ttfb: 0,
      fcp: 0,
      lcp: 0,
      cls: 0,
      inp: 0,
      domInteractive: 0,
      domComplete: 0,
      loadTime: 0,
      jsHeapSize: 0,
      domNodes: 0,
      layoutCount: 0,
      totalRequests: 0,
      totalTransferSize: 0,
      resourceBreakdown: { js: 0, css: 0, img: 0, font: 0, other: 0 },
    };

    try {
      const navStart = Date.now();
      await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });
      // Allow late-firing observers to settle
      await new Promise((r) => setTimeout(r, 2000));
      const wallTime = Date.now() - navStart;

      // Collect Performance timing via page context
      const timing = await page.evaluate(() => {
        const nav = performance.getEntriesByType('navigation')[0] || {};
        return {
          ttfb: nav.responseStart || 0,
          domInteractive: nav.domInteractive || 0,
          domComplete: nav.domContentLoadedEventEnd || 0,
          loadTime: nav.loadEventEnd || 0,
          domNodes: document.querySelectorAll('*').length,
        };
      });

      // Collect LCP and CLS from injected observers
      const perfData = await page.evaluate(() => window.__perf);

      // Collect CDP Performance.getMetrics
      const cdpMetrics = await client.send('Performance.getMetrics');
      const cdpMap = {};
      for (const m of cdpMetrics.metrics) {
        cdpMap[m.name] = m.value;
      }

      // Aggregate resource sizes
      const breakdown = { js: 0, css: 0, img: 0, font: 0, other: 0 };
      let totalSize = 0;
      for (const r of resources) {
        totalSize += r.size;
        if (breakdown[r.type] !== undefined) {
          breakdown[r.type] += r.size;
        } else {
          breakdown.other += r.size;
        }
      }

      metrics = {
        ttfb: Math.round(timing.ttfb),
        fcp: Math.round(perfData.fcpTime || 0),
        lcp: Math.round(perfData.lcp || 0),
        cls: parseFloat((perfData.cls || 0).toFixed(4)),
        inp: Math.round(perfData.inp || 0),
        domInteractive: Math.round(timing.domInteractive),
        domComplete: Math.round(timing.domComplete),
        loadTime: timing.loadTime > 0 ? Math.round(timing.loadTime) : wallTime,
        jsHeapSize: Math.round((cdpMap['JSHeapUsedSize'] || 0) / 1024),
        domNodes: timing.domNodes,
        layoutCount: cdpMap['LayoutCount'] || 0,
        totalRequests: requestCount,
        totalTransferSize: totalSize,
        resourceBreakdown: {
          js: breakdown.js,
          css: breakdown.css,
          img: breakdown.img,
          font: breakdown.font,
          other: breakdown.other,
        },
      };
    } catch (err) {
      console.error(`[Lighthouse] Error auditing ${url}:`, err.message);
    }

    await client.detach();
    await page.close();

    const scores = this._scoreMetrics(metrics);

    const result = { url, name, metrics, scores };
    this.results.push(result);
    return result;
  }

  _scoreMetrics(m) {
    const score = (value, goodThreshold, poorThreshold) => {
      if (value <= goodThreshold) return 'good';
      if (value <= poorThreshold) return 'needs-improvement';
      return 'poor';
    };

    return {
      lcp: score(m.lcp, 2500, 4000),
      cls: score(m.cls, 0.1, 0.25),
      ttfb: score(m.ttfb, 800, 1800),
      fcp: score(m.fcp, 1800, 3000),
      loadTime: score(m.loadTime, 3000, 6000),
    };
  }

  async auditAll() {
    if (!this.browser) {
      throw new Error('Browser not initialized. Call init() first.');
    }

    console.log(`[Lighthouse] Auditing ${this.pages.length} page(s) (${this.viewportPreset})`);

    for (const entry of this.pages) {
      const url = typeof entry === 'string' ? entry : entry.url;
      const name = typeof entry === 'string' ? entry : (entry.name || entry.url);
      console.log(`[Lighthouse] Auditing: ${name || url}`);
      await this.auditPage(url, name || url);
    }

    console.log(`[Lighthouse] Complete. ${this.results.length} page(s) audited.`);
    return this.results;
  }

  async close() {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
    return this.results;
  }
}

module.exports = LighthouseAgent;
