'use strict';

const MAX_BODY_SIZE = 1024 * 1024; // 1MB

/**
 * HarRecorder — CDP-based HAR 1.2 recorder for a Puppeteer page.
 *
 * Usage:
 *   const recorder = new HarRecorder(page);
 *   await recorder.start();
 *   // ... perform actions on the page ...
 *   const har = await recorder.stop();
 */
class HarRecorder {
  constructor(page) {
    this.page = page;
    this.client = null;
    this.entries = new Map(); // requestId -> entry data
  }

  /**
   * Attach to CDP, enable Network domain, and start capturing events.
   */
  async start() {
    this.client = await this.page.target().createCDPSession();
    await this.client.send('Network.enable');

    this.client.on('Network.requestWillBeSent', (params) => {
      const { requestId, request, timestamp, wallTime } = params;

      // Skip data: and blob: URLs — they have no meaningful network trace
      if (request.url.startsWith('data:') || request.url.startsWith('blob:')) {
        return;
      }

      this.entries.set(requestId, {
        requestId,
        startedDateTime: new Date(wallTime * 1000).toISOString(),
        wallTime,           // seconds (CDP monotonic-ish base)
        requestTimestamp: timestamp, // CDP monotonic seconds
        request: {
          method: request.method,
          url: request.url,
          headers: _objectToHarHeaders(request.headers),
          postData: request.postData || null,
          bodySize: request.postData ? Buffer.byteLength(request.postData, 'utf8') : 0,
        },
        response: null,
        responseTimestamp: null,
        encodedDataLength: 0,
        finishedTimestamp: null,
        failed: false,
        failedText: null,
      });
    });

    this.client.on('Network.responseReceived', (params) => {
      const { requestId, response, timestamp } = params;
      const entry = this.entries.get(requestId);
      if (!entry) return;

      entry.response = {
        status: response.status,
        statusText: response.statusText || '',
        headers: _objectToHarHeaders(response.headers),
        mimeType: response.mimeType || 'application/octet-stream',
        protocol: response.protocol || 'http/1.1',
        encodedDataLength: response.encodedDataLength || 0,
      };
      entry.responseTimestamp = timestamp;
    });

    this.client.on('Network.loadingFinished', (params) => {
      const { requestId, timestamp, encodedDataLength } = params;
      const entry = this.entries.get(requestId);
      if (!entry) return;

      entry.encodedDataLength = encodedDataLength || 0;
      entry.finishedTimestamp = timestamp;
    });

    this.client.on('Network.loadingFailed', (params) => {
      const { requestId, timestamp, errorText, blockedReason } = params;
      const entry = this.entries.get(requestId);
      if (!entry) return;

      entry.failed = true;
      entry.failedText = errorText || blockedReason || 'Unknown error';
      entry.finishedTimestamp = timestamp;
    });
  }

  /**
   * Stop recording, fetch response bodies, build and return the HAR object.
   * @returns {Object} HAR 1.2 JSON object
   */
  async stop() {
    if (!this.client) {
      return _emptyHar();
    }

    // Fetch response bodies for completed requests
    const bodyFetches = [];
    for (const [requestId, entry] of this.entries) {
      if (!entry.failed && entry.response && entry.finishedTimestamp !== null) {
        bodyFetches.push(
          this._fetchBody(requestId, entry)
        );
      }
    }

    await Promise.all(bodyFetches);

    try {
      await this.client.detach();
    } catch (_) {
      // Ignore detach errors — page may already be closed
    }

    return this._buildHar();
  }

  /**
   * Attempt to fetch the response body for a single entry.
   * Silently skips if body is unavailable or too large.
   */
  async _fetchBody(requestId, entry) {
    // Skip if we know it's too large already
    if (entry.encodedDataLength > MAX_BODY_SIZE) {
      entry.bodyContent = '';
      entry.bodyComment = 'Body not captured (exceeds 1MB limit)';
      return;
    }

    try {
      const resp = await this.client.send('Network.getResponseBody', { requestId });
      entry.bodyContent = resp.base64Encoded
        ? Buffer.from(resp.body, 'base64').toString('utf8')
        : (resp.body || '');
      entry.bodyBase64 = resp.base64Encoded || false;
    } catch (_) {
      entry.bodyContent = '';
      entry.bodyComment = 'Body not captured';
    }
  }

