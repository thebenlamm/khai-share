'use strict';

async function run(ctx) {
  // Test login endpoint rate limiting
  const loginUrl = ctx.baseUrl + (ctx.profile.loginPath || '/login');
  const apiUrl = ctx.baseUrl + (ctx.profile.rateLimitTestPath || '/api/health');

  // Rapid-fire requests to test rate limiting
  const requestCount = 20;
  const results = [];

  console.log(`[Audit] Sending ${requestCount} rapid requests to test rate limiting...`);

  for (let i = 0; i < requestCount; i++) {
    try {
      const res = await ctx._request(apiUrl, { timeout: 5000 });
      results.push(res.status);
    } catch {
      results.push('error');
    }
  }

  const rateLimited = results.some(s => s === 429);
  const errors = results.filter(s => s === 'error' || s >= 500).length;

  if (rateLimited) {
    ctx._addResult('rateLimiting', 'Rate limiting active on API', 'pass',
      `Got 429 after ${results.indexOf(429) + 1} requests`);
  } else if (errors > requestCount / 2) {
    ctx._addResult('rateLimiting', 'Rate limiting active on API', 'warn',
      `${errors}/${requestCount} requests failed — possible rate limiting or instability`);
  } else {
    ctx._addResult('rateLimiting', 'Rate limiting active on API', 'warn',
      `No 429 response after ${requestCount} requests — consider adding rate limiting`);
  }

  // Test login endpoint specifically (POST with bad credentials)
  const loginAttempts = 10;
  const loginResults = [];

  for (let i = 0; i < loginAttempts; i++) {
    try {
      const res = await ctx._request(ctx.baseUrl + '/api/auth/signin', {
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
    ctx._addResult('rateLimiting', 'Login endpoint rate limited', 'pass',
      `Blocked after ${loginResults.indexOf(429) + 1} attempts`);
  } else {
    ctx._addResult('rateLimiting', 'Login endpoint rate limited', 'warn',
      `No rate limiting detected after ${loginAttempts} login attempts`);
  }
}

module.exports = { run };
