'use strict';

async function run(ctx) {
  const endpoints = ctx.profile.apiEndpoints || [
    { path: '/api/health', expectedStatus: 200 },
  ];

  for (const ep of endpoints) {
    const url = ctx.baseUrl + ep.path;
    try {
      const res = await ctx._request(url, {
        method: ep.method || 'GET',
        headers: ep.headers || {},
      });

      // Status check
      if (ep.expectedStatus && res.status !== ep.expectedStatus) {
        ctx._addResult('apiEndpoints', `${ep.method || 'GET'} ${ep.path}: ${ep.expectedStatus}`, 'fail',
          `Got ${res.status}`);
      } else {
        ctx._addResult('apiEndpoints', `${ep.method || 'GET'} ${ep.path}: ${res.status}`, 'pass',
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
            ctx._addResult('apiEndpoints', `${ep.path}: No stack trace in error`, 'fail',
              'Error response contains stack trace — information leak');
          }
          if (hasDbInfo) {
            ctx._addResult('apiEndpoints', `${ep.path}: No DB info in error`, 'fail',
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
            ctx._addResult('apiEndpoints', `${ep.path} contains "${text}"`, 'pass');
          } else {
            ctx._addResult('apiEndpoints', `${ep.path} contains "${text}"`, 'fail', 'Expected content not found');
          }
        }
      }
    } catch (err) {
      ctx._addResult('apiEndpoints', `${ep.method || 'GET'} ${ep.path}`, 'fail', err.message);
    }
  }

  // Test invalid API routes return proper errors (not stack traces)
  const invalidPaths = [
    '/api/nonexistent',
    '/api/trpc/nonexistent.procedure',
  ];

  for (const p of invalidPaths) {
    try {
      const res = await ctx._request(ctx.baseUrl + p);
      if (res.status === 404 || res.status === 400 || res.status === 405) {
        // Check for info leak
        const hasStack = res.body.includes('at ') && res.body.includes('.js:');
        if (hasStack) {
          ctx._addResult('apiEndpoints', `${p}: Error response clean`, 'fail',
            'Stack trace in 404 response');
        } else {
          ctx._addResult('apiEndpoints', `${p}: Returns clean ${res.status}`, 'pass');
        }
      } else if (res.status === 200) {
        ctx._addResult('apiEndpoints', `${p}: Unknown route returns 404`, 'warn',
          `Returns 200 instead of 404`);
      }
    } catch {
      // Connection error is acceptable
    }
  }
}

module.exports = { run };
