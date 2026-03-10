'use strict';

const express = require('express');
const router = express.Router();
const { WatchManager } = require('../agent/watchManager');
const { safeId } = require('../utils/safePath');
const { ok, fail, errorHandler } = require('../utils/response');

// Module-level singleton — shared between routes and server startup
const manager = new WatchManager();
module.exports = router;
module.exports.manager = manager;

// POST /api/watches — Create a watch
router.post('/', async (req, res) => {
  const { site, account, url, schedule, selector, webhookUrl, enabled } = req.body;

  if (!site || !account || !url || !schedule) {
    return res.status(400).json(fail('site, account, url, and schedule are required'));
  }

  try {
    const watch = manager.addWatch({ site, account, url, schedule, selector, webhookUrl, enabled });
    return res.status(201).json(ok(watch));
  } catch (err) {
    if (err.message && err.message.includes('cron')) {
      return res.status(400).json(fail(err.message));
    }
    if (err.message && err.message.toLowerCase().includes('invalid cron')) {
      return res.status(400).json(fail(err.message));
    }
    return errorHandler(res, err, 'POST /api/watches');
  }
});

// GET /api/watches — List all watches
router.get('/', (req, res) => {
  return res.json(ok({ watches: manager.listWatches() }));
});

// GET /api/watches/:id — Get a single watch
router.get('/:id', (req, res) => {
  try {
    safeId(req.params.id);
  } catch (err) {
    return res.status(400).json(fail(err.message));
  }

  const watch = manager.getWatch(req.params.id);
  if (!watch) {
    return res.status(404).json(fail('Watch not found'));
  }
  return res.json(ok(watch));
});

// PUT /api/watches/:id — Update a watch
router.put('/:id', async (req, res) => {
  try {
    safeId(req.params.id);
  } catch (err) {
    return res.status(400).json(fail(err.message));
  }

  const allowed = ['url', 'selector', 'schedule', 'webhookUrl', 'enabled'];
  const updates = {};
  for (const key of allowed) {
    if (req.body[key] !== undefined) {
      updates[key] = req.body[key];
    }
  }

  try {
    const updated = manager.updateWatch(req.params.id, updates);
    if (updated === null) {
      return res.status(404).json(fail('Watch not found'));
    }
    return res.json(ok(updated));
  } catch (err) {
    if (err.message && (err.message.includes('cron') || err.message.toLowerCase().includes('invalid cron'))) {
      return res.status(400).json(fail(err.message));
    }
    return errorHandler(res, err, 'PUT /api/watches/:id');
  }
});

// DELETE /api/watches/:id — Delete a watch
router.delete('/:id', (req, res) => {
  try {
    safeId(req.params.id);
  } catch (err) {
    return res.status(400).json(fail(err.message));
  }

  const removed = manager.removeWatch(req.params.id);
  if (!removed) {
    return res.status(404).json(fail('Watch not found'));
  }
  return res.json(ok({ deleted: true }));
});

// GET /api/watches/:id/history — Get run history
router.get('/:id/history', (req, res) => {
  try {
    safeId(req.params.id);
  } catch (err) {
    return res.status(400).json(fail(err.message));
  }

  const watch = manager.getWatch(req.params.id);
  if (!watch) {
    return res.status(404).json(fail('Watch not found'));
  }

  const limit = parseInt(req.query.limit) || 20;
  const history = manager.getHistory(req.params.id, limit);
  return res.json(ok({ watchId: req.params.id, history }));
});

// POST /api/watches/:id/run — Trigger immediate manual run (fire-and-forget)
router.post('/:id/run', (req, res) => {
  try {
    safeId(req.params.id);
  } catch (err) {
    return res.status(400).json(fail(err.message));
  }

  const watch = manager.getWatch(req.params.id);
  if (!watch) {
    return res.status(404).json(fail('Watch not found'));
  }

  // Fire-and-forget — same pattern as scheduled runs
  manager._runWatch(watch.id);

  return res.status(202).json(ok({ message: 'Run triggered', watchId: watch.id }));
});