  /**
   * Build the HAR 1.2 object from accumulated entries.
   */
  _buildHar() {
    const harEntries = [];

    for (const entry of this.entries.values()) {
      harEntries.push(_buildHarEntry(entry));
    }

    return {
      log: {
        version: '1.2',
        creator: { name: 'Khai', version: '1.0' },
        entries: harEntries,
      },
    };
  }
}

// ---------------------------------------------------------------------------
// Private helpers
// ---------------------------------------------------------------------------

function _emptyHar() {
  return {
    log: {
      version: '1.2',
      creator: { name: 'Khai', version: '1.0' },
      entries: [],
    },
  };
}

/**
 * Convert CDP header objects (key: value) to HAR format [{name, value}].
 */
function _objectToHarHeaders(headers) {
  if (!headers || typeof headers !== 'object') return [];
  return Object.entries(headers).map(([name, value]) => ({ name, value: String(value) }));
}

/**
 * Parse query string parameters from a URL into HAR format [{name, value}].
 */
function _parseQueryString(urlStr) {
  try {
    const url = new URL(urlStr);
    const params = [];
    url.searchParams.forEach((value, name) => {
      params.push({ name, value });
    });
    return params;
  } catch (_) {
    return [];
  }
}

/**
 * Build a single HAR entry from an accumulated entry object.
 */
function _buildHarEntry(entry) {
  // CDP timestamps are in seconds (monotonic). Use differences for durations.
  const sendMs = 0; // CDP doesn't give us separate send time

  // Time from request start to first response byte
  const waitMs = entry.responseTimestamp !== null && entry.requestTimestamp !== null
    ? Math.max(0, Math.round((entry.responseTimestamp - entry.requestTimestamp) * 1000))
    : -1;

  // Time from first response byte to loading finished
  const receiveMs = entry.finishedTimestamp !== null && entry.responseTimestamp !== null
    ? Math.max(0, Math.round((entry.finishedTimestamp - entry.responseTimestamp) * 1000))
    : -1;

  const totalTime = waitMs >= 0 && receiveMs >= 0 ? waitMs + receiveMs : -1;

  // Request object
  const req = entry.request;
  const harRequest = {
    method: req.method,
    url: req.url,
    httpVersion: 'HTTP/1.1',
    headers: req.headers,
    queryString: _parseQueryString(req.url),
    cookies: [],
    headersSize: -1,
    bodySize: req.bodySize,
  };
  if (req.postData) {
    harRequest.postData = {
      mimeType: 'application/x-www-form-urlencoded',
      text: req.postData,
    };
  }

  // Response object
  let harResponse;
  if (entry.response) {
    const resp = entry.response;
    harResponse = {
      status: resp.status,
      statusText: resp.statusText,
      httpVersion: resp.protocol ? _normalizeProtocol(resp.protocol) : 'HTTP/1.1',
      headers: resp.headers,
      cookies: [],
      content: {
        size: entry.encodedDataLength || -1,
        mimeType: resp.mimeType,
        text: entry.bodyContent || '',
        ...(entry.bodyComment ? { comment: entry.bodyComment } : {}),
      },
      redirectURL: '',
      headersSize: -1,
      bodySize: entry.encodedDataLength || -1,
    };
  } else {
    // No response (e.g. failed before receiving headers)
    harResponse = {
      status: 0,
      statusText: entry.failedText || 'Failed',
      httpVersion: 'HTTP/1.1',
      headers: [],
      cookies: [],
      content: { size: 0, mimeType: 'x-unknown', text: '' },
      redirectURL: '',
      headersSize: -1,
      bodySize: -1,
    };
  }

  return {
    startedDateTime: entry.startedDateTime,
    time: totalTime,
    request: harRequest,
    response: harResponse,
    cache: {},
    timings: {
      send: sendMs,
      wait: waitMs,
      receive: receiveMs,
    },
    ...(entry.failed ? { _errorText: entry.failedText } : {}),
  };
}

/**
 * Normalize CDP protocol strings to HTTP/x.x format for HAR.
 */
function _normalizeProtocol(protocol) {
  if (!protocol) return 'HTTP/1.1';
  const p = protocol.toLowerCase();
  if (p === 'h2' || p === 'http/2') return 'HTTP/2';
  if (p === 'h3' || p === 'http/3') return 'HTTP/3';
  if (p.startsWith('http/')) return protocol.toUpperCase();
  return 'HTTP/1.1';
}

module.exports = { HarRecorder };
