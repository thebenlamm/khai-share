'use strict';

async function run(ctx) {
  const endpoints = [ctx.baseUrl, ctx.baseUrl + '/api/health'];
  const evilOrigin = 'https://evil-attacker-site.com';

  for (const url of endpoints) {
    try {
      const res = await ctx._request(url, {
        headers: { 'Origin': evilOrigin },
      });

      const acao = res.headers['access-control-allow-origin'];
      if (!acao) {
        ctx._addResult('cors', `${new URL(url).pathname}: No CORS for unknown origin`, 'pass');
      } else if (acao === '*') {
        ctx._addResult('cors', `${new URL(url).pathname}: Wildcard CORS`, 'warn',
          'Access-Control-Allow-Origin: * — allows any site');
      } else if (acao === evilOrigin) {
        ctx._addResult('cors', `${new URL(url).pathname}: Reflects attacker origin`, 'fail',
          `Echoed back ${evilOrigin} — potential CORS misconfiguration`);
      } else {
        ctx._addResult('cors', `${new URL(url).pathname}: CORS restricted`, 'pass', `ACAO: ${acao}`);
      }

      // Check credentials
      const acac = res.headers['access-control-allow-credentials'];
      if (acac === 'true' && acao === '*') {
        ctx._addResult('cors', `${new URL(url).pathname}: Wildcard CORS with credentials`, 'fail',
          'Dangerous: wildcard origin + allow credentials');
      }
    } catch (err) {
      ctx._addResult('cors', `CORS check: ${new URL(url).pathname}`, 'fail', err.message);
    }
  }
}

module.exports = { run };
