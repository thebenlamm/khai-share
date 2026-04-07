'use strict';

async function run(ctx) {
  // Hit the login page to get session cookies
  const url = ctx.baseUrl + (ctx.profile.loginPath || '/login');
  try {
    const res = await ctx._request(url);
    const setCookies = res.headers['set-cookie'];

    if (!setCookies) {
      ctx._addResult('cookieSecurity', 'Cookies set on login page', 'pass', 'No cookies set (stateless)');
      return;
    }

    const cookies = Array.isArray(setCookies) ? setCookies : [setCookies];

    for (const cookie of cookies) {
      const name = cookie.split('=')[0].trim();

      // Session-like cookies should have Secure flag
      if (ctx.baseUrl.startsWith('https://')) {
        if (cookie.toLowerCase().includes('secure')) {
          ctx._addResult('cookieSecurity', `${name}: Secure flag`, 'pass');
        } else {
          ctx._addResult('cookieSecurity', `${name}: Secure flag`, 'fail', 'Missing Secure flag on HTTPS site');
        }
      }

      // HttpOnly for session cookies
      if (name.toLowerCase().includes('session') || name.toLowerCase().includes('token') || name.toLowerCase().includes('auth') || name.toLowerCase().includes('next-auth')) {
        if (cookie.toLowerCase().includes('httponly')) {
          ctx._addResult('cookieSecurity', `${name}: HttpOnly flag`, 'pass');
        } else {
          ctx._addResult('cookieSecurity', `${name}: HttpOnly flag`, 'warn',
            'Session cookie missing HttpOnly — accessible via JavaScript');
        }
      }

      // SameSite attribute
      if (cookie.toLowerCase().includes('samesite')) {
        const sameSiteMatch = cookie.match(/samesite=(\w+)/i);
        const value = sameSiteMatch ? sameSiteMatch[1] : 'unknown';
        if (value.toLowerCase() === 'none' && !cookie.toLowerCase().includes('secure')) {
          ctx._addResult('cookieSecurity', `${name}: SameSite=None requires Secure`, 'fail',
            'SameSite=None without Secure flag');
        } else {
          ctx._addResult('cookieSecurity', `${name}: SameSite attribute`, 'pass', `SameSite=${value}`);
        }
      } else {
        ctx._addResult('cookieSecurity', `${name}: SameSite attribute`, 'warn', 'Missing SameSite attribute');
      }
    }
  } catch (err) {
    ctx._addResult('cookieSecurity', 'Cookie security check', 'fail', err.message);
  }
}

module.exports = { run };
