'use strict';

const express = require('express');
const router = express.Router();
const BaselineManager = require('../agent/baselineManager');
const { safeId } = require('../utils/safePath');
const { ok, fail, errorHandler } = require('../utils/response');

// Module-level singleton — shared between routes and server startup
const manager = new BaselineManager();
module.exports = router;
module.exports.manager = manager;

/**
 * Map error messages from BaselineManager to appropriate HTTP status codes.
 * "not found" -> 404
 * "already exists" -> 409
 * Other -> 500 (errorHandler)
 */
function mapError(res, err, context) {
  const msg = err.message || '';
  if (msg.toLowerCase().includes('not found')) {
    return res.status(404).json(fail(msg));
  }
  if (msg.toLowerCase().includes('already exists')) {
    return res.status(409).json(fail(msg));
  }
  return errorHandler(res, err, context);
}

// POST /api/baselines — Create a baseline from a completed crawl test
router.post('/', async (req, res) => {
  const { testId, thresholds } = req.body;

  if (!testId) {
    return res.status(400).json(fail('testId is required'));
  }

  try {
    const baseline = manager.createBaseline(testId, thresholds || {});
    return res.status(201).json(ok(baseline));
  } catch (err) {
    return mapError(res, err, 'POST /api/baselines');
  }
});

// GET /api/baselines — List all baselines (optional ?site= filter)
router.get('/', (req, res) => {
  const { site } = req.query;
  const baselines = manager.listBaselines(site || null);
  return res.json(ok({ baselines }));
});

// GET /api/baselines/:id — Get full baseline with snapshot data
router.get('/:id', (req, res) => {
  try {
    safeId(req.params.id);
  } catch (err) {
    return res.status(400).json(fail(err.message));
  }

  const baseline = manager.getBaseline(req.params.id);
  if (!baseline) {
    return res.status(404).json(fail('Baseline not found'));
  }
  return res.json(ok(baseline));
});

// PUT /api/baselines/:id — Update baseline from a new crawl test
router.put('/:id', async (req, res) => {
  try {
    safeId(req.params.id);
  } catch (err) {
    return res.status(400).json(fail(err.message));
  }

  const { testId } = req.body;
  if (!testId) {
    return res.status(400).json(fail('testId is required'));
  }

  try {
    const updated = manager.updateBaseline(req.params.id, testId);
    return res.json(ok(updated));
  } catch (err) {
    return mapError(res, err, 'PUT /api/baselines/:id');
  }
});

// DELETE /api/baselines/:id — Delete a baseline
router.delete('/:id', (req, res) => {
  try {
    safeId(req.params.id);
  } catch (err) {
    return res.status(400).json(fail(err.message));
  }

  const deleted = manager.deleteBaseline(req.params.id);
  if (!deleted) {
    return res.status(404).json(fail('Baseline not found'));
  }
  return res.json(ok({ deleted: true }));
});
