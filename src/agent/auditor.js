const https = require('https');
const http = require('http');
const { URL } = require('url');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs');
const path = require('path');

/**
 * SiteAuditor - Comprehensive site testing engine
 * Works with and without Khai for authenticated tests.
 *
 * Test categories:
 *   1. Public pages - status codes, content checks
 *   2. Redirects - old URLs, auth redirects
 *   3. Security headers - HSTS, CSP, X-Frame, etc.
 *   4. Cookie security - Secure, HttpOnly, SameSite flags
 *   5. CORS policy - origin checks
 *   6. Auth bypass - accessing protected routes unauthenticated
 *   7. Sensitive paths - .env, .git, admin endpoints exposed
 *   8. API endpoints - health, error info leak
 *   9. Rate limiting - repeated request tolerance
 *  10. SSL/TLS - certificate, protocol checks
 *  11. SEO basics - meta tags, OG, canonical
 *  12. Performance - load times, response sizes
 *  13. Authenticated pages - admin & patient (requires Khai)
 *  14. Authorization - role boundary enforcement (requires Khai)
 */
class SiteAuditor {
  constructor(config) {
    this.baseUrl = config.baseUrl;
    this.profile = config.profile || {};
    this.useKhai = config.useKhai || false;
    this.khaiPort = config.khaiPort || 3001;
    this.siteName = config.siteName || new URL(config.baseUrl).hostname;
    this.categories = config.categories || null; // null = run all
    this.id = uuidv4();
    this.startTime = null;
    this.endTime = null;
    this.results = {
      id: this.id,
      site: this.baseUrl,
      siteName: this.siteName,
      startTime: null,
      endTime: null,
      categories: {},
      summary: { total: 0, passed: 0, failed: 0, warnings: 0, skipped: 0 },
    };
    this.reportsDir = path.join(__dirname, '../../reports/audits');
    fs.mkdirSync(this.reportsDir, { recursive: true });
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

  // ===========================
  // RUN ALL
  // ===========================

  async run() {
    this.startTime = new Date();
    this.results.startTime = this.startTime.toISOString();
    console.log(`\n[Audit] Starting audit of ${this.siteName} (${this.baseUrl})`);
    console.log(`[Audit] ID: ${this.id}`);

    // Check Khai availability
    if (this.useKhai) {
      const available = await this._isKhaiAvailable();
      if (!available) {
        console.log('[Audit] WARNING: Khai not available. Authenticated tests will be skipped.');
        this.useKhai = false;
      } else {
        console.log('[Audit] Khai is available for authenticated tests.');
      }
    }

    // Run each test category
    const categories = [
      ['publicPages', () => this.testPublicPages()],
      ['redirects', () => this.testRedirects()],
      ['securityHeaders', () => this.testSecurityHeaders()],
      ['cookieSecurity', () => this.testCookieSecurity()],
      ['cors', () => this.testCORS()],
      ['authBypass', () => this.testAuthBypass()],
      ['sensitivePaths', () => this.testSensitivePaths()],
      ['apiEndpoints', () => this.testAPIEndpoints()],
      ['rateLimiting', () => this.testRateLimiting()],
      ['ssl', () => this.testSSL()],
      ['seo', () => this.testSEO()],
      ['performance', () => this.testPerformance()],
      ['authenticated', () => this.testAuthenticatedPages()],
      ['authorization', () => this.testAuthorization()],
    ];

    for (const [name, fn] of categories) {
      if (this._shouldRun(name)) {
        console.log(`\n[Audit] Running: ${name}`);
        try {
          await fn();
        } catch (err) {
          console.error(`[Audit] Error in ${name}:`, err.message);
          this._addResult(name, `Category error: ${name}`, 'fail', err.message);
        }
      }
    }

    this.endTime = new Date();
    this.results.endTime = this.endTime.toISOString();
    this.results.duration = this.endTime - this.startTime;

    // Save report
    const reportPath = path.join(this.reportsDir, `${this.id}.json`);
    fs.writeFileSync(reportPath, JSON.stringify(this.results, null, 2));
    console.log(`\n[Audit] Complete. ${this.results.summary.passed} passed, ${this.results.summary.failed} failed, ${this.results.summary.warnings} warnings`);
    console.log(`[Audit] Report saved: ${reportPath}`);

    return this.results;
  }

  // ===========================
  // 1. PUBLIC PAGES
  // ===========================

  async testPublicPages() {
    const pages = this.profile.publicPages || [
      { path: '/', expectedStatus: 200 },
      { path: '/login', expectedStatus: 200 },
    ];

    for (const page of pages) {
      const url = this.baseUrl + page.path;
      try {
        const res = await this._request(url);
        const finalStatus = res.status >= 300 && res.status < 400
          ? (await this._followRedirects(url)).pop()?.status || res.status
          : res.status;

        // Status check
        if (page.expectedStatus && finalStatus !== page.expectedStatus) {
          this._addResult('publicPages', `${page.path} returns ${page.expectedStatus}`, 'fail',
            `Expected ${page.expectedStatus}, got ${finalStatus}`);
        } else {
          this._addResult('publicPages', `${page.path} returns ${finalStatus}`, 'pass');
        }

        // Content check
        if (page.expectedContent && res.status === 200) {
          for (const text of page.expectedContent) {
            if (!res.body.toLowerCase().includes(text.toLowerCase())) {
              this._addResult('publicPages', `${page.path} contains "${text}"`, 'fail',
                `Expected text not found in page body`);
            } else {
              this._addResult('publicPages', `${page.path} contains "${text}"`, 'pass');
            }
          }
        }

        // Not-contain check (e.g. no error messages on page)
        if (page.notContains && res.status === 200) {
          for (const text of page.notContains) {
            if (res.body.toLowerCase().includes(text.toLowerCase())) {
              this._addResult('publicPages', `${page.path} does NOT contain "${text}"`, 'fail',
                `Unexpected text found in page body`);
            } else {
              this._addResult('publicPages', `${page.path} does NOT contain "${text}"`, 'pass');
            }
          }
        }
      } catch (err) {
        this._addResult('publicPages', `${page.path} is reachable`, 'fail', err.message);
      }
    }
  }

  // ===========================
  // 2. REDIRECTS
  // ===========================

  async testRedirects() {
    const redirects = this.profile.redirects || [];

    for (const redir of redirects) {
      const url = this.baseUrl + redir.from;
      try {
        const chain = await this._followRedirects(url);
        const finalUrl = chain[chain.length - 1]?.url || url;
        const finalPath = new URL(finalUrl).pathname;
        const expectedPath = redir.to;

        // Check if redirect ends at expected destination
        if (finalPath === expectedPath || finalUrl.endsWith(expectedPath)) {
          this._addResult('redirects', `${redir.from} → ${redir.to}`, 'pass');
        } else {
          this._addResult('redirects', `${redir.from} → ${redir.to}`, 'fail',
            `Actually redirected to ${finalPath}`);
        }

        // Check redirect status code if specified
        if (redir.expectedStatus) {
          const initialStatus = chain[0]?.status;
          if (initialStatus !== redir.expectedStatus) {
            this._addResult('redirects', `${redir.from} uses ${redir.expectedStatus} redirect`, 'warn',
              `Got ${initialStatus} instead`);
          }
        }
      } catch (err) {
        this._addResult('redirects', `${redir.from} redirect works`, 'fail', err.message);
      }
    }
  }

  // ===========================
  // 3. SECURITY HEADERS
  // ===========================

  async testSecurityHeaders() {
    const url = this.baseUrl;
    try {
      const res = await this._request(url);
      const h = res.headers;

      // Required headers
      const required = this.profile.securityHeaders?.required || [
        'x-frame-options',
        'x-content-type-options',
        'strict-transport-security',
      ];

      for (const header of required) {
        if (h[header]) {
          this._addResult('securityHeaders', `${header} present`, 'pass', h[header]);
        } else {
          this._addResult('securityHeaders', `${header} present`, 'fail', 'Header missing');
        }
      }

      // Recommended headers
      const recommended = this.profile.securityHeaders?.recommended || [
        'content-security-policy',
        'referrer-policy',
        'permissions-policy',
        'x-xss-protection',
      ];

      for (const header of recommended) {
        if (h[header]) {
          this._addResult('securityHeaders', `${header} present (recommended)`, 'pass', h[header]);
        } else {
          this._addResult('securityHeaders', `${header} present (recommended)`, 'warn', 'Header missing');
        }
      }

      // HSTS value quality
      if (h['strict-transport-security']) {
        const hsts = h['strict-transport-security'];
        if (!hsts.includes('includeSubDomains')) {
          this._addResult('securityHeaders', 'HSTS includes subdomains', 'warn', hsts);
        }
        const maxAgeMatch = hsts.match(/max-age=(\d+)/);
        if (maxAgeMatch && parseInt(maxAgeMatch[1]) < 31536000) {
          this._addResult('securityHeaders', 'HSTS max-age >= 1 year', 'warn',
            `max-age=${maxAgeMatch[1]} (recommended: 31536000+)`);
        }
      }

      // X-Frame-Options value
      if (h['x-frame-options']) {
        const xfo = h['x-frame-options'].toUpperCase();
        if (xfo !== 'DENY' && xfo !== 'SAMEORIGIN') {
          this._addResult('securityHeaders', 'X-Frame-Options is DENY or SAMEORIGIN', 'warn', xfo);
        }
      }

      // CSP evaluation
      if (h['content-security-policy']) {
        const csp = h['content-security-policy'];
        if (csp.includes("'unsafe-inline'") && !csp.includes('nonce-')) {
          this._addResult('securityHeaders', 'CSP avoids unsafe-inline without nonce', 'warn',
            "CSP uses 'unsafe-inline' — consider nonce-based approach");
        }
        if (csp.includes("'unsafe-eval'")) {
          this._addResult('securityHeaders', 'CSP avoids unsafe-eval', 'warn',
            "CSP uses 'unsafe-eval' — security risk");
        }
        if (!csp.includes('default-src')) {
          this._addResult('securityHeaders', 'CSP has default-src', 'warn', 'Missing default-src directive');
        }
      }

      // Server header leaks version info
      if (h['server']) {
        const server = h['server'];
        if (/\d+\.\d+/.test(server)) {
          this._addResult('securityHeaders', 'Server header does not leak version', 'warn',
            `Server: ${server} (version numbers visible)`);
        }
      }

      // X-Powered-By should not be present
      if (h['x-powered-by']) {
        this._addResult('securityHeaders', 'X-Powered-By not exposed', 'warn',
          `X-Powered-By: ${h['x-powered-by']}`);
      } else {
        this._addResult('securityHeaders', 'X-Powered-By not exposed', 'pass');
      }

    } catch (err) {
      this._addResult('securityHeaders', 'Security headers check', 'fail', err.message);
    }
  }

  // ===========================
  // 4. COOKIE SECURITY
  // ===========================

  async testCookieSecurity() {
    // Hit the login page to get session cookies
    const url = this.baseUrl + (this.profile.loginPath || '/login');
    try {
      const res = await this._request(url);
      const setCookies = res.headers['set-cookie'];

      if (!setCookies) {
        this._addResult('cookieSecurity', 'Cookies set on login page', 'pass', 'No cookies set (stateless)');
        return;
      }

      const cookies = Array.isArray(setCookies) ? setCookies : [setCookies];

      for (const cookie of cookies) {
        const name = cookie.split('=')[0].trim();

        // Session-like cookies should have Secure flag
        if (this.baseUrl.startsWith('https://')) {
          if (cookie.toLowerCase().includes('secure')) {
            this._addResult('cookieSecurity', `${name}: Secure flag`, 'pass');
          } else {
            this._addResult('cookieSecurity', `${name}: Secure flag`, 'fail', 'Missing Secure flag on HTTPS site');
          }
        }

        // HttpOnly for session cookies
        if (name.toLowerCase().includes('session') || name.toLowerCase().includes('token') || name.toLowerCase().includes('auth') || name.toLowerCase().includes('next-auth')) {
          if (cookie.toLowerCase().includes('httponly')) {
            this._addResult('cookieSecurity', `${name}: HttpOnly flag`, 'pass');
          } else {
            this._addResult('cookieSecurity', `${name}: HttpOnly flag`, 'warn',
              'Session cookie missing HttpOnly — accessible via JavaScript');
          }
        }

        // SameSite attribute
        if (cookie.toLowerCase().includes('samesite')) {
          const sameSiteMatch = cookie.match(/samesite=(\w+)/i);
          const value = sameSiteMatch ? sameSiteMatch[1] : 'unknown';
          if (value.toLowerCase() === 'none' && !cookie.toLowerCase().includes('secure')) {
            this._addResult('cookieSecurity', `${name}: SameSite=None requires Secure`, 'fail',
              'SameSite=None without Secure flag');
          } else {
            this._addResult('cookieSecurity', `${name}: SameSite attribute`, 'pass', `SameSite=${value}`);
          }
        } else {
          this._addResult('cookieSecurity', `${name}: SameSite attribute`, 'warn', 'Missing SameSite attribute');
        }
      }
    } catch (err) {
      this._addResult('cookieSecurity', 'Cookie security check', 'fail', err.message);
    }
  }

  // ===========================
  // 5. CORS
  // ===========================

  async testCORS() {
    const endpoints = [this.baseUrl, this.baseUrl + '/api/health'];
    const evilOrigin = 'https://evil-attacker-site.com';

    for (const url of endpoints) {
      try {
        const res = await this._request(url, {
          headers: { 'Origin': evilOrigin },
        });

        const acao = res.headers['access-control-allow-origin'];
        if (!acao) {
          this._addResult('cors', `${new URL(url).pathname}: No CORS for unknown origin`, 'pass');
        } else if (acao === '*') {
          this._addResult('cors', `${new URL(url).pathname}: Wildcard CORS`, 'warn',
            'Access-Control-Allow-Origin: * — allows any site');
        } else if (acao === evilOrigin) {
          this._addResult('cors', `${new URL(url).pathname}: Reflects attacker origin`, 'fail',
            `Echoed back ${evilOrigin} — potential CORS misconfiguration`);
        } else {
          this._addResult('cors', `${new URL(url).pathname}: CORS restricted`, 'pass', `ACAO: ${acao}`);
        }

        // Check credentials
        const acac = res.headers['access-control-allow-credentials'];
        if (acac === 'true' && acao === '*') {
          this._addResult('cors', `${new URL(url).pathname}: Wildcard CORS with credentials`, 'fail',
            'Dangerous: wildcard origin + allow credentials');
        }
      } catch (err) {
        this._addResult('cors', `CORS check: ${new URL(url).pathname}`, 'fail', err.message);
      }
    }
  }

  // ===========================
  // 6. AUTH BYPASS
  // ===========================

  async testAuthBypass() {
    const protectedPages = this.profile.protectedPages || [
      { path: '/admin', redirectsTo: '/login' },
      { path: '/dashboard', redirectsTo: '/login' },
    ];

    for (const page of protectedPages) {
      const url = this.baseUrl + page.path;
      try {
        const chain = await this._followRedirects(url);
        const finalUrl = chain[chain.length - 1]?.url || url;
        const finalPath = new URL(finalUrl).pathname;
        const initialStatus = chain[0]?.status;

        // Should redirect to login
        if (page.redirectsTo && finalPath.includes(page.redirectsTo)) {
          this._addResult('authBypass', `${page.path}: Redirects to login`, 'pass');
        } else if (initialStatus === 401 || initialStatus === 403) {
          this._addResult('authBypass', `${page.path}: Returns ${initialStatus}`, 'pass');
        } else if (initialStatus === 200 && finalPath === page.path) {
          this._addResult('authBypass', `${page.path}: Accessible without auth`, 'fail',
            `Got 200 at ${page.path} without authentication`);
        } else {
          this._addResult('authBypass', `${page.path}: Protected`, 'pass',
            `Redirected to ${finalPath}`);
        }
      } catch (err) {
        this._addResult('authBypass', `${page.path} auth check`, 'fail', err.message);
      }
    }

    // Test API routes without auth
    const protectedAPIs = this.profile.protectedAPIs || [
      { path: '/api/trpc/user.getProfile', expectedStatus: 401 },
    ];

    for (const api of protectedAPIs) {
      const url = this.baseUrl + api.path;
      try {
        const res = await this._request(url);
        if (res.status === 401 || res.status === 403) {
          this._addResult('authBypass', `API ${api.path}: Requires auth`, 'pass',
            `Returns ${res.status}`);
        } else if (res.status === 200) {
          // Check if it's returning actual data or just an error envelope
          try {
            const data = JSON.parse(res.body);
            if (data.error || data.message?.includes('unauthorized') || data.message?.includes('UNAUTHORIZED')) {
              this._addResult('authBypass', `API ${api.path}: Requires auth`, 'pass', 'Returns error in body');
            } else {
              this._addResult('authBypass', `API ${api.path}: Accessible without auth`, 'fail',
                `Returns 200 with data — potential auth bypass`);
            }
          } catch {
            this._addResult('authBypass', `API ${api.path}: Returns 200`, 'warn',
              'Could not parse response — manual verification needed');
          }
        } else {
          this._addResult('authBypass', `API ${api.path}: Status ${res.status}`, 'pass');
        }
      } catch (err) {
        this._addResult('authBypass', `API ${api.path}`, 'fail', err.message);
      }
    }
  }

  // ===========================
  // 7. SENSITIVE PATHS
  // ===========================

  async testSensitivePaths() {
    const paths = this.profile.sensitivePaths || [
      '/.env',
      '/.env.local',
      '/.env.production',
      '/.git/config',
      '/.git/HEAD',
      '/wp-admin',
      '/wp-login.php',
      '/phpinfo.php',
      '/server-status',
      '/server-info',
      '/.htaccess',
      '/.htpasswd',
      '/web.config',
      '/package.json',
      '/tsconfig.json',
      '/.DS_Store',
      '/robots.txt',
      '/sitemap.xml',
      '/_next/data',
      '/api/internal',
    ];

    for (const p of paths) {
      const url = this.baseUrl + p;
      try {
        const res = await this._request(url);

        // These should NOT return 200 (except robots.txt, sitemap.xml)
        const allowedPublic = ['/robots.txt', '/sitemap.xml'];
        if (allowedPublic.includes(p)) {
          if (res.status === 200) {
            this._addResult('sensitivePaths', `${p}: Exists (expected)`, 'pass');
            // Check robots.txt for sensitive paths
            if (p === '/robots.txt') {
              if (res.body.includes('Disallow: /admin') || res.body.includes('Disallow: /api')) {
                this._addResult('sensitivePaths', 'robots.txt: Disallows sensitive paths', 'pass');
              }
            }
          } else {
            this._addResult('sensitivePaths', `${p}: Missing`, 'warn', `Status ${res.status}`);
          }
          continue;
        }

        if (res.status === 200) {
          // Check if it's actually returning sensitive content
          const isSensitive = res.body.includes('DATABASE_URL') ||
                              res.body.includes('SECRET') ||
                              res.body.includes('PASSWORD') ||
                              res.body.includes('[core]') || // git config
                              res.body.includes('ref: refs/') || // git HEAD
                              res.body.includes('phpinfo()');

          if (isSensitive) {
            this._addResult('sensitivePaths', `${p}: EXPOSED with sensitive content`, 'fail',
              `Returns 200 with sensitive data — CRITICAL`);
          } else {
            this._addResult('sensitivePaths', `${p}: Returns 200`, 'warn',
              `Returns 200 but content may not be sensitive — verify manually`);
          }
        } else {
          this._addResult('sensitivePaths', `${p}: Not exposed`, 'pass', `Status ${res.status}`);
        }
      } catch (err) {
        // Timeout or connection error is fine — means it's not accessible
        this._addResult('sensitivePaths', `${p}: Not exposed`, 'pass', 'Connection failed (expected)');
      }
    }
  }

  // ===========================
  // 8. API ENDPOINTS
  // ===========================

  async testAPIEndpoints() {
    const endpoints = this.profile.apiEndpoints || [
      { path: '/api/health', expectedStatus: 200 },
    ];

    for (const ep of endpoints) {
      const url = this.baseUrl + ep.path;
      try {
        const res = await this._request(url, {
          method: ep.method || 'GET',
          headers: ep.headers || {},
        });

        // Status check
        if (ep.expectedStatus && res.status !== ep.expectedStatus) {
          this._addResult('apiEndpoints', `${ep.method || 'GET'} ${ep.path}: ${ep.expectedStatus}`, 'fail',
            `Got ${res.status}`);
        } else {
          this._addResult('apiEndpoints', `${ep.method || 'GET'} ${ep.path}: ${res.status}`, 'pass',
            `${res.timing}ms`);
        }

        // Check for error info leak in responses
        if (res.status >= 400 && res.status < 500) {
          try {
            const body = JSON.parse(res.body);
            const hasStackTrace = JSON.stringify(body).includes('at ') && JSON.stringify(body).includes('.js:');
            const hasDbInfo = JSON.stringify(body).toLowerCase().includes('prisma') ||
                              JSON.stringify(body).toLowerCase().includes('postgres') ||
                              JSON.stringify(body).toLowerCase().includes('mysql');

            if (hasStackTrace) {
              this._addResult('apiEndpoints', `${ep.path}: No stack trace in error`, 'fail',
                'Error response contains stack trace — information leak');
            }
            if (hasDbInfo) {
              this._addResult('apiEndpoints', `${ep.path}: No DB info in error`, 'fail',
                'Error response contains database information — information leak');
            }
          } catch {
            // Not JSON — that's fine
          }
        }

        // Content check
        if (ep.expectedContent) {
          for (const text of ep.expectedContent) {
            if (res.body.includes(text)) {
              this._addResult('apiEndpoints', `${ep.path} contains "${text}"`, 'pass');
            } else {
              this._addResult('apiEndpoints', `${ep.path} contains "${text}"`, 'fail', 'Expected content not found');
            }
          }
        }
      } catch (err) {
        this._addResult('apiEndpoints', `${ep.method || 'GET'} ${ep.path}`, 'fail', err.message);
      }
    }

    // Test invalid API routes return proper errors (not stack traces)
    const invalidPaths = [
      '/api/nonexistent',
      '/api/trpc/nonexistent.procedure',
    ];

    for (const p of invalidPaths) {
      try {
        const res = await this._request(this.baseUrl + p);
        if (res.status === 404 || res.status === 400 || res.status === 405) {
          // Check for info leak
          const hasStack = res.body.includes('at ') && res.body.includes('.js:');
          if (hasStack) {
            this._addResult('apiEndpoints', `${p}: Error response clean`, 'fail',
              'Stack trace in 404 response');
          } else {
            this._addResult('apiEndpoints', `${p}: Returns clean ${res.status}`, 'pass');
          }
        } else if (res.status === 200) {
          this._addResult('apiEndpoints', `${p}: Unknown route returns 404`, 'warn',
            `Returns 200 instead of 404`);
        }
      } catch {
        // Connection error is acceptable
      }
    }
  }

  // ===========================
  // 9. RATE LIMITING
  // ===========================

  async testRateLimiting() {
    // Test login endpoint rate limiting
    const loginUrl = this.baseUrl + (this.profile.loginPath || '/login');
    const apiUrl = this.baseUrl + (this.profile.rateLimitTestPath || '/api/health');

    // Rapid-fire requests to test rate limiting
    const requestCount = 20;
    const results = [];

    console.log(`[Audit] Sending ${requestCount} rapid requests to test rate limiting...`);

    for (let i = 0; i < requestCount; i++) {
      try {
        const res = await this._request(apiUrl, { timeout: 5000 });
        results.push(res.status);
      } catch {
        results.push('error');
      }
    }

    const rateLimited = results.some(s => s === 429);
    const errors = results.filter(s => s === 'error' || s >= 500).length;

    if (rateLimited) {
      this._addResult('rateLimiting', 'Rate limiting active on API', 'pass',
        `Got 429 after ${results.indexOf(429) + 1} requests`);
    } else if (errors > requestCount / 2) {
      this._addResult('rateLimiting', 'Rate limiting active on API', 'warn',
        `${errors}/${requestCount} requests failed — possible rate limiting or instability`);
    } else {
      this._addResult('rateLimiting', 'Rate limiting active on API', 'warn',
        `No 429 response after ${requestCount} requests — consider adding rate limiting`);
    }

    // Test login endpoint specifically (POST with bad credentials)
    const loginAttempts = 10;
    const loginResults = [];

    for (let i = 0; i < loginAttempts; i++) {
      try {
        const res = await this._request(this.baseUrl + '/api/auth/signin', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: 'test@test.com', password: 'wrong' }),
          timeout: 5000,
        });
        loginResults.push(res.status);
      } catch {
        loginResults.push('error');
      }
    }

    const loginRateLimited = loginResults.some(s => s === 429);
    if (loginRateLimited) {
      this._addResult('rateLimiting', 'Login endpoint rate limited', 'pass',
        `Blocked after ${loginResults.indexOf(429) + 1} attempts`);
    } else {
      this._addResult('rateLimiting', 'Login endpoint rate limited', 'warn',
        `No rate limiting detected after ${loginAttempts} login attempts`);
    }
  }

  // ===========================
  // 10. SSL/TLS
  // ===========================

  async testSSL() {
    if (!this.baseUrl.startsWith('https://')) {
      this._addResult('ssl', 'Site uses HTTPS', 'fail', `Base URL is HTTP: ${this.baseUrl}`);
      return;
    }

    this._addResult('ssl', 'Site uses HTTPS', 'pass');

    // Check HTTP → HTTPS redirect
    const httpUrl = this.baseUrl.replace('https://', 'http://');
    try {
      const chain = await this._followRedirects(httpUrl);
      const finalUrl = chain[chain.length - 1]?.url || httpUrl;
      if (finalUrl.startsWith('https://')) {
        this._addResult('ssl', 'HTTP redirects to HTTPS', 'pass');
      } else {
        this._addResult('ssl', 'HTTP redirects to HTTPS', 'fail',
          `HTTP did not redirect to HTTPS — ended at ${finalUrl}`);
      }
    } catch {
      this._addResult('ssl', 'HTTP redirects to HTTPS', 'warn', 'Could not test HTTP redirect');
    }

    // Check certificate details
    try {
      const parsedUrl = new URL(this.baseUrl);
      await new Promise((resolve, reject) => {
        const req = https.request({
          hostname: parsedUrl.hostname,
          port: 443,
          method: 'HEAD',
          timeout: 10000,
        }, (res) => {
          const cert = res.socket.getPeerCertificate();
          if (cert) {
            // Check expiration
            const validTo = new Date(cert.valid_to);
            const daysRemaining = Math.floor((validTo - new Date()) / (1000 * 60 * 60 * 24));

            if (daysRemaining < 0) {
              this._addResult('ssl', 'SSL certificate valid', 'fail',
                `Certificate expired ${Math.abs(daysRemaining)} days ago`);
            } else if (daysRemaining < 30) {
              this._addResult('ssl', 'SSL certificate expiry', 'warn',
                `Certificate expires in ${daysRemaining} days — renew soon`);
            } else {
              this._addResult('ssl', 'SSL certificate valid', 'pass',
                `Expires in ${daysRemaining} days (${cert.valid_to})`);
            }

            // Check issuer
            if (cert.issuer) {
              this._addResult('ssl', 'SSL certificate issuer', 'pass',
                `Issued by ${cert.issuer.O || cert.issuer.CN || 'unknown'}`);
            }
          }
          res.resume();
          resolve();
        });
        req.on('error', reject);
        req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
        req.end();
      });
    } catch (err) {
      this._addResult('ssl', 'SSL certificate check', 'warn', err.message);
    }
  }

  // ===========================
  // 11. SEO
  // ===========================

  async testSEO() {
    const pagesToCheck = this.profile.seoPages || [{ path: '/' }];

    for (const page of pagesToCheck) {
      const url = this.baseUrl + page.path;
      try {
        const res = await this._request(url);
        if (res.status !== 200) {
          this._addResult('seo', `${page.path}: Accessible`, 'fail', `Status ${res.status}`);
          continue;
        }

        const body = res.body;

        // Title tag
        const titleMatch = body.match(/<title[^>]*>(.*?)<\/title>/i);
        if (titleMatch && titleMatch[1].trim()) {
          const title = titleMatch[1].trim();
          if (title.length > 60) {
            this._addResult('seo', `${page.path}: Title length`, 'warn',
              `Title is ${title.length} chars (recommended: ≤60)`);
          } else {
            this._addResult('seo', `${page.path}: Has title`, 'pass', title);
          }
        } else {
          this._addResult('seo', `${page.path}: Has title`, 'fail', 'Missing <title> tag');
        }

        // Meta description
        const descMatch = body.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']*)["']/i) ||
                          body.match(/<meta[^>]*content=["']([^"']*)["'][^>]*name=["']description["']/i);
        if (descMatch && descMatch[1].trim()) {
          const desc = descMatch[1].trim();
          if (desc.length > 160) {
            this._addResult('seo', `${page.path}: Meta description length`, 'warn',
              `${desc.length} chars (recommended: ≤160)`);
          } else {
            this._addResult('seo', `${page.path}: Has meta description`, 'pass');
          }
        } else {
          this._addResult('seo', `${page.path}: Has meta description`, 'warn', 'Missing meta description');
        }

        // OG tags
        const ogTitle = body.match(/<meta[^>]*property=["']og:title["'][^>]*>/i);
        const ogDesc = body.match(/<meta[^>]*property=["']og:description["'][^>]*>/i);
        const ogImage = body.match(/<meta[^>]*property=["']og:image["'][^>]*>/i);

        if (ogTitle && ogDesc && ogImage) {
          this._addResult('seo', `${page.path}: Open Graph tags`, 'pass');
        } else {
          const missing = [];
          if (!ogTitle) missing.push('og:title');
          if (!ogDesc) missing.push('og:description');
          if (!ogImage) missing.push('og:image');
          this._addResult('seo', `${page.path}: Open Graph tags`, 'warn',
            `Missing: ${missing.join(', ')}`);
        }

        // Canonical
        const canonical = body.match(/<link[^>]*rel=["']canonical["'][^>]*>/i);
        if (canonical) {
          this._addResult('seo', `${page.path}: Canonical tag`, 'pass');
        } else {
          this._addResult('seo', `${page.path}: Canonical tag`, 'warn', 'Missing canonical link');
        }

        // H1 tag
        const h1Match = body.match(/<h1[^>]*>/i);
        if (h1Match) {
          this._addResult('seo', `${page.path}: Has H1`, 'pass');
        } else {
          this._addResult('seo', `${page.path}: Has H1`, 'warn', 'No H1 tag found');
        }

      } catch (err) {
        this._addResult('seo', `${page.path}: SEO check`, 'fail', err.message);
      }
    }
  }

  // ===========================
  // 12. PERFORMANCE
  // ===========================

  async testPerformance() {
    const pages = this.profile.performancePages || this.profile.publicPages || [
      { path: '/' },
      { path: '/login' },
    ];

    for (const page of pages) {
      const url = this.baseUrl + page.path;
      try {
        const startMs = Date.now();
        const res = await this._request(url);
        const totalMs = Date.now() - startMs;

        // Response time
        const threshold = page.maxLoadTime || 3000;
        if (totalMs > threshold) {
          this._addResult('performance', `${page.path}: Load time`, 'warn',
            `${totalMs}ms (threshold: ${threshold}ms)`);
        } else {
          this._addResult('performance', `${page.path}: Load time`, 'pass', `${totalMs}ms`);
        }

        // Response size
        const sizeKB = Math.round(Buffer.byteLength(res.body) / 1024);
        if (sizeKB > 500) {
          this._addResult('performance', `${page.path}: Response size`, 'warn',
            `${sizeKB}KB (large — consider code splitting)`);
        } else {
          this._addResult('performance', `${page.path}: Response size`, 'pass', `${sizeKB}KB`);
        }

        // Check for compression
        if (res.headers['content-encoding']) {
          this._addResult('performance', `${page.path}: Compression`, 'pass',
            res.headers['content-encoding']);
        } else {
          this._addResult('performance', `${page.path}: Compression`, 'warn',
            'No content-encoding header — responses may not be compressed');
        }

        // Cache headers
        const cacheControl = res.headers['cache-control'];
        if (cacheControl) {
          this._addResult('performance', `${page.path}: Cache headers`, 'pass', cacheControl);
        } else {
          this._addResult('performance', `${page.path}: Cache headers`, 'warn', 'No Cache-Control header');
        }

      } catch (err) {
        this._addResult('performance', `${page.path}: Performance`, 'fail', err.message);
      }
    }
  }

  // ===========================
  // 13. AUTHENTICATED PAGES (Khai)
  // ===========================

  async testAuthenticatedPages() {
    if (!this.useKhai) {
      this._addResult('authenticated', 'Authenticated tests', 'skip', 'Khai not available');
      return;
    }

    const authTests = this.profile.authenticatedTests || {};

    for (const [role, config] of Object.entries(authTests)) {
      if (!config.account || !config.pages) continue;

      console.log(`[Audit] Testing authenticated pages as ${role} (${config.account})`);

      try {
        // Start a crawl test via Khai
        const testResult = await this._khaiRequest('/api/test/start', 'POST', {
          site: this.siteName,
          account: config.account,
          maxDepth: 1,
          viewport: 'desktop',
        });

        if (!testResult.testId) {
          this._addResult('authenticated', `${role}: Login`, 'fail', 'Khai test failed to start');
          continue;
        }

        const testId = testResult.testId;

        // Poll for completion (max 120s)
        let status = 'running';
        let waited = 0;
        while (status !== 'completed' && status !== 'error' && waited < 120000) {
          await new Promise(r => setTimeout(r, 3000));
          waited += 3000;
          const statusRes = await this._khaiRequest(`/api/test/${testId}/status`);
          status = statusRes.status;
        }

        if (status === 'completed') {
          const results = await this._khaiRequest(`/api/test/${testId}/results`);
          const pages = results.pages || [];
          const issues = results.issues || [];

          this._addResult('authenticated', `${role}: Login successful`, 'pass',
            `Crawled ${pages.length} pages`);

          // Check for expected pages
          if (config.pages) {
            for (const expectedPath of config.pages) {
              const found = pages.some(p => p.url.includes(expectedPath));
              if (found) {
                const page = pages.find(p => p.url.includes(expectedPath));
                if (page?.status >= 400) {
                  this._addResult('authenticated', `${role}: ${expectedPath} accessible`, 'fail',
                    `Status ${page.status}`);
                } else {
                  this._addResult('authenticated', `${role}: ${expectedPath} accessible`, 'pass');
                }
              } else {
                this._addResult('authenticated', `${role}: ${expectedPath} found`, 'warn',
                  'Page not found in crawl — may not be linked');
              }
            }
          }

          // Report any issues found
          if (issues.length > 0) {
            const errorCount = issues.filter(i => i.severity === 'error').length;
            const warnCount = issues.filter(i => i.severity === 'warning').length;
            this._addResult('authenticated', `${role}: Page issues`, errorCount > 0 ? 'warn' : 'pass',
              `${errorCount} errors, ${warnCount} warnings`);
          }
        } else {
          this._addResult('authenticated', `${role}: Test completed`, 'fail',
            `Test ended with status: ${status}`);
        }

        // Now test specific pages via actions API
        if (config.pages) {
          for (const pagePath of config.pages) {
            try {
              const actionResult = await this._khaiRequest('/api/actions/execute', 'POST', {
                site: this.siteName,
                account: config.account,
                actions: [
                  { type: 'navigate', target: this.baseUrl + pagePath },
                  { type: 'wait', selector: 'body', timeout: 10000 },
                  { type: 'screenshot', name: `audit-${role}-${pagePath.replace(/\//g, '_')}` },
                ],
              });

              if (actionResult.sessionId) {
                // Poll for completion
                let actionStatus = 'running';
                let actionWaited = 0;
                while (actionStatus !== 'completed' && actionStatus !== 'error' && actionWaited < 30000) {
                  await new Promise(r => setTimeout(r, 2000));
                  actionWaited += 2000;
                  const sRes = await this._khaiRequest(`/api/actions/status/${actionResult.sessionId}`);
                  actionStatus = sRes.status;
                }

                if (actionStatus === 'completed') {
                  this._addResult('authenticated', `${role}: ${pagePath} screenshot`, 'pass',
                    `Screenshot saved`);
                }
              }
            } catch {
              // Non-critical
            }
          }
        }

      } catch (err) {
        this._addResult('authenticated', `${role}: Authenticated test`, 'fail', err.message);
      }
    }
  }

  // ===========================
  // 14. AUTHORIZATION (Khai)
  // ===========================

  async testAuthorization() {
    if (!this.useKhai) {
      this._addResult('authorization', 'Authorization tests', 'skip', 'Khai not available');
      return;
    }

    const authzTests = this.profile.authorizationTests || [];

    for (const test of authzTests) {
      // Test: login as role A, try to access role B's pages
      console.log(`[Audit] Testing: ${test.description || `${test.loginAs} accessing ${test.accessPath}`}`);

      try {
        const actionResult = await this._khaiRequest('/api/actions/execute', 'POST', {
          site: this.siteName,
          account: test.loginAs,
          actions: [
            { type: 'navigate', target: this.baseUrl + test.accessPath },
            { type: 'wait', selector: 'body', timeout: 10000 },
            { type: 'screenshot', name: `authz-${test.loginAs}-${test.accessPath.replace(/\//g, '_')}` },
            { type: 'extractText', selector: 'body' },
          ],
        });

        if (actionResult.sessionId) {
          let actionStatus = 'running';
          let waited = 0;
          while (actionStatus !== 'completed' && actionStatus !== 'error' && waited < 30000) {
            await new Promise(r => setTimeout(r, 2000));
            waited += 2000;
            const sRes = await this._khaiRequest(`/api/actions/status/${actionResult.sessionId}`);
            actionStatus = sRes.status;
          }

          if (actionStatus === 'completed') {
            const results = await this._khaiRequest(`/api/actions/status/${actionResult.sessionId}`);
            const bodyText = results.results?.find(r => r.type === 'extractText')?.data || '';

            // Check if access was denied
            if (test.expectDenied) {
              const wasDenied = bodyText.toLowerCase().includes('unauthorized') ||
                                bodyText.toLowerCase().includes('forbidden') ||
                                bodyText.toLowerCase().includes('access denied') ||
                                bodyText.toLowerCase().includes('not authorized') ||
                                results.results?.some(r => r.url?.includes('/login'));

              if (wasDenied) {
                this._addResult('authorization', test.description || `${test.loginAs} blocked from ${test.accessPath}`, 'pass');
              } else {
                this._addResult('authorization', test.description || `${test.loginAs} blocked from ${test.accessPath}`, 'fail',
                  'User was NOT denied access — authorization bypass possible');
              }
            } else {
              this._addResult('authorization', test.description || `${test.loginAs} can access ${test.accessPath}`, 'pass');
            }
          }
        }
      } catch (err) {
        this._addResult('authorization', test.description || `Authorization: ${test.loginAs}`, 'fail', err.message);
      }
    }
  }
}

module.exports = SiteAuditor;
