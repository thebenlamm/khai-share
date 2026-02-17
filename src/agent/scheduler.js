const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');
const { URL } = require('url');
const { v4: uuidv4 } = require('uuid');
const SiteAuditor = require('./auditor');

const SCHEDULES_PATH = path.join(__dirname, '../../config/schedules.json');

/**
 * AuditScheduler - Runs SiteAuditor on a recurring schedule with webhook/email
 * notifications and regression detection against previous runs.
 */
class AuditScheduler {
  constructor() {
    this.schedules = new Map();  // id -> schedule config
    this.timers = new Map();     // id -> setInterval handle
    this.history = new Map();    // id -> [{ runId, timestamp, summary, regressions }]
    this._load();
  }

  addSchedule(config) {
    const schedule = {
      id: config.id || uuidv4(),
      site: config.site,
      interval: config.interval,
      useKhai: config.useKhai || false,
      categories: config.categories || null,
      webhookUrl: config.webhookUrl || null,
      emailCallback: config.emailCallback || null,
      enabled: config.enabled !== undefined ? config.enabled : true,
      createdAt: new Date().toISOString(),
    };
    this.schedules.set(schedule.id, schedule);
    this.history.set(schedule.id, []);
    this._save();
    console.log(`[Scheduler] Added "${schedule.id}" for ${schedule.site} every ${this._fmtInterval(schedule.interval)}`);
    return schedule;
  }

  removeSchedule(id) {
    this.stop(id);
    this.schedules.delete(id);
    this.history.delete(id);
    this._save();
    console.log(`[Scheduler] Removed "${id}"`);
  }

  getSchedules() {
    return [...this.schedules.entries()].map(([id, s]) => ({
      ...s, running: this.timers.has(id), lastRun: this._getLastRun(id),
    }));
  }

  start(id) {
    const schedule = this.schedules.get(id);
    if (!schedule) { console.error(`[Scheduler] "${id}" not found`); return false; }
    if (this.timers.has(id)) { console.log(`[Scheduler] "${id}" already running`); return true; }
    console.log(`[Scheduler] Starting "${id}" (every ${this._fmtInterval(schedule.interval)})`);
    this._runAudit(schedule);
    this.timers.set(id, setInterval(() => this._runAudit(schedule), schedule.interval));
    return true;
  }

  stop(id) {
    const timer = this.timers.get(id);
    if (!timer) return false;
    clearInterval(timer);
    this.timers.delete(id);
    console.log(`[Scheduler] Stopped "${id}"`);
    return true;
  }

  startAll() {
    let n = 0;
    for (const [id, s] of this.schedules) { if (s.enabled) { this.start(id); n++; } }
    console.log(`[Scheduler] Started ${n} schedule(s)`);
  }

  stopAll() {
    for (const id of this.timers.keys()) this.stop(id);
    console.log('[Scheduler] All schedules stopped');
  }

  getHistory(id, limit = 10) {
    return (this.history.get(id) || []).slice(-limit);
  }

  // ===========================
  // Internal: audit execution
  // ===========================

  async _runAudit(schedule) {
    const runId = uuidv4();
    const timestamp = new Date().toISOString();
    console.log(`\n[Scheduler] Running audit "${schedule.id}" (run: ${runId})`);

    try {
      const auditor = new SiteAuditor({
        baseUrl: schedule.site, useKhai: schedule.useKhai, categories: schedule.categories,
      });
      const results = await auditor.run();
      const summary = results.summary;

      const prevRuns = this.history.get(schedule.id) || [];
      const prev = prevRuns.length > 0 ? prevRuns[prevRuns.length - 1] : null;
      const regressions = prev ? this._compareWithPrevious(summary, prev.summary) : [];

      const record = { runId, timestamp, auditId: results.id, summary, regressions, duration: results.duration };
      if (!this.history.has(schedule.id)) this.history.set(schedule.id, []);
      const hist = this.history.get(schedule.id);
      hist.push(record);
      if (hist.length > 50) this.history.set(schedule.id, hist.slice(-50));

      console.log(`[Scheduler] Audit "${schedule.id}" done: ${summary.passed} passed, ${summary.failed} failed`);
      if (regressions.length > 0) console.log(`[Scheduler] WARNING: ${regressions.length} regression(s)!`);

      await this._notify(schedule, record, regressions);
      this._save();
      return record;
    } catch (err) {
      console.error(`[Scheduler] Audit "${schedule.id}" failed:`, err.message);
      const record = {
        runId, timestamp, summary: { total: 0, passed: 0, failed: 0, warnings: 0, skipped: 0 },
        regressions: [], error: err.message,
      };
      if (!this.history.has(schedule.id)) this.history.set(schedule.id, []);
      this.history.get(schedule.id).push(record);
      this._save();
      return record;
    }
  }

