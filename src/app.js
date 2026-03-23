const express = require('express');
const crypto = require('crypto');
const cors = require('cors');
const path = require('path');
const { credentialsExist } = require('./utils/config');
const apiRoutes = require('./routes/api');
const commRoutes = require('./routes/communications');
const actionsRoutes = require('./routes/actions');
const auditRoutes = require('./routes/audit');
const advancedRoutes = require('./routes/advanced');
const homebayRoutes = require('./routes/homebay');
const suiteRoutes = require('./routes/suites');
const watchRoutes = require('./routes/watches');
const { manager: watchManager } = require('./routes/watches');
const baselineRoutes = require('./routes/baselines');
const { validateHomeBayCredentials } = require('./homebay/config');

const app = express();

// Security
app.disable('x-powered-by');

// CORS restricted to local UI only
app.use(cors({ origin: 'http://127.0.0.1:3001' }));
app.use(express.json({ limit: '100kb' }));

// Optional API key authentication
const API_KEY = process.env.KHAI_API_KEY;
if (API_KEY) {
  app.use((req, res, next) => {
    // Skip auth for health check and static files
    if (req.path === '/health' || !req.path.startsWith('/api')) {
      return next();
    }
    const provided = req.headers['x-khai-key'] || '';
    const keyBuf = Buffer.from(API_KEY);
    const providedBuf = Buffer.from(provided);
    if (keyBuf.length !== providedBuf.length || !crypto.timingSafeEqual(keyBuf, providedBuf)) {
      return res.status(401).json({ success: false, error: 'Invalid or missing API key' });
    }
    next();
  });
}

// Static files
app.use(express.static(path.join(__dirname, 'public')));

// Health endpoint
app.get('/health', (req, res) => {
  res.json({
    success: true,
    data: {
      status: 'ok',
      uptime: process.uptime(),
      version: require('../package.json').version,
      credentialsConfigured: credentialsExist()
    }
  });
});

// API routes
app.use('/api', apiRoutes);
app.use('/api/comms', commRoutes);
app.use('/api/actions', actionsRoutes);
app.use('/api/audit', auditRoutes);
app.use('/api/advanced', advancedRoutes);
app.use('/api/homebay', homebayRoutes);
app.use('/api/suites', suiteRoutes);
app.use('/api/watches', watchRoutes);
app.use('/api/baselines', baselineRoutes);

// Serve frontend
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Validate HomeBay credentials on startup (fail fast on stale config)
try {
  validateHomeBayCredentials();
  console.log('[Khai] HomeBay credentials validated on startup');
} catch (err) {
  console.error('[Khai] HomeBay credential validation failed:', err.message);
  console.error('[Khai] HomeBay features will be unavailable — fix credentials.json');
}

console.log('[Khai] Suite routes registered at /api/suites');

module.exports = { app, watchManager, API_KEY };
