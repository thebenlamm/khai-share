'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const cron = require('node-cron');
const { v4: uuidv4 } = require('uuid');
const { PNG } = require('pngjs');
const _pixelmatch = require('pixelmatch');
const pixelmatch = _pixelmatch.default || _pixelmatch;
const { createBrowser } = require('../utils/browser');
const { loadCredentials } = require('../utils/config');
const { deliverWebhook } = require('../utils/webhook');

class WatchManager {
  constructor() {
    this.watchesPath = path.join(__dirname, '../../config/watches.json');
    this.screenshotsBase = path.join(__dirname, '../../screenshots/watches');
    this.watches = new Map();
    this.history = new Map();
    this.cronJobs = new Map();
    this._load();
  }

  /**
   * Add a new watch.
   * @param {Object} config - { site, account, url, schedule, selector?, webhookUrl?, enabled? }
   * @returns {Object} watch
   */
  addWatch(config) {
    const { site, account, url, schedule } = config;
    if (!site || !account || !url || !schedule) {
      throw new Error('site, account, url, and schedule are required');
    }
    if (!cron.validate(schedule)) {
      throw new Error('Invalid cron expression: ' + schedule);
    }

    const now = new Date().toISOString();
    const watch = {
      id: uuidv4(),
      site,
      account,
      url,
      selector: config.selector || null,
      schedule,
      webhookUrl: config.webhookUrl || null,
      enabled: config.enabled !== undefined ? config.enabled : true,
      createdAt: now,
      updatedAt: now,
    };

    this.watches.set(watch.id, watch);
    this.history.set(watch.id, []);
    if (watch.enabled) {
      this._scheduleWatch(watch);
    }
    this._save();
    return watch;
  }

  /**
   * Update an existing watch.
   * @param {string} id
   * @param {Object} updates - allowed fields: url, selector, schedule, webhookUrl, enabled
   * @returns {Object|null} updated watch or null if not found
   */
  updateWatch(id, updates) {
    if (!this.watches.has(id)) return null;

    const existing = this.watches.get(id);

    // Validate new schedule if provided
    if (updates.schedule !== undefined) {
      if (!cron.validate(updates.schedule)) {
        throw new Error('Invalid cron expression: ' + updates.schedule);
      }
    }

    // Only allow whitelisted fields
    const allowed = ['url', 'selector', 'schedule', 'webhookUrl', 'enabled'];
    const merged = { ...existing };
    for (const key of allowed) {
      if (updates[key] !== undefined) {
        merged[key] = updates[key];
      }
    }
    merged.updatedAt = new Date().toISOString();

    // Stop existing cron job
    const existingJob = this.cronJobs.get(id);
    if (existingJob) {
      existingJob.stop();
      this.cronJobs.delete(id);
    }

    this.watches.set(id, merged);
    if (merged.enabled) {
      this._scheduleWatch(merged);
    }
    this._save();
    return merged;
  }

  /**
   * Remove a watch by id.
   * @param {string} id
   * @returns {boolean} true if removed, false if not found
   */
  removeWatch(id) {
    if (!this.watches.has(id)) return false;

    // Stop cron job
    const job = this.cronJobs.get(id);
    if (job) {
      job.stop();
      this.cronJobs.delete(id);
    }

    this.watches.delete(id);
    this.history.delete(id);

    // Delete screenshot directory
    const screenshotDir = path.join(this.screenshotsBase, id);
    if (fs.existsSync(screenshotDir)) {
      fs.rmSync(screenshotDir, { recursive: true, force: true });
    }

    this._save();
    return true;
  }

  /**
   * Get a watch by id.
   * @param {string} id
   * @returns {Object|null}
   */
  getWatch(id) {
    return this.watches.get(id) || null;
  }

  /**
   * List all watches with a `running` field indicating active cron job.
   * @returns {Array}
   */
  listWatches() {
    return [...this.watches.values()].map(w => ({
      ...w,
      running: this.cronJobs.has(w.id),
    }));
  }

  /**
   * Get run history for a watch.
   * @param {string} id
   * @param {number} [limit=20]
   * @returns {Array}
   */
  getHistory(id, limit = 20) {
    return (this.history.get(id) || []).slice(-limit);
  }

  /**
   * Start all enabled watches.
   */
  startAll() {
    let count = 0;
    for (const watch of this.watches.values()) {
      if (watch.enabled) {
        this._scheduleWatch(watch);
        count++;
      }
    }
    console.log('[WatchManager] Started', count, 'watch(es)');
  }

  /**
   * Stop all running cron jobs.
   */
  stopAll() {
    for (const task of this.cronJobs.values()) {
      task.stop();
    }
    this.cronJobs.clear();
  }