  // ===========================
  // Regression detection
  // ===========================

  _compareWithPrevious(current, previous) {
    if (!previous) return [];
    const regressions = [];
    if (current.failed > previous.failed) {
      regressions.push({ type: 'more_failures', message: `Failures increased from ${previous.failed} to ${current.failed}`, delta: current.failed - previous.failed });
    }
    if (current.passed < previous.passed) {
      regressions.push({ type: 'fewer_passes', message: `Passes decreased from ${previous.passed} to ${current.passed}`, delta: previous.passed - current.passed });
    }
    if (current.warnings > previous.warnings) {
      regressions.push({ type: 'more_warnings', message: `Warnings increased from ${previous.warnings} to ${current.warnings}`, delta: current.warnings - previous.warnings });
    }
    const prevRate = previous.total > 0 ? previous.passed / previous.total : 1;
    const currRate = current.total > 0 ? current.passed / current.total : 1;
    if (currRate < prevRate - 0.05) {
      regressions.push({ type: 'pass_rate_drop', message: `Pass rate dropped from ${(prevRate * 100).toFixed(1)}% to ${(currRate * 100).toFixed(1)}%`, previous: prevRate, current: currRate });
    }
    return regressions;
  }

  // ===========================
  // Notifications
  // ===========================

  async _notify(schedule, record, regressions) {
    const payload = {
      scheduleId: schedule.id, site: schedule.site, runId: record.runId,
      timestamp: record.timestamp, duration: record.duration,
      summary: record.summary, regressions, hasRegressions: regressions.length > 0,
    };

    if (schedule.webhookUrl) {
      try {
        await this._postWebhook(schedule.webhookUrl, payload);
        console.log(`[Scheduler] Webhook sent to ${schedule.webhookUrl}`);
      } catch (err) {
        console.error(`[Scheduler] Webhook failed: ${err.message}`);
      }
    }

    if (schedule.emailCallback && typeof schedule.emailCallback === 'function') {
      try {
        const subject = regressions.length > 0
          ? `[REGRESSION] Audit: ${schedule.site} - ${record.summary.failed} failures`
          : `Audit: ${schedule.site} - ${record.summary.passed}/${record.summary.total} passed`;
        await schedule.emailCallback({ subject, body: JSON.stringify(payload, null, 2), regressions });
        console.log('[Scheduler] Email notification sent');
      } catch (err) {
        console.error(`[Scheduler] Email notification failed: ${err.message}`);
      }
    }
  }

  _postWebhook(webhookUrl, payload) {
    return new Promise((resolve, reject) => {
      const mod = new URL(webhookUrl).protocol === 'https:' ? https : http;
      const body = JSON.stringify(payload);
      const req = mod.request(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
        timeout: 10000,
      }, (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => resolve({ status: res.statusCode, body: data }));
      });
      req.on('error', reject);
      req.on('timeout', () => { req.destroy(); reject(new Error('Webhook timeout')); });
      req.write(body);
      req.end();
    });
  }

  // ===========================
  // Persistence
  // ===========================

  _save() {
    try {
      const data = { schedules: [], history: {} };
      for (const [, schedule] of this.schedules) {
        const { emailCallback, ...serializable } = schedule;
        data.schedules.push(serializable);
      }
      for (const [id, runs] of this.history) data.history[id] = runs;
      fs.mkdirSync(path.dirname(SCHEDULES_PATH), { recursive: true });
      fs.writeFileSync(SCHEDULES_PATH, JSON.stringify(data, null, 2));
    } catch (err) {
      console.error('[Scheduler] Save failed:', err.message);
    }
  }

  _load() {
    try {
      if (!fs.existsSync(SCHEDULES_PATH)) return;
      const data = JSON.parse(fs.readFileSync(SCHEDULES_PATH, 'utf-8'));
      if (data.schedules) {
        for (const s of data.schedules) this.schedules.set(s.id, s);
      }
      if (data.history) {
        for (const [id, runs] of Object.entries(data.history)) this.history.set(id, runs);
      }
      console.log(`[Scheduler] Loaded ${this.schedules.size} schedule(s) from disk`);
    } catch (err) {
      console.error('[Scheduler] Load failed:', err.message);
    }
  }

  _fmtInterval(ms) {
    if (ms < 60000) return `${Math.round(ms / 1000)}s`;
    if (ms < 3600000) return `${Math.round(ms / 60000)}m`;
    return `${(ms / 3600000).toFixed(1)}h`;
  }

  _getLastRun(id) {
    const runs = this.history.get(id) || [];
    return runs.length > 0 ? runs[runs.length - 1] : null;
  }
}

module.exports = AuditScheduler;
