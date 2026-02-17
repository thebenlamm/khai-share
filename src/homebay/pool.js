'use strict';

const { createBrowser } = require('../utils/browser');

const QUEUE_TIMEOUT_MS = 30 * 1000; // 30 seconds

/**
 * BrowserPool — manages a fixed pool of Puppeteer browser instances.
 *
 * Enforces a maximum number of concurrent browsers, queues waiters when the
 * pool is full, force-kills browsers after a hard timeout, and auto-recovers
 * from crashed browser slots.
 *
 * Usage:
 *   const slot = await pool.acquire();
 *   try { ... use slot.page ... } finally { await pool.release(slot); }
 *
 * Or with the leak-safe helper:
 *   await pool.withSlot(async (slot) => { ... use slot.page ... });
 */
class BrowserPool {
  /**
   * @param {number} maxSize - Max concurrent browser instances (default 3)
   * @param {number} timeoutMs - Hard kill timeout per slot in ms (default 5 min)
   * @param {Object} options
   * @param {boolean} [options.headless=true] - Run headless or visible (for debug)
   */
  constructor(maxSize = 3, timeoutMs = 5 * 60 * 1000, options = {}) {
    this.maxSize = maxSize;
    this.timeoutMs = timeoutMs;
    this.headless = options.headless !== undefined ? options.headless : true;

    /** @type {Array<{browser, page, timer, id}>} */
    this.slots = [];

    /** @type {Array<{resolve, reject, timer}>} */
    this.queue = [];
  }

  /**
   * Acquire a browser slot. Creates a new slot if under maxSize, otherwise
   * queues the caller. Rejects after QUEUE_TIMEOUT_MS if no slot becomes
   * available.
   *
   * @returns {Promise<{browser, page, id, timer}>}
   */
  async acquire() {
    if (this.slots.length < this.maxSize) {
      return this._createSlot();
    }

    // Pool is full — queue this caller
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        // Remove from queue
        const idx = this.queue.findIndex((w) => w.timer === timer);
        if (idx !== -1) this.queue.splice(idx, 1);
        reject(new Error('Browser pool exhausted — timed out waiting for slot'));
      }, QUEUE_TIMEOUT_MS);

      this.queue.push({ resolve, reject, timer });
    });
  }

  /**
   * Release a slot back to the pool. Closes the browser and services the
   * next queued waiter if any.
   *
   * @param {{browser, page, id, timer}} slot
   */
  async release(slot) {
    clearTimeout(slot.timer);

    // Mark slot as intentionally released so the 'disconnected' event handler
    // (_recoverSlot) does not double-service the queue.
    slot._released = true;

    // Close browser (ignore errors on already-closed)
    try {
      await slot.browser.close();
    } catch (_) {
      // ignore
    }

    this._removeSlot(slot);
    this._serviceNextWaiter();
  }

  /**
   * Leak-safe helper. Guarantees slot release even if fn throws.
   *
   * @param {function({browser, page, id}): Promise<*>} fn
   * @returns {Promise<*>}
   */
  async withSlot(fn) {
    const slot = await this.acquire();
    try {
      return await fn(slot);
    } finally {
      await this.release(slot);
    }
  }

  /**
   * Graceful shutdown — close all browsers and reject all queued waiters.
   */
  async destroyAll() {
    // Reject all queued waiters
    for (const waiter of this.queue) {
      clearTimeout(waiter.timer);
      waiter.reject(new Error('Browser pool destroyed'));
    }
    this.queue = [];

    // Force-close all slots
    const slots = [...this.slots];
    this.slots = [];
    for (const slot of slots) {
      clearTimeout(slot.timer);
      try {
        slot.browser.process()?.kill('SIGKILL');
      } catch (_) {
        // ignore
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Private methods
  // ---------------------------------------------------------------------------

  /**
   * Create a new browser slot, register the hard-kill timer and crash handler.
   * @private
   */
  async _createSlot() {
    const { browser, page } = await createBrowser({ headless: this.headless });

    const slot = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      browser,
      page,
      timer: null,
    };

    // Hard kill after timeoutMs
    slot.timer = setTimeout(() => this._forceKill(slot), this.timeoutMs);

    // Auto-recover on crash
    browser.on('disconnected', () => this._recoverSlot(slot));

    this.slots.push(slot);
    return slot;
  }

  /**
   * Force-kill a slot after the hard timeout elapses.
   * @private
   */
  _forceKill(slot) {
    console.log(`[BrowserPool] Force-killing slot ${slot.id} after timeout`);
    slot._released = true; // Prevent _recoverSlot from double-servicing queue
    try {
      slot.browser.process()?.kill('SIGKILL');
    } catch (_) {
      // ignore
    }
    this._removeSlot(slot);
    this._serviceNextWaiter();
  }

  /**
   * Recover a slot after an unexpected browser crash.
   * No-ops if the slot was already intentionally released (avoids double-
   * servicing the queue when browser.close() triggers 'disconnected').
   * @private
   */
  _recoverSlot(slot) {
    if (slot._released) return; // Normal release already handled cleanup
    console.log(`[BrowserPool] Browser crashed, recovering slot ${slot.id}`);
    clearTimeout(slot.timer);
    this._removeSlot(slot);
    this._serviceNextWaiter();
  }

  /**
   * Remove a slot from the active slots array.
   * @private
   */
  _removeSlot(slot) {
    const idx = this.slots.indexOf(slot);
    if (idx !== -1) this.slots.splice(idx, 1);
  }

  /**
   * Pop the next waiter from the queue and give it a fresh slot.
   * @private
   */
  _serviceNextWaiter() {
    if (this.queue.length === 0) return;
    const waiter = this.queue.shift();
    clearTimeout(waiter.timer);
    this._createSlot().then(waiter.resolve).catch(waiter.reject);
  }
}

// Singleton instance — shared across all HomeBay test flows
const pool = new BrowserPool(3);

module.exports = { pool, BrowserPool };