  // -------------------------------------------------------------------------
  // Private methods
  // -------------------------------------------------------------------------

  _scheduleWatch(watch) {
    // Stop any existing job for this watch
    const existing = this.cronJobs.get(watch.id);
    if (existing) {
      existing.stop();
      this.cronJobs.delete(watch.id);
    }

    const task = cron.schedule(watch.schedule, () => this._runWatch(watch.id), {
      timezone: 'UTC',
    });
    this.cronJobs.set(watch.id, task);
    console.log('[WatchManager] Scheduled watch', watch.id, 'on', watch.schedule);
  }

  async _runWatch(watchId) {
    const watch = this.watches.get(watchId);
    if (!watch) return;

    const runId = uuidv4();
    const timestamp = new Date().toISOString();
    const screenshotDir = path.join(this.screenshotsBase, watchId);
    const screenshotPath = path.join(screenshotDir, runId + '.png');
    const screenshotRelative = path.relative(path.join(__dirname, '../..'), screenshotPath);

    fs.mkdirSync(screenshotDir, { recursive: true });

    // Load credentials
    let credentials, siteConfig, accountConfig;
    try {
      credentials = loadCredentials();
    } catch (err) {
      const record = {
        runId, watchId, timestamp,
        status: 'error',
        contentHash: '',
        screenshotPath: screenshotRelative,
        contentText: '',
        changed: false,
        diff: null,
        webhook: null,
        error: 'Failed to load credentials: ' + err.message,
      };
      this._appendRecord(watchId, record);
      this._save();
      return;
    }

    siteConfig = credentials.sites[watch.site];
    if (!siteConfig) {
      const record = {
        runId, watchId, timestamp,
        status: 'error',
        contentHash: '',
        screenshotPath: screenshotRelative,
        contentText: '',
        changed: false,
        diff: null,
        webhook: null,
        error: 'Site not found: ' + watch.site,
      };
      this._appendRecord(watchId, record);
      this._save();
      console.log('[WatchManager] Watch', watchId, 'run', runId, ': error (site not found)');
      return;
    }

    accountConfig = siteConfig.accounts[watch.account];
    if (!accountConfig) {
      const record = {
        runId, watchId, timestamp,
        status: 'error',
        contentHash: '',
        screenshotPath: screenshotRelative,
        contentText: '',
        changed: false,
        diff: null,
        webhook: null,
        error: 'Account not found: ' + watch.account,
      };
      this._appendRecord(watchId, record);
      this._save();
      console.log('[WatchManager] Watch', watchId, 'run', runId, ': error (account not found)');
      return;
    }

    const fullUrl = watch.url.startsWith('http')
      ? watch.url
      : siteConfig.baseUrl + watch.url;

    try {
      const { browser, page } = await createBrowser();
      let loggedIn = true;

      if (!accountConfig.skipLogin) {
        await page.goto(siteConfig.baseUrl + accountConfig.loginUrl, {
          waitUntil: 'networkidle2',
          timeout: 30000,
        });
        await page.waitForTimeout(3000);

        try {
          const usernameSelector = 'input[type="email"], input[name="username"], input[name="email"], input[name="user_login"]';
          await page.$eval(usernameSelector, (el, val) => { el.value = val; }, accountConfig.username);
          await page.$eval('input[type="password"]', (el, val) => { el.value = val; }, accountConfig.password);

          await Promise.all([
            page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 15000 }).catch(() => {}),
            page.$eval('form', f => f.submit()).catch(() =>
              page.$eval('[type="submit"], button[type="submit"]', b => b.click())
            ),
          ]);
          await page.waitForTimeout(2000);

          // Detect login failure: still on login URL path
          const currentUrl = page.url();
          if (currentUrl.includes(accountConfig.loginUrl)) {
            loggedIn = false;
          }
        } catch (loginErr) {
          loggedIn = false;
          console.error('[WatchManager] Login error:', loginErr.message);
        }
      }

      if (!loggedIn) {
        await browser.close();
        const record = {
          runId, watchId, timestamp,
          status: 'login-failed',
          contentHash: '',
          screenshotPath: screenshotRelative,
          contentText: '',
          changed: false,
          diff: null,
          webhook: null,
          error: 'Login failed',
        };
        this._appendRecord(watchId, record);
        this._save();
        console.log('[WatchManager] Watch', watchId, 'run', runId, ': login-failed');
        return;
      }

      await page.goto(fullUrl, { waitUntil: 'networkidle2', timeout: 30000 });
      await page.waitForTimeout(1000);

      // Extract content
      let contentText = '';
      if (watch.selector) {
        try {
          contentText = await page.$eval(watch.selector, el => el.innerText);
        } catch (_) {
          // selector not found — leave empty
        }
      } else {
        contentText = await page.$eval('body', el => el.innerText);
      }
      contentText = contentText.slice(0, 50 * 1024);

