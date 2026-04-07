'use strict';

const https = require('https');

async function run(ctx) {
  if (!ctx.baseUrl.startsWith('https://')) {
    ctx._addResult('ssl', 'Site uses HTTPS', 'fail', `Base URL is HTTP: ${ctx.baseUrl}`);
    return;
  }

  ctx._addResult('ssl', 'Site uses HTTPS', 'pass');

  // Check HTTP → HTTPS redirect
  const httpUrl = ctx.baseUrl.replace('https://', 'http://');
  try {
    const chain = await ctx._followRedirects(httpUrl);
    const finalUrl = chain[chain.length - 1]?.url || httpUrl;
    if (finalUrl.startsWith('https://')) {
      ctx._addResult('ssl', 'HTTP redirects to HTTPS', 'pass');
    } else {
      ctx._addResult('ssl', 'HTTP redirects to HTTPS', 'fail',
        `HTTP did not redirect to HTTPS — ended at ${finalUrl}`);
    }
  } catch {
    ctx._addResult('ssl', 'HTTP redirects to HTTPS', 'warn', 'Could not test HTTP redirect');
  }

  // Check certificate details
  try {
    const parsedUrl = new URL(ctx.baseUrl);
    await new Promise((resolve, reject) => {
      const req = https.request({
        hostname: parsedUrl.hostname,
        port: 443,
        method: 'HEAD',
        timeout: 10000,
      }, (res) => {
        const cert = res.socket.getPeerCertificate();
        if (cert) {
          // Check expiration
          const validTo = new Date(cert.valid_to);
          const daysRemaining = Math.floor((validTo - new Date()) / (1000 * 60 * 60 * 24));

          if (daysRemaining < 0) {
            ctx._addResult('ssl', 'SSL certificate valid', 'fail',
              `Certificate expired ${Math.abs(daysRemaining)} days ago`);
          } else if (daysRemaining < 30) {
            ctx._addResult('ssl', 'SSL certificate expiry', 'warn',
              `Certificate expires in ${daysRemaining} days — renew soon`);
          } else {
            ctx._addResult('ssl', 'SSL certificate valid', 'pass',
              `Expires in ${daysRemaining} days (${cert.valid_to})`);
          }

          // Check issuer
          if (cert.issuer) {
            ctx._addResult('ssl', 'SSL certificate issuer', 'pass',
              `Issued by ${cert.issuer.O || cert.issuer.CN || 'unknown'}`);
          }
        }
        res.resume();
        resolve();
      });
      req.on('error', reject);
      req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
      req.end();
    });
  } catch (err) {
    ctx._addResult('ssl', 'SSL certificate check', 'warn', err.message);
  }
}

module.exports = { run };
