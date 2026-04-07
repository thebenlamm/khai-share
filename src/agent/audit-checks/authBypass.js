'use strict';

async function run(ctx) {
  const protectedPages = ctx.profile.protectedPages || [
    { path: '/admin', redirectsTo: '/login' },
    { path: '/dashboard', redirectsTo: '/login' },
  ];

  for (const page of protectedPages) {
    const url = ctx.baseUrl + page.path;
    try {
      const chain = await ctx._followRedirects(url);
      const finalUrl = chain[chain.length - 1]?.url || url;
      const finalPath = new URL(finalUrl).pathname;
      const initialStatus = chain[0]?.status;

      // Should redirect to login
      if (page.redirectsTo && finalPath.includes(page.redirectsTo)) {
        ctx._addResult('authBypass', `${page.path}: Redirects to login`, 'pass');
      } else if (initialStatus === 401 || initialStatus === 403) {
        ctx._addResult('authBypass', `${page.path}: Returns ${initialStatus}`, 'pass');
      } else if (initialStatus === 200 && finalPath === page.path) {
        ctx._addResult('authBypass', `${page.path}: Accessible without auth`, 'fail',
          `Got 200 at ${page.path} without authentication`);
      } else {
        ctx._addResult('authBypass', `${page.path}: Protected`, 'pass',
          `Redirected to ${finalPath}`);
      }
    } catch (err) {
      ctx._addResult('authBypass', `${page.path} auth check`, 'fail', err.message);
    }
  }

  // Test API routes without auth
  const protectedAPIs = ctx.profile.protectedAPIs || [
    { path: '/api/trpc/user.getProfile', expectedStatus: 401 },
  ];

  for (const api of protectedAPIs) {
    const url = ctx.baseUrl + api.path;
    try {
      const res = await ctx._request(url);
      if (res.status === 401 || res.status === 403) {
        ctx._addResult('authBypass', `API ${api.path}: Requires auth`, 'pass',
          `Returns ${res.status}`);
      } else if (res.status === 200) {
        // Check if it's returning actual data or just an error envelope
        try {
          const data = JSON.parse(res.body);
          if (data.error || data.message?.includes('unauthorized') || data.message?.includes('UNAUTHORIZED')) {
            ctx._addResult('authBypass', `API ${api.path}: Requires auth`, 'pass', 'Returns error in body');
          } else {
            ctx._addResult('authBypass', `API ${api.path}: Accessible without auth`, 'fail',
              `Returns 200 with data — potential auth bypass`);
          }
        } catch {
          ctx._addResult('authBypass', `API ${api.path}: Returns 200`, 'warn',
            'Could not parse response — manual verification needed');
        }
      } else {
        ctx._addResult('authBypass', `API ${api.path}: Status ${res.status}`, 'pass');
      }
    } catch (err) {
      ctx._addResult('authBypass', `API ${api.path}`, 'fail', err.message);
    }
  }
}

module.exports = { run };
