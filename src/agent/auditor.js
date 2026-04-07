'use strict';

const { v4: uuidv4 } = require('uuid');
const fs = require('fs');
const path = require('path');
const { AuditContext } = require('./audit-checks/context');
const { checkModules } = require('./audit-checks');

/**
 * SiteAuditor - Thin orchestrator that delegates all audit checks to modules.
 *
 * Test categories (14 total):
 *   publicPages, redirects, securityHeaders, cookieSecurity, cors,
 *   authBypass, sensitivePaths, apiEndpoints, rateLimiting, ssl,
 *   seo, performance, authenticated, authorization
 *
 * Public API (unchanged from monolithic version):
 *   new SiteAuditor({ baseUrl, profile, useKhai, khaiPort, siteName, categories })
 *   auditor.id         — UUID string
 *   auditor.results    — result object (populated after run())
 *   await auditor.run() — runs all checks, returns results
 */
class SiteAuditor {
  constructor(config) {
    this.baseUrl = config.baseUrl;
    this.profile = config.profile || {};
    this.useKhai = config.useKhai || false;
    this.khaiPort = config.khaiPort || 3001;
    this.siteName = config.siteName || new URL(config.baseUrl).hostname;
    this.categories = config.categories || null; // null = run all
    this.id = uuidv4();
    this.results = {
      id: this.id,
      site: this.baseUrl,
      siteName: this.siteName,
      startTime: null,
      endTime: null,
      categories: {},
      summary: { total: 0, passed: 0, failed: 0, warnings: 0, skipped: 0 },
    };
    this.reportsDir = path.join(__dirname, '../../reports/audits');
    fs.mkdirSync(this.reportsDir, { recursive: true });
  }

  async run() {
    this.results.startTime = new Date().toISOString();
    const startMs = Date.now();
    console.log(`\n[Audit] Starting audit of ${this.siteName} (${this.baseUrl})`);
    console.log(`[Audit] ID: ${this.id}`);

    // Create shared context — pass this.results so check modules accumulate into it directly
    const ctx = new AuditContext({
      baseUrl: this.baseUrl,
      profile: this.profile,
      useKhai: this.useKhai,
      khaiPort: this.khaiPort,
      siteName: this.siteName,
      categories: this.categories,
      results: this.results,
    });

    // Check Khai availability
    if (this.useKhai) {
      const available = await ctx._isKhaiAvailable();
      if (!available) {
        console.log('[Audit] WARNING: Khai not available. Authenticated tests will be skipped.');
        ctx.useKhai = false;
        this.useKhai = false;
      } else {
        console.log('[Audit] Khai is available for authenticated tests.');
      }
    }

    // Delegate each category to its check module
    for (const [name, mod] of Object.entries(checkModules)) {
      if (!ctx._shouldRun(name)) continue;
      console.log(`\n[Audit] Running: ${name}`);
      try {
        await mod.run(ctx);
      } catch (err) {
        console.error(`[Audit] Error in ${name}:`, err.message);
        ctx._addResult(name, `Category error: ${name}`, 'fail', err.message);
      }
    }

    this.results.endTime = new Date().toISOString();
    this.results.duration = Date.now() - startMs;

    // Save report
    const reportPath = path.join(this.reportsDir, `${this.id}.json`);
    fs.writeFileSync(reportPath, JSON.stringify(this.results, null, 2));
    console.log(`\n[Audit] Complete. ${this.results.summary.passed} passed, ${this.results.summary.failed} failed, ${this.results.summary.warnings} warnings`);
    console.log(`[Audit] Report saved: ${reportPath}`);

    return this.results;
  }
}

module.exports = { SiteAuditor };
