const express = require('express');
const router = express.Router();
const SiteAuditor = require('../agent/auditor');
const fs = require('fs');
const path = require('path');
const { safePath, safeId } = require('../utils/safePath');
const { ok, fail, errorHandler } = require('../utils/response');
const { deliverWebhook } = require('../utils/webhook');

// Store active audits
const activeAudits = new Map();
const MAX_MAP_SIZE = 100;
const EVICTION_TTL_MS = 60 * 60 * 1000;

function evictStale(map) {
  if (map.size <= MAX_MAP_SIZE) return;
  const now = Date.now();
  for (const [key, val] of map) {
    if (now - (val._createdAt || 0) > EVICTION_TTL_MS) map.delete(key);
  }
  while (map.size > MAX_MAP_SIZE) {
    map.delete(map.keys().next().value);
  }
}

const PROFILE_DIR = path.join(__dirname, '../../config/audit-profiles');
const AUDIT_REPORTS_DIR = path.join(__dirname, '../../reports/audits');

// Load an audit profile by site name (validated)
function loadProfile(siteName) {
  // Validate siteName to prevent path traversal
  if (!/^[a-zA-Z0-9._-]+$/.test(siteName)) {
    return null;
  }

  const profilePath = path.join(PROFILE_DIR, `${siteName}.json`);

  if (fs.existsSync(profilePath)) {
    return JSON.parse(fs.readFileSync(profilePath, 'utf8'));
  }

  // Try matching by hostname
  if (fs.existsSync(PROFILE_DIR)) {
    const files = fs.readdirSync(PROFILE_DIR).filter(f => f.endsWith('.json'));
    for (const file of files) {
      const profile = JSON.parse(fs.readFileSync(path.join(PROFILE_DIR, file), 'utf8'));
      if (profile.baseUrl && profile.baseUrl.includes(siteName)) {
        return profile;
      }
    }
  }

  return null;
}

// List available audit profiles
router.get('/profiles', (req, res) => {
  if (!fs.existsSync(PROFILE_DIR)) {
    return res.json(ok({ profiles: [] }));
  }

  const profiles = fs.readdirSync(PROFILE_DIR)
    .filter(f => f.endsWith('.json'))
    .map(f => {
      try {
        const profile = JSON.parse(fs.readFileSync(path.join(PROFILE_DIR, f), 'utf8'));
        return {
          name: f.replace('.json', ''),
          site: profile.siteName || profile.baseUrl,
          baseUrl: profile.baseUrl,
          categories: Object.keys(profile).filter(k =>
            !['siteName', 'baseUrl', 'loginPath'].includes(k)
          ),
        };
      } catch {
        return null;
      }
    })
    .filter(Boolean);

  res.json(ok({ profiles }));
});

// Start an audit
router.post('/start', async (req, res) => {
  const { site, baseUrl, useKhai = false, categories = null, profile: profileName = null, webhookUrl = null } = req.body;

  if (!site && !baseUrl) {
    return res.status(400).json(fail('Either site name or baseUrl is required'));
  }

  let profile = null;
  const siteKey = profileName || site;
  if (siteKey) {
    profile = loadProfile(siteKey);
  }

  const resolvedBaseUrl = baseUrl || profile?.baseUrl;
  if (!resolvedBaseUrl) {
    return res.status(400).json(fail('Could not determine baseUrl. Provide baseUrl or use a site with an audit profile.'));
  }

  const auditor = new SiteAuditor({
    baseUrl: resolvedBaseUrl,
    siteName: site || new URL(resolvedBaseUrl).hostname,
    profile: profile || {},
    useKhai,
    categories,
  });

  const auditId = auditor.id;
  evictStale(activeAudits);
  activeAudits.set(auditId, {
    auditor,
    status: 'running',
    site: site || resolvedBaseUrl,
    startTime: new Date().toISOString(),
    webhookUrl: webhookUrl || null,
    webhook: null,
    _createdAt: Date.now()
  });

  (async () => {
    const audit = activeAudits.get(auditId);
    try {
      const results = await auditor.run();
      audit.status = 'completed';
      audit.results = results;
      if (audit.webhookUrl) {
        audit.webhook = await deliverWebhook(audit.webhookUrl, audit.results || {}, {
          operationType: 'audit', operationId: auditId
        });
      }
    } catch (err) {
      console.error('[Audit] Error:', err);
      audit.status = 'error';
      audit.error = 'Audit failed';
      if (audit.webhookUrl) {
        audit.webhook = await deliverWebhook(audit.webhookUrl, { auditId, status: 'error', error: audit.error }, {
          operationType: 'audit', operationId: auditId
        });
      }
    }
  })();

  const startResponse = { auditId, message: 'Audit started', site: site || resolvedBaseUrl, useKhai, categories: categories || 'all' };
  if (webhookUrl) startResponse.webhookUrl = webhookUrl;
  res.json(ok(startResponse));
});

