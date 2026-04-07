'use strict';

async function run(ctx) {
  if (!ctx.useKhai) {
    ctx._addResult('authenticated', 'Authenticated tests', 'skip', 'Khai not available');
    return;
  }

  const authTests = ctx.profile.authenticatedTests || {};

  for (const [role, config] of Object.entries(authTests)) {
    if (!config.account || !config.pages) continue;

    console.log(`[Audit] Testing authenticated pages as ${role} (${config.account})`);

    try {
      // Start a crawl test via Khai
      const testResult = await ctx._khaiRequest('/api/test/start', 'POST', {
        site: ctx.siteName,
        account: config.account,
        maxDepth: 1,
        viewport: 'desktop',
      });

      if (!testResult.testId) {
        ctx._addResult('authenticated', `${role}: Login`, 'fail', 'Khai test failed to start');
        continue;
      }

      const testId = testResult.testId;

      // Poll for completion (max 120s)
      let status = 'running';
      let waited = 0;
      while (status !== 'completed' && status !== 'error' && waited < 120000) {
        await new Promise(r => setTimeout(r, 3000));
        waited += 3000;
        const statusRes = await ctx._khaiRequest(`/api/test/${testId}/status`);
        status = statusRes.status;
      }

      if (status === 'completed') {
        const results = await ctx._khaiRequest(`/api/test/${testId}/results`);
        const pages = results.pages || [];
        const issues = results.issues || [];

        ctx._addResult('authenticated', `${role}: Login successful`, 'pass',
          `Crawled ${pages.length} pages`);

        // Check for expected pages
        if (config.pages) {
          for (const expectedPath of config.pages) {
            const found = pages.some(p => p.url.includes(expectedPath));
            if (found) {
              const page = pages.find(p => p.url.includes(expectedPath));
              if (page?.status >= 400) {
                ctx._addResult('authenticated', `${role}: ${expectedPath} accessible`, 'fail',
                  `Status ${page.status}`);
              } else {
                ctx._addResult('authenticated', `${role}: ${expectedPath} accessible`, 'pass');
              }
            } else {
              ctx._addResult('authenticated', `${role}: ${expectedPath} found`, 'warn',
                'Page not found in crawl — may not be linked');
            }
          }
        }

        // Report any issues found
        if (issues.length > 0) {
          const errorCount = issues.filter(i => i.severity === 'error').length;
          const warnCount = issues.filter(i => i.severity === 'warning').length;
          ctx._addResult('authenticated', `${role}: Page issues`, errorCount > 0 ? 'warn' : 'pass',
            `${errorCount} errors, ${warnCount} warnings`);
        }
      } else {
        ctx._addResult('authenticated', `${role}: Test completed`, 'fail',
          `Test ended with status: ${status}`);
      }

      // Now test specific pages via actions API
      if (config.pages) {
        for (const pagePath of config.pages) {
          try {
            const actionResult = await ctx._khaiRequest('/api/actions/execute', 'POST', {
              site: ctx.siteName,
              account: config.account,
              actions: [
                { type: 'navigate', target: ctx.baseUrl + pagePath },
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
                const sRes = await ctx._khaiRequest(`/api/actions/status/${actionResult.sessionId}`);
                actionStatus = sRes.data?.status || sRes.status;
              }

              if (actionStatus === 'completed') {
                ctx._addResult('authenticated', `${role}: ${pagePath} screenshot`, 'pass',
                  `Screenshot saved`);
              }
            }
          } catch {
            // Non-critical
          }
        }
      }

    } catch (err) {
      ctx._addResult('authenticated', `${role}: Authenticated test`, 'fail', err.message);
    }
  }
}

module.exports = { run };
