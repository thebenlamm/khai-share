'use strict';

async function run(ctx) {
  const redirects = ctx.profile.redirects || [];

  for (const redir of redirects) {
    const url = ctx.baseUrl + redir.from;
    try {
      const chain = await ctx._followRedirects(url);
      const finalUrl = chain[chain.length - 1]?.url || url;
      const finalPath = new URL(finalUrl).pathname;
      const expectedPath = redir.to;

      // Check if redirect ends at expected destination
      if (finalPath === expectedPath || finalUrl.endsWith(expectedPath)) {
        ctx._addResult('redirects', `${redir.from} → ${redir.to}`, 'pass');
      } else {
        ctx._addResult('redirects', `${redir.from} → ${redir.to}`, 'fail',
          `Actually redirected to ${finalPath}`);
      }

      // Check redirect status code if specified
      if (redir.expectedStatus) {
        const initialStatus = chain[0]?.status;
        if (initialStatus !== redir.expectedStatus) {
          ctx._addResult('redirects', `${redir.from} uses ${redir.expectedStatus} redirect`, 'warn',
            `Got ${initialStatus} instead`);
        }
      }
    } catch (err) {
      ctx._addResult('redirects', `${redir.from} redirect works`, 'fail', err.message);
    }
  }
}

module.exports = { run };