// Get audit status
router.get('/:auditId/status', (req, res) => {
  const { auditId } = req.params;
  const audit = activeAudits.get(auditId);

  if (!audit) {
    try {
      const reportPath = safePath(AUDIT_REPORTS_DIR, `${safeId(auditId)}.json`);
      if (fs.existsSync(reportPath)) {
        return res.json(ok({ auditId, status: 'completed' }));
      }
    } catch (e) {
      return res.status(400).json(fail('Invalid audit ID'));
    }
    return res.status(404).json(fail('Audit not found'));
  }

  const summary = audit.auditor?.results?.summary || {};
  res.json(ok({
    auditId,
    status: audit.status,
    site: audit.site,
    startTime: audit.startTime,
    summary,
    error: audit.error,
    webhook: audit.webhook || null,
  }));
});

// Get audit results
router.get('/:auditId/results', (req, res) => {
  const { auditId } = req.params;

  const audit = activeAudits.get(auditId);
  if (audit?.results) {
    return res.json(ok(audit.results));
  }
  if (audit) {
    return res.json(ok(audit.auditor.results));
  }

  try {
    const reportPath = safePath(AUDIT_REPORTS_DIR, `${safeId(auditId)}.json`);
    if (fs.existsSync(reportPath)) {
      return res.json(ok(JSON.parse(fs.readFileSync(reportPath, 'utf8'))));
    }
  } catch (e) {
    return res.status(400).json(fail('Invalid audit ID'));
  }

  res.status(404).json(fail('Audit results not found'));
});

// List all audits
router.get('/', (req, res) => {
  const audits = [];

  activeAudits.forEach((audit, id) => {
    audits.push({
      id,
      status: audit.status,
      site: audit.site,
      startTime: audit.startTime,
      summary: audit.auditor?.results?.summary || {},
    });
  });

  if (fs.existsSync(AUDIT_REPORTS_DIR)) {
    fs.readdirSync(AUDIT_REPORTS_DIR).forEach(file => {
      if (file.endsWith('.json')) {
        const id = file.replace('.json', '');
        if (!activeAudits.has(id)) {
          try {
            const report = JSON.parse(fs.readFileSync(path.join(AUDIT_REPORTS_DIR, file), 'utf8'));
            audits.push({
              id,
              status: 'completed',
              site: report.site,
              startTime: report.startTime,
              endTime: report.endTime,
              summary: report.summary,
            });
          } catch {
            // Skip invalid
          }
        }
      }
    });
  }

  audits.sort((a, b) => new Date(b.startTime) - new Date(a.startTime));
  res.json(ok({ audits }));
});

// Delete an audit
router.delete('/:auditId', (req, res) => {
  try {
    const auditId = safeId(req.params.auditId);
    activeAudits.delete(auditId);

    const reportPath = safePath(AUDIT_REPORTS_DIR, `${auditId}.json`);
    if (fs.existsSync(reportPath)) {
      fs.unlinkSync(reportPath);
    }

    res.json(ok({ message: 'Audit deleted', auditId }));
  } catch (e) {
    res.status(400).json(fail('Invalid audit ID'));
  }
});

module.exports = router;
