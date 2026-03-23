'use strict';

const http = require('http');
const https = require('https');
const crypto = require('crypto');
const dns = require('dns').promises;
const { URL } = require('url');

const PRIVATE_IP_PATTERNS = [
  /^127\./, /^10\./, /^172\.(1[6-9]|2\d|3[01])\./, /^192\.168\./,
  /^169\.254\./, /^0\./, /^fc00:/i, /^fd/i, /^fe80:/i, /^::1$/
];

async function validateWebhookUrl(webhookUrl) {
  const parsed = new URL(webhookUrl);
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error(`Webhook URL must use http or https protocol, got: ${parsed.protocol}`);
  }
  try {
    const { address } = await dns.lookup(parsed.hostname);
    if (PRIVATE_IP_PATTERNS.some(re => re.test(address))) {
      throw new Error('Webhook URL resolves to private/reserved IP range');
    }
  } catch (err) {
    if (err.message.includes('private') || err.message.includes('protocol')) throw err;
    throw new Error(`Cannot resolve webhook hostname: ${parsed.hostname}`);
  }
}

/**
 * Deliver a webhook POST with HMAC-SHA256 signing and exponential-backoff retry.
 *
 * @param {string} webhookUrl   - Target URL to POST to
 * @param {object} payload      - Full operation results sent as JSON body
 * @param {object} [options]
 * @param {string} [options.secret]        - HMAC shared secret (falls back to KHAI_WEBHOOK_SECRET env var)
 * @param {string} [options.operationType] - e.g. "test", "audit", "action", "link-check"
 * @param {string} [options.operationId]   - testId / auditId / sessionId / jobId
 * @returns {Promise<{status, url, attempts, lastAttemptAt, statusCode, error}>}
 */
async function deliverWebhook(webhookUrl, payload, options = {}) {
  const { operationType = 'operation', operationId = '' } = options;
  const secret = options.secret || process.env.KHAI_WEBHOOK_SECRET || null;

  await validateWebhookUrl(webhookUrl);

  const bodyString = JSON.stringify(payload);

  // Build headers
  const headers = {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(bodyString),
    'User-Agent': 'Khai/1.0',
    'X-Khai-Event': 'operation.completed',
    'X-Khai-Operation': operationType,
    'X-Khai-Operation-Id': operationId,
  };

  // HMAC-SHA256 signing
  if (secret) {
    const sig = crypto.createHmac('sha256', secret).update(bodyString).digest('hex');
    headers['X-Khai-Signature'] = `sha256=${sig}`;
  }

  // Retry delays: 1s, 4s, 16s (base 1s, multiplier 4x)
  const RETRY_DELAYS_MS = [1000, 4000, 16000];
  const MAX_ATTEMPTS = 3;

  let lastStatusCode = null;
  let lastError = null;
  let attempts = 0;
  let lastAttemptAt = null;

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    // Exponential backoff before retry (not before first attempt)
    if (attempt > 0) {
      await new Promise(resolve => setTimeout(resolve, RETRY_DELAYS_MS[attempt - 1]));
    }

    attempts++;
    lastAttemptAt = new Date().toISOString();
    lastStatusCode = null;
    lastError = null;

    try {
      const result = await _postOnce(webhookUrl, bodyString, headers);
      lastStatusCode = result.statusCode;

      if (result.statusCode >= 200 && result.statusCode < 300) {
        // Success
        return {
          status: 'delivered',
          url: webhookUrl,
          attempts,
          lastAttemptAt,
          statusCode: lastStatusCode,
          error: null,
        };
      }

      if (result.statusCode >= 400 && result.statusCode < 500) {
        // 4xx = permanent client error, do not retry
        lastError = `HTTP ${result.statusCode} (client error, not retrying)`;
        break;
      }

      // 5xx or other — retry
      lastError = `HTTP ${result.statusCode}`;

    } catch (err) {
      // Network error or timeout — retry
      lastError = err.message || String(err);
      console.error(`[Khai] Webhook attempt ${attempts} failed: ${lastError}`);
    }
  }

  // All attempts exhausted or permanent failure
  console.error(`[Khai] Webhook delivery failed after ${attempts} attempt(s) to ${webhookUrl}: ${lastError}`);
  return {
    status: 'failed',
    url: webhookUrl,
    attempts,
    lastAttemptAt,
    statusCode: lastStatusCode,
    error: lastError,
  };
}

/**
 * Make a single HTTP/HTTPS POST request.
 * Resolves with { statusCode } on any HTTP response.
 * Rejects on network error or timeout.
 */
function _postOnce(webhookUrl, bodyString, headers) {
  return new Promise((resolve, reject) => {
    let protocol;
    try {
      protocol = new URL(webhookUrl).protocol;
    } catch (e) {
      return reject(new Error(`Invalid webhook URL: ${webhookUrl}`));
    }

    const mod = protocol === 'https:' ? https : http;

    const req = mod.request(
      webhookUrl,
      { method: 'POST', headers, timeout: 10000 },
      (res) => {
        // Drain the response body to free the socket
        res.on('data', () => {});
        res.on('end', () => resolve({ statusCode: res.statusCode }));
      }
    );

    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Webhook request timed out after 10s'));
    });

    req.write(bodyString);
    req.end();
  });
}

module.exports = { deliverWebhook, validateWebhookUrl };