      await page.screenshot({ path: screenshotPath, fullPage: true });
      await browser.close();

      // Hash content
      const contentHash = crypto.createHash('sha256').update(contentText).digest('hex');

      // Get previous run
      const prevRuns = this.history.get(watchId) || [];
      const prevRun = prevRuns.length > 0 ? prevRuns[prevRuns.length - 1] : null;

      // Compute diff
      let diff = null;
      let changed = false;

      if (prevRun) {
        const contentChanged = contentHash !== prevRun.contentHash;
        let visualChanged = false;
        let pixelDiffPercent = null;

        // Visual diff using pixelmatch
        const prevScreenshotAbs = path.join(__dirname, '../..', prevRun.screenshotPath);
        if (fs.existsSync(prevScreenshotAbs) && fs.existsSync(screenshotPath)) {
          try {
            const prevPng = PNG.sync.read(fs.readFileSync(prevScreenshotAbs));
            const currPng = PNG.sync.read(fs.readFileSync(screenshotPath));
            if (prevPng.width === currPng.width && prevPng.height === currPng.height) {
              const { width, height } = currPng;
              const diffPng = new PNG({ width, height });
              const numDiffPixels = pixelmatch(
                prevPng.data, currPng.data, diffPng.data, width, height,
                { threshold: 0.1 }
              );
              pixelDiffPercent = numDiffPixels / (width * height);
              visualChanged = pixelDiffPercent > 0.01;
            }
          } catch (diffErr) {
            console.error('[WatchManager] Visual diff error:', diffErr.message);
          }
        }

        changed = contentChanged || visualChanged;
        diff = {
          contentChanged,
          visualChanged,
          pixelDiffPercent,
          contentBefore: prevRun.contentText ? prevRun.contentText.slice(0, 500) : null,
          contentAfter: contentText.slice(0, 500),
        };
      }

      const status = changed ? 'changed' : 'completed';

      // Fire webhook on change
      let webhookResult = null;
      if (changed && watch.webhookUrl) {
        const payload = {
          watchId,
          runId,
          watch: {
            site: watch.site,
            account: watch.account,
            url: watch.url,
            selector: watch.selector,
          },
          diff,
          contentText,
          screenshotPath: screenshotRelative,
          timestamp,
        };
        webhookResult = await deliverWebhook(watch.webhookUrl, payload, {
          operationType: 'watch',
          operationId: runId,
        });
      }

      const record = {
        runId,
        watchId,
        timestamp,
        status,
        contentHash,
        screenshotPath: screenshotRelative,
        contentText,
        changed,
        diff,
        webhook: webhookResult,
        error: null,
      };
      this._appendRecord(watchId, record);
      this._save();
      console.log('[WatchManager] Watch', watchId, 'run', runId, ': status=' + status);

    } catch (err) {
      console.error('[WatchManager] Run error for watch', watchId, ':', err.message);
      const record = {
        runId,
        watchId,
        timestamp,
        status: 'error',
        contentHash: '',
        screenshotPath: screenshotRelative,
        contentText: '',
        changed: false,
        diff: null,
        webhook: null,
        error: err.message,
      };
      this._appendRecord(watchId, record);
      this._save();
    }
  }

  _appendRecord(watchId, record) {
    if (!this.history.has(watchId)) {
      this.history.set(watchId, []);
    }
    const hist = this.history.get(watchId);
    hist.push(record);
    if (hist.length > 100) {
      this.history.set(watchId, hist.slice(-100));
    }
  }

  _save() {
    try {
      const data = {
        watches: [...this.watches.values()],
        history: Object.fromEntries(this.history),
      };
      const tmp = this.watchesPath + '.tmp';
      fs.mkdirSync(path.dirname(this.watchesPath), { recursive: true });
      fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
      fs.renameSync(tmp, this.watchesPath);
    } catch (err) {
      console.error('[WatchManager] Save failed:', err.message);
    }
  }

  _load() {
    if (!fs.existsSync(this.watchesPath)) return;
    try {
      const data = JSON.parse(fs.readFileSync(this.watchesPath, 'utf-8'));
      if (data.watches) {
        for (const w of data.watches) {
          this.watches.set(w.id, w);
        }
      }
      if (data.history) {
        for (const [id, runs] of Object.entries(data.history)) {
          this.history.set(id, runs);
        }
      }
      console.log('[WatchManager] Loaded', this.watches.size, 'watch(es) from disk');
    } catch (err) {
      console.error('[WatchManager] Load failed:', err.message);
    }
  }
}

module.exports = { WatchManager };
