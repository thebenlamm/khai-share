'use strict';

async function run(ctx) {
  const pages = ctx.profile.performancePages || ctx.profile.publicPages || [
    { path: '/' },
    { path: '/login' },
  ];

  for (const page of pages) {
    const url = ctx.baseUrl + page.path;
    try {
      const startMs = Date.now();
      const res = await ctx._request(url);
      const totalMs = Date.now() - startMs;

      // Response time
      const threshold = page.maxLoadTime || 3000;
      if (totalMs > threshold) {
        ctx._addResult('performance', `${page.path}: Load time`, 'warn',
          `${totalMs}ms (threshold: ${threshold}ms)`);
      } else {
        ctx._addResult('performance', `${page.path}: Load time`, 'pass', `${totalMs}ms`);
      }

      // Response size
      const sizeKB = Math.round(Buffer.byteLength(res.body) / 1024);
      if (sizeKB > 500) {
        ctx._addResult('performance', `${page.path}: Response size`, 'warn',
          `${sizeKB}KB (large — consider code splitting)`);
      } else {
        ctx._addResult('performance', `${page.path}: Response size`, 'pass', `${sizeKB}KB`);
      }

      // Check for compression
      if (res.headers['content-encoding']) {
        ctx._addResult('performance', `${page.path}: Compression`, 'pass',
          res.headers['content-encoding']);
      } else {
        ctx._addResult('performance', `${page.path}: Compression`, 'warn',
          'No content-encoding header — responses may not be compressed');
      }

      // Cache headers
      const cacheControl = res.headers['cache-control'];
      if (cacheControl) {
        ctx._addResult('performance', `${page.path}: Cache headers`, 'pass', cacheControl);
      } else {
        ctx._addResult('performance', `${page.path}: Cache headers`, 'warn', 'No Cache-Control header');
      }

    } catch (err) {
      ctx._addResult('performance', `${page.path}: Performance`, 'fail', err.message);
    }
  }
}

module.exports = { run };
