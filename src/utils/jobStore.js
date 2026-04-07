'use strict';

const { deliverWebhook: _deliverWebhookDefault } = require('./webhook');

class JobStore {
  constructor(options = {}) {
    this._map = new Map();
    this._maxSize = options.maxSize || 100;
    this._ttlMs = options.ttlMs || 60 * 60 * 1000;
  }

  create(id, data) {
    this._evict();
    this._map.set(id, { ...data, _createdAt: Date.now() });
  }

  get(id) {
    return this._map.get(id) || null;
  }

  delete(id) {
    return this._map.delete(id);
  }

  has(id) {
    return this._map.has(id);
  }

  list() {
    return Array.from(this._map.entries()).map(([id, data]) => ({ id, ...data }));
  }

  forEach(fn) {
    this._map.forEach(fn);
  }

  get size() {
    return this._map.size;
  }

  _evict() {
    if (this._map.size <= this._maxSize) return;
    const now = Date.now();
    for (const [key, val] of this._map) {
      if (now - (val._createdAt || 0) > this._ttlMs) this._map.delete(key);
    }
    while (this._map.size > this._maxSize) {
      this._map.delete(this._map.keys().next().value);
    }
  }
}

/**
 * Run an async job with full lifecycle management:
 * create → execute workFn → set completed/error status + endTime → deliver webhook.
 *
 * Fire-and-forget: returns immediately so the route handler can respond to the client.
 *
 * @param {JobStore} store       - JobStore instance to track the job
 * @param {string}   id          - Unique job ID
 * @param {object}   initialData - Merged into job on create (e.g. { type, site, startTime })
 * @param {Function} workFn      - async (job) => result — receives job object, returns result
 * @param {object}   [options]
 * @param {string}   [options.operationType]   - e.g. "test", "audit", "action" (for webhook headers)
 * @param {string}   [options.operationId]     - Operation ID for webhook headers (defaults to id)
 * @param {string}   [options.webhookUrl]      - If set, POST results to this URL on completion
 * @param {Function} [options._deliverWebhook] - Injectable for testing; defaults to real deliverWebhook
 */
async function runAsyncJob(store, id, initialData, workFn, options = {}) {
  const {
    operationType = 'operation',
    operationId = id,
    webhookUrl = null,
    _deliverWebhook = _deliverWebhookDefault,
  } = options;

  store.create(id, {
    ...initialData,
    status: 'running',
    webhookUrl: webhookUrl || null,
    webhook: null,
  });

  // Fire-and-forget IIFE — caller does NOT await this
  (async () => {
    const job = store.get(id);
    if (!job) return; // evicted before work started

    try {
      const results = await workFn(job);
      const current = store.get(id);
      if (!current) return; // evicted during work
      current.status = 'completed';
      current.results = results;
      current.endTime = new Date().toISOString();
      if (current.webhookUrl) {
        current.webhook = await _deliverWebhook(current.webhookUrl, results, {
          operationType, operationId,
        });
      }
    } catch (err) {
      const current = store.get(id);
      if (!current) return; // evicted during work
      current.status = 'error';
      current.error = err.message || String(err);
      current.endTime = new Date().toISOString();
      if (current.webhookUrl) {
        current.webhook = await _deliverWebhook(current.webhookUrl, {
          jobId: id,
          status: 'error',
          error: current.error,
        }, { operationType, operationId });
      }
    }
  })();
}

module.exports = { JobStore, runAsyncJob };
