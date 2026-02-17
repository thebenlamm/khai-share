const express = require('express');
const cors = require('cors');
const path = require('path');
const { credentialsExist } = require('./utils/config');
const apiRoutes = require('./routes/api');
const commRoutes = require('./routes/communications');
const actionsRoutes = require('./routes/actions');
const auditRoutes = require('./routes/audit');
const advancedRoutes = require('./routes/advanced');

const app = express();
const PORT = process.env.PORT || 3001;

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
    const provided = req.headers['x-khai-key'];
    if (provided !== API_KEY) {
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

// Serve frontend
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const server = app.listen(PORT, '127.0.0.1', () => {
  console.log(`
  ╔═══════════════════════════════════════════════════════╗
  ║                                                       ║
  ║   חי  Khai - AI Website Testing Agent                 ║
  ║       (18 = Life)                                     ║
  ║                                                       ║
  ║   Server running at: http://localhost:${PORT}            ║
  ║   API key auth: ${API_KEY ? 'ENABLED' : 'disabled'}                              ║
  ║                                                       ║
  ╚═══════════════════════════════════════════════════════╝
  `);
});

// Graceful shutdown
function shutdown(signal) {
  console.log(`\n[Khai] ${signal} received, shutting down...`);
  server.close(() => {
    console.log('[Khai] Server closed');
    process.exit(0);
  });
  // Force exit after 5 seconds
  setTimeout(() => {
    console.error('[Khai] Forced shutdown after timeout');
    process.exit(1);
  }, 5000);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
