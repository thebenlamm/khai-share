'use strict';

async function run(ctx) {
  const pages = ctx.profile.publicPages || [
    { path: '/', expectedStatus: 200 },
    { path: '/login', expectedStatus: 200 },
  ];

  for (const page of pages) {
    const url = ctx.baseUrl + page.path;
    try {
      const res = await ctx._request(url);
      const finalStatus = res.status >= 300 && res.status < 400
        ? (await ctx._followRedirects(url)).pop()?.status || res.status
        : res.status;

      // Status check
      if (page.expectedStatus && finalStatus !== page.expectedStatus) {
        ctx._addResult('publicPages', `${page.path} returns ${page.expectedStatus}`, 'fail',
          `Expected ${page.expectedStatus}, got ${finalStatus}`);
      } else {
        ctx._addResult('publicPages', `${page.path} returns ${finalStatus}`, 'pass');
      }

      // Content check
      if (page.expectedContent && res.status === 200) {
        for (const text of page.expectedContent) {
          if (!res.body.toLowerCase().includes(text.toLowerCase())) {
            ctx._addResult('publicPages', `${page.path} contains "${text}"`, 'fail',
              `Expected text not found in page body`);
          } else {
            ctx._addResult('publicPages', `${page.path} contains "${text}"`, 'pass');
          }
        }
      }

      // Not-contain check (e.g. no error messages on page)
      if (page.notContains && res.status === 200) {
        for (const text of page.notContains) {
          if (res.body.toLowerCase().includes(text.toLowerCase())) {
            ctx._addResult('publicPages', `${page.path} does NOT contain "${text}"`, 'fail',
              `Unexpected text found in page body`);
          } else {
            ctx._addResult('publicPages', `${page.path} does NOT contain "${text}"`, 'pass');
          }
        }
      }
    } catch (err) {
      ctx._addResult('publicPages', `${page.path} is reachable`, 'fail', err.message);
    }
  }
}

module.exports = { run };
