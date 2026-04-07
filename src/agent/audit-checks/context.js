'use strict';

const https = require('https');
const http = require('http');
const { URL } = require('url');

/**
 * AuditContext — shared helpers and state for audit check modules.
 * Each check module receives an instance of this class as its `ctx` parameter.
 */
class AuditContext {
  constructor(config) {
    this.baseUrl = config.baseUrl;
    this.profile = config.profile || {};
    this.useKhai = config.useKhai || false;
    this.khaiPort = config.khaiPort || 3001;
    this.siteName = config.siteName || new URL(config.baseUrl).hostname;
    this.categories = config.categories || null; // null = run all
    this.results = {
      categories: {},
      summary: { total: 0, passed: 0, failed: 0, warnings: 0, skipped: 0 },
    };
  }

  // ===========================
  // HTTP helpers
  // ===========================

  /** Make an HTTP(S) request returning { status, headers, body, redirectUrl, timing } */
  _request(url, options = {}) {
    return new Promise((resolve, reject) => {
      const parsedUrl = new URL(url);
      const mod = parsedUrl.protocol === 'https:' ? https : http;
      const startMs = Date.now();

      const reqOpts = {
        method: options.method || 'GET',
        headers: options.headers || {},
        timeout: options.timeout || 15000,
        // Don't follow redirects so we can inspect them
        ...(options.followRedirects === false ? {} : {}),
      };

      const req = mod.request(url, reqOpts, (res) => {
        let body = '';
        res.on('data', (chunk) => (body += chunk));
        res.on('end', () => {
          resolve({
            status: res.statusCode,
            headers: res.headers,
            body,
            redirectUrl: res.headers.location || null,
            timing: Date.now() - startMs,
            url,
          });
        });
      });

      req.on('timeout', () => {
        req.destroy();
        reject(new Error(`Request timeout: ${url}`));
      });

      req.on('error', (err) => reject(err));

      if (options.body) req.write(options.body);
      req.end();
    });
  }

  /** Follow redirects manually, returning the chain */
  async _followRedirects(url, maxRedirects = 10) {
    const chain = [];
    let currentUrl = url;
    for (let i = 0; i < maxRedirects; i++) {
      try {
        const res = await this._request(currentUrl);
        chain.push({ url: currentUrl, status: res.status, location: res.redirectUrl });
        if (res.status >= 300 && res.status < 400 && res.redirectUrl) {
          currentUrl = new URL(res.redirectUrl, currentUrl).href;
        } else {
          break;
        }
      } catch (err) {
        chain.push({ url: currentUrl, error: err.message });
        break;
      }
    }
    return chain;
  }

  /** Call Khai API */
  async _khaiRequest(endpoint, method = 'GET', body = null) {
    const url = `http://localhost:${this.khaiPort}${endpoint}`;
    const options = { method, headers: { 'Content-Type': 'application/json' } };
    if (body) options.body = JSON.stringify(body);

    return new Promise((resolve, reject) => {
      const req = http.request(url, options, (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          try { resolve(JSON.parse(data)); }
          catch { resolve(data); }
        });
      });
      req.on('error', reject);
      req.on('timeout', () => { req.destroy(); reject(new Error('Khai request timeout')); });
      if (body) req.write(JSON.stringify(body));
      req.end();
    });
  }

  /** Check if Khai is running */
  async _isKhaiAvailable() {
    try {
      await this._khaiRequest('/api/sites');
      return true;
    } catch {
      return false;
    }
  }

  // ===========================
  // Test result helpers
  // ===========================

  _addResult(category, test, status, detail = '') {
    if (!this.results.categories[category]) {
      this.results.categories[category] = { tests: [], passed: 0, failed: 0, warnings: 0, skipped: 0 };
    }
    const cat = this.results.categories[category];
    cat.tests.push({ test, status, detail, timestamp: new Date().toISOString() });

    this.results.summary.total++;
    if (status === 'pass') { cat.passed++; this.results.summary.passed++; }
    else if (status === 'fail') { cat.failed++; this.results.summary.failed++; }
    else if (status === 'warn') { cat.warnings++; this.results.summary.warnings++; }
    else if (status === 'skip') { cat.skipped++; this.results.summary.skipped++; }
  }

  _shouldRun(category) {
    if (!this.categories) return true;
    return this.categories.includes(category);
  }
}

module.exports = { AuditContext };
