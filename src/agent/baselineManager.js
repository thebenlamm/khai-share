'use strict';

const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const { safePath, safeId } = require('../utils/safePath');

const DEFAULT_THRESHOLDS = {
  responseTime: 5000,   // ms - individual page load time
  pageLoadTime: 10000   // ms - slow page threshold
};

class BaselineManager {
  constructor() {
    this.baselinesPath = path.join(__dirname, '../../config/baselines.json');
    this.reportsDir = path.join(__dirname, '../../reports');
    this.baselines = [];
    this._load();
  }

  /**
   * Create a baseline from a completed crawl test.
   * @param {string} testId - UUID of the completed crawl test
   * @param {Object} thresholds - optional custom thresholds to override defaults
   * @returns {Object} created baseline
   */
  createBaseline(testId, thresholds = {}) {
    // Validate and sanitize the testId
    const safeTestId = safeId(testId);

    // Read the completed test report
    const reportPath = safePath(this.reportsDir, safeTestId + '.json');
    if (!fs.existsSync(reportPath)) {
      throw new Error(`Test report not found: ${testId}`);
    }

    let report;
    try {
      report = JSON.parse(fs.readFileSync(reportPath, 'utf-8'));
    } catch (err) {
      throw new Error(`Failed to read test report: ${err.message}`);
    }

    if (!report.pages || report.pages.length === 0) {
      throw new Error('Test report has no pages — cannot create baseline');
    }

    const { site, account } = report;
    if (!site || !account) {
      throw new Error('Test report missing site or account fields');
    }

    // Enforce one baseline per site+account
    const existing = this.getBaselineForSite(site, account);
    if (existing) {
      throw new Error(
        `A baseline already exists for ${site} / ${account} (id: ${existing.id}). ` +
        `Use updateBaseline() to update it, or deleteBaseline() to remove it first.`
      );
    }

    const now = new Date().toISOString();
    const mergedThresholds = { ...DEFAULT_THRESHOLDS, ...thresholds };

    const snapshot = {
      capturedAt: now,
      pageCount: report.pages.length,
      pages: report.pages.map(p => ({
        url: p.url,
        title: p.title || null,
        status: p.status,
        loadTime: p.loadTime
      }))
    };

    const baseline = {
      id: uuidv4(),
      site,
      account,
      sourceTestId: testId,
      createdAt: now,
      updatedAt: now,
      thresholds: mergedThresholds,
      snapshot
    };

    this.baselines.push(baseline);
    this._save();
    return baseline;
  }

  /**
   * Update an existing baseline from a new crawl test.
   * Preserves the baseline ID and existing thresholds.
   * @param {string} baselineId - existing baseline ID
   * @param {string} testId - UUID of the new crawl test
   * @returns {Object} updated baseline
   */
  updateBaseline(baselineId, testId) {
    const safeBaselineId = safeId(baselineId);
    const safeTestId = safeId(testId);

    const idx = this.baselines.findIndex(b => b.id === safeBaselineId);
    if (idx === -1) {
      throw new Error(`Baseline not found: ${baselineId}`);
    }

    // Read the new test report
    const reportPath = safePath(this.reportsDir, safeTestId + '.json');
    if (!fs.existsSync(reportPath)) {
      throw new Error(`Test report not found: ${testId}`);
    }

    let report;
    try {
      report = JSON.parse(fs.readFileSync(reportPath, 'utf-8'));
    } catch (err) {
      throw new Error(`Failed to read test report: ${err.message}`);
    }

    if (!report.pages || report.pages.length === 0) {
      throw new Error('Test report has no pages — cannot update baseline');
    }

    const now = new Date().toISOString();
    const existing = this.baselines[idx];

    const snapshot = {
      capturedAt: now,
      pageCount: report.pages.length,
      pages: report.pages.map(p => ({
        url: p.url,
        title: p.title || null,
        status: p.status,
        loadTime: p.loadTime
      }))
    };

    const updated = {
      ...existing,
      sourceTestId: testId,
      updatedAt: now,
      snapshot
    };

    this.baselines[idx] = updated;
    this._save();
    return updated;
  }

  /**
   * Get a baseline by ID.
   * @param {string} baselineId
   * @returns {Object|null}
   */
  getBaseline(baselineId) {
    return this.baselines.find(b => b.id === baselineId) || null;
  }

  /**
   * Find a baseline by site+account combo.
   * @param {string} site
   * @param {string} account
   * @returns {Object|null}
   */
  getBaselineForSite(site, account) {
    return this.baselines.find(b => b.site === site && b.account === account) || null;
  }

  /**
   * List all baselines, optionally filtered by site.
   * Returns metadata only — full snapshot.pages is excluded for brevity.
   * @param {string|null} site - optional site filter
   * @returns {Array}
   */
  listBaselines(site = null) {
    const filtered = site
      ? this.baselines.filter(b => b.site === site)
      : this.baselines;

    return filtered.map(b => ({
      id: b.id,
      site: b.site,
      account: b.account,
      sourceTestId: b.sourceTestId,
      createdAt: b.createdAt,
      updatedAt: b.updatedAt,
      thresholds: b.thresholds,
      snapshot: {
        capturedAt: b.snapshot.capturedAt,
        pageCount: b.snapshot.pageCount
      }
    }));
  }

  /**
   * Delete a baseline by ID.
   * @param {string} baselineId
   * @returns {boolean} true if deleted, false if not found
   */
  deleteBaseline(baselineId) {
    const idx = this.baselines.findIndex(b => b.id === baselineId);
    if (idx === -1) return false;

    this.baselines.splice(idx, 1);
    this._save();
    return true;
  }

  // ---------------------------------------------------------------------------
  // Private methods
  // ---------------------------------------------------------------------------

  _save() {
    try {
      const data = { baselines: this.baselines };
      const tmp = this.baselinesPath + '.tmp';
      fs.mkdirSync(path.dirname(this.baselinesPath), { recursive: true });
      fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
      fs.renameSync(tmp, this.baselinesPath);
    } catch (err) {
      console.error('[BaselineManager] Save failed:', err.message);
    }
  }

  _load() {
    if (!fs.existsSync(this.baselinesPath)) return;
    try {
      const data = JSON.parse(fs.readFileSync(this.baselinesPath, 'utf-8'));
      if (Array.isArray(data.baselines)) {
        this.baselines = data.baselines;
      }
      console.log('[BaselineManager] Loaded', this.baselines.length, 'baseline(s) from disk');
    } catch (err) {
      console.error('[BaselineManager] Load failed:', err.message);
    }
  }
}

module.exports = BaselineManager;
