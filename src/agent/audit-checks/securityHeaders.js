'use strict';

async function run(ctx) {
  const url = ctx.baseUrl;
  try {
    const res = await ctx._request(url);
    const h = res.headers;

    // Required headers
    const required = ctx.profile.securityHeaders?.required || [
      'x-frame-options',
      'x-content-type-options',
      'strict-transport-security',
    ];

    for (const header of required) {
      if (h[header]) {
        ctx._addResult('securityHeaders', `${header} present`, 'pass', h[header]);
      } else {
        ctx._addResult('securityHeaders', `${header} present`, 'fail', 'Header missing');
      }
    }

    // Recommended headers
    const recommended = ctx.profile.securityHeaders?.recommended || [
      'content-security-policy',
      'referrer-policy',
      'permissions-policy',
      'x-xss-protection',
    ];

    for (const header of recommended) {
      if (h[header]) {
        ctx._addResult('securityHeaders', `${header} present (recommended)`, 'pass', h[header]);
      } else {
        ctx._addResult('securityHeaders', `${header} present (recommended)`, 'warn', 'Header missing');
      }
    }

    // HSTS value quality
    if (h['strict-transport-security']) {
      const hsts = h['strict-transport-security'];
      if (!hsts.includes('includeSubDomains')) {
        ctx._addResult('securityHeaders', 'HSTS includes subdomains', 'warn', hsts);
      }
      const maxAgeMatch = hsts.match(/max-age=(\d+)/);
      if (maxAgeMatch && parseInt(maxAgeMatch[1]) < 31536000) {
        ctx._addResult('securityHeaders', 'HSTS max-age >= 1 year', 'warn',
          `max-age=${maxAgeMatch[1]} (recommended: 31536000+)`);
      }
    }

    // X-Frame-Options value
    if (h['x-frame-options']) {
      const xfo = h['x-frame-options'].toUpperCase();
      if (xfo !== 'DENY' && xfo !== 'SAMEORIGIN') {
        ctx._addResult('securityHeaders', 'X-Frame-Options is DENY or SAMEORIGIN', 'warn', xfo);
      }
    }

    // CSP evaluation
    if (h['content-security-policy']) {
      const csp = h['content-security-policy'];
      if (csp.includes("'unsafe-inline'") && !csp.includes('nonce-')) {
        ctx._addResult('securityHeaders', 'CSP avoids unsafe-inline without nonce', 'warn',
          "CSP uses 'unsafe-inline' — consider nonce-based approach");
      }
      if (csp.includes("'unsafe-eval'")) {
        ctx._addResult('securityHeaders', 'CSP avoids unsafe-eval', 'warn',
          "CSP uses 'unsafe-eval' — security risk");
      }
      if (!csp.includes('default-src')) {
        ctx._addResult('securityHeaders', 'CSP has default-src', 'warn', 'Missing default-src directive');
      }
    }

    // Server header leaks version info
    if (h['server']) {
      const server = h['server'];
      if (/\d+\.\d+/.test(server)) {
        ctx._addResult('securityHeaders', 'Server header does not leak version', 'warn',
          `Server: ${server} (version numbers visible)`);
      }
    }

    // X-Powered-By should not be present
    if (h['x-powered-by']) {
      ctx._addResult('securityHeaders', 'X-Powered-By not exposed', 'warn',
        `X-Powered-By: ${h['x-powered-by']}`);
    } else {
      ctx._addResult('securityHeaders', 'X-Powered-By not exposed', 'pass');
    }

  } catch (err) {
    ctx._addResult('securityHeaders', 'Security headers check', 'fail', err.message);
  }
}

module.exports = { run };
