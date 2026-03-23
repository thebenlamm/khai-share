'use strict';

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

module.exports = { JobStore };
