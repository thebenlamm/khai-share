'use strict';

async function run(ctx) {
  const paths = ctx.profile.sensitivePaths || [
    '/.env',
    '/.env.local',
    '/.env.production',
    '/.git/config',
    '/.git/HEAD',
    '/wp-admin',
    '/wp-login.php',
    '/phpinfo.php',
    '/server-status',
    '/server-info',
    '/.htaccess',
    '/.htpasswd',
    '/web.config',
    '/package.json',
    '/tsconfig.json',
    '/.DS_Store',
    '/robots.txt',
    '/sitemap.xml',
    '/_next/data',
    '/api/internal',
  ];

  for (const p of paths) {
    const url = ctx.baseUrl + p;
    try {
      const res = await ctx._request(url);

      // These should NOT return 200 (except robots.txt, sitemap.xml)
      const allowedPublic = ['/robots.txt', '/sitemap.xml'];
      if (allowedPublic.includes(p)) {
        if (res.status === 200) {
          ctx._addResult('sensitivePaths', `${p}: Exists (expected)`, 'pass');
          // Check robots.txt for sensitive paths
          if (p === '/robots.txt') {
            if (res.body.includes('Disallow: /admin') || res.body.includes('Disallow: /api')) {
              ctx._addResult('sensitivePaths', 'robots.txt: Disallows sensitive paths', 'pass');
            }
          }
        } else {
          ctx._addResult('sensitivePaths', `${p}: Missing`, 'warn', `Status ${res.status}`);
        }
        continue;
      }

      if (res.status === 200) {
        // Check if it's actually returning sensitive content
        const isSensitive = res.body.includes('DATABASE_URL') ||
                            res.body.includes('SECRET') ||
                            res.body.includes('PASSWORD') ||
                            res.body.includes('[core]') || // git config
                            res.body.includes('ref: refs/') || // git HEAD
                            res.body.includes('phpinfo()');

        if (isSensitive) {
          ctx._addResult('sensitivePaths', `${p}: EXPOSED with sensitive content`, 'fail',
            `Returns 200 with sensitive data — CRITICAL`);
        } else {
          ctx._addResult('sensitivePaths', `${p}: Returns 200`, 'warn',
            `Returns 200 but content may not be sensitive — verify manually`);
        }
      } else {
        ctx._addResult('sensitivePaths', `${p}: Not exposed`, 'pass', `Status ${res.status}`);
      }
    } catch (err) {
      // Timeout or connection error is fine — means it's not accessible
      ctx._addResult('sensitivePaths', `${p}: Not exposed`, 'pass', 'Connection failed (expected)');
    }
  }
}

module.exports = { run };
