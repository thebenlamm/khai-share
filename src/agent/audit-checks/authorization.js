'use strict';

async function run(ctx) {
  if (!ctx.useKhai) {
    ctx._addResult('authorization', 'Authorization tests', 'skip', 'Khai not available');
    return;
  }

  const authzTests = ctx.profile.authorizationTests || [];

  for (const test of authzTests) {
    // Test: login as role A, try to access role B's pages
    console.log(`[Audit] Testing: ${test.description || `${test.loginAs} accessing ${test.accessPath}`}`);

    try {
      const actionResult = await ctx._khaiRequest('/api/actions/execute', 'POST', {
        site: ctx.siteName,
        account: test.loginAs,
        actions: [
          { type: 'navigate', target: ctx.baseUrl + test.accessPath },
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
          const sRes = await ctx._khaiRequest(`/api/actions/status/${actionResult.sessionId}`);
          actionStatus = sRes.data?.status || sRes.status;
        }

        if (actionStatus === 'completed') {
          const results = await ctx._khaiRequest(`/api/actions/status/${actionResult.sessionId}`);
          const actionResults = results.data?.results || results.results || [];
          const bodyText = actionResults.find(r => r.type === 'extractText')?.data || '';

          // Check if access was denied
          if (test.expectDenied) {
            const wasDenied = bodyText.toLowerCase().includes('unauthorized') ||
                              bodyText.toLowerCase().includes('forbidden') ||
                              bodyText.toLowerCase().includes('access denied') ||
                              bodyText.toLowerCase().includes('not authorized') ||
                              actionResults.some(r => r.url?.includes('/login'));

            if (wasDenied) {
              ctx._addResult('authorization', test.description || `${test.loginAs} blocked from ${test.accessPath}`, 'pass');
            } else {
              ctx._addResult('authorization', test.description || `${test.loginAs} blocked from ${test.accessPath}`, 'fail',
                'User was NOT denied access — authorization bypass possible');
            }
          } else {
            ctx._addResult('authorization', test.description || `${test.loginAs} can access ${test.accessPath}`, 'pass');
          }
        }
      }
    } catch (err) {
      ctx._addResult('authorization', test.description || `Authorization: ${test.loginAs}`, 'fail', err.message);
    }
  }
}

module.exports = { run };
