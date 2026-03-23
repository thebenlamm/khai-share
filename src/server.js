const { app, watchManager, API_KEY } = require('./app');
const { closeAllBrowsers } = require('./utils/browser');

const PORT = process.env.PORT || 3001;

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
  if (!API_KEY) {
    console.warn('[Khai] WARNING: No KHAI_API_KEY set — all /api/* endpoints are unauthenticated');
  }
  // Start scheduled watches
  watchManager.startAll();
  console.log('[Khai] Watch scheduler started');
});

// Graceful shutdown
async function shutdown(signal) {
  console.log(`\n[Khai] ${signal} received, shutting down...`);
  watchManager.stopAll();
  console.log('[Khai] Closing active browsers...');
  await closeAllBrowsers();
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
