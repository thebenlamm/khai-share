const express = require('express');
const router = express.Router();
const KhaiActions = require('../agent/actions');
const { loadCredentials } = require('../utils/config');
const { ok, fail, errorHandler } = require('../utils/response');
const { deliverWebhook } = require('../utils/webhook');

// Store active action sessions
const activeSessions = new Map();
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

// Execute a sequence of actions
router.post('/execute', async (req, res) => {
  const { site, account, actions, webhookUrl = null } = req.body;

  if (!site || !account || !actions) {
    return res.status(400).json(fail('Site, account, and actions are required'));
  }

  const sessionId = `action-${Date.now()}`;

  try {
    const credentials = loadCredentials();
    const siteConfig = credentials.sites[site];

    if (!siteConfig) {
      return res.status(404).json(fail(`Site ${site} not found`));
    }

    const accountConfig = siteConfig.accounts[account];
    if (!accountConfig) {
      return res.status(404).json(fail(`Account ${account} not found`));
    }

    const khai = new KhaiActions({
      baseUrl: siteConfig.baseUrl,
      accountType: account
    });

    evictStale(activeSessions);
    activeSessions.set(sessionId, {
      khai,
      status: 'initializing',
      results: [],
      startTime: new Date().toISOString(),
      webhookUrl: webhookUrl || null,
      webhook: null,
      _createdAt: Date.now()
    });

    // Run actions in background
    (async () => {
      const session = activeSessions.get(sessionId);

      try {
        await khai.init();
        session.status = 'logging-in';

        let loginSuccess = true;
        if (accountConfig.skipLogin) {
          console.log('[Khai] Skipping login (skipLogin=true)');
        } else {
          loginSuccess = await khai.login(accountConfig);
          if (!loginSuccess) {
            session.status = 'login-failed';
            session.error = 'Login failed';
            try { await khai.close(); } catch (_) {}
            if (session.webhookUrl) {
              session.webhook = await deliverWebhook(session.webhookUrl, {
                sessionId, status: session.status, results: session.results,
                startTime: session.startTime, error: session.error
              }, { operationType: 'action', operationId: sessionId });
            }
            return;
          }
        }

        session.status = 'executing';

        for (const action of actions) {
          console.log(`[Khai] Executing action: ${action.type}`);
          let result;

          try {
            switch (action.type) {
              case 'create-note':
                result = await khai.createPatientNote(action.patientId, action.content || {});
                break;

              case 'send-fax':
                result = await khai.sendFax(action.faxNumber, action.content);
                break;

              case 'send-sms':
                result = await khai.sendSMS(action.phoneNumber, action.message);
                break;

              case 'navigate':
                const navTarget = action.url || action.path;
                await khai.navigateTo(navTarget);
                result = { success: true, message: `Navigated to ${navTarget}` };
                break;

              case 'wait':
                const waitMs = action.duration || action.ms || 3000;
                await new Promise(resolve => setTimeout(resolve, waitMs));
                result = { success: true, message: `Waited ${waitMs}ms` };
                break;

              case 'screenshot':
                const screenshotPath = await khai.screenshot(action.name || 'action');
                result = { success: true, path: screenshotPath };
                break;

              case 'evaluate':
                // WARNING: Executes arbitrary JS in the browser context.
                // The browser is authenticated to target sites — this can access
                // session cookies, tokens, and perform actions as the logged-in user.
                // Only use with trusted scripts.
                result = await khai.evaluate(action.script, action.waitAfter || 3000);
                break;

              case 'twilio-a2p':
                result = await khai.registerTwilioA2P(action.brandInfo || {});
                break;

              default:
                result = { success: false, message: `Unknown action type: ${action.type}` };
            }
          } catch (actionError) {
            console.error(`[Khai] Action '${action.type}' failed:`, actionError.message);
            result = { success: false, error: actionError.message };
          }

          session.results.push({
            action: action.type,
            ...result,
            timestamp: new Date().toISOString()
          });
        }

        session.status = 'completed';
        try { await khai.close(); } catch (_) {}
        if (session.webhookUrl) {
          session.webhook = await deliverWebhook(session.webhookUrl, {
            sessionId, status: session.status, results: session.results,
            startTime: session.startTime, error: null
          }, { operationType: 'action', operationId: sessionId });
        }

      } catch (error) {
        console.error('[Khai] Action error:', error);
        session.status = 'error';
        session.error = error.message || 'Action execution failed';
        try { await khai.close(); } catch (_) {}
        if (session.webhookUrl) {
          session.webhook = await deliverWebhook(session.webhookUrl, {
            sessionId, status: session.status, results: session.results,
            startTime: session.startTime, error: session.error
          }, { operationType: 'action', operationId: sessionId });
        }
      }
    })();

    const startResponse = { sessionId, message: 'Action execution started', site, account, actionCount: actions.length };
    if (webhookUrl) startResponse.webhookUrl = webhookUrl;
    res.json(ok(startResponse));

  } catch (error) {
    errorHandler(res, error, 'actions/execute');
  }
});

// Get action session status
router.get('/status/:sessionId', (req, res) => {
  const { sessionId } = req.params;
  const session = activeSessions.get(sessionId);

  if (!session) {
    return res.status(404).json(fail('Session not found'));
  }

  res.json(ok({
    sessionId,
    status: session.status,
    actionsCompleted: session.results.length,
    error: session.error || null,
    startTime: session.startTime,
    webhook: session.webhook || null
  }));
});

// Get full action session results
router.get('/results/:sessionId', (req, res) => {
  const { sessionId } = req.params;
  const session = activeSessions.get(sessionId);

  if (!session) {
    return res.status(404).json(fail('Session not found'));
  }

  res.json(ok({
    sessionId,
    status: session.status,
    results: session.results,
    startTime: session.startTime,
    error: session.error || null,
    webhook: session.webhook || null
  }));
});

// Quick action endpoints that delegate to /execute
function quickAction(actionType, extractParams) {
  return async (req, res) => {
    const { site, account } = req.body;
    const params = extractParams(req.body);

    req.body = {
      site,
      account,
      actions: [{ type: actionType, ...params }]
    };

    // Delegate to execute handler
    const executeRoute = router.stack.find(r => r.route?.path === '/execute');
    if (executeRoute) {
      return executeRoute.route.stack[0].handle(req, res);
    }
    res.status(500).json(fail('Execute handler not found'));
  };
}

router.post('/create-note', quickAction('create-note', ({ patientId, content }) => ({ patientId, content })));
router.post('/send-fax', quickAction('send-fax', ({ faxNumber, content }) => ({ faxNumber, content })));
router.post('/send-sms', quickAction('send-sms', ({ phoneNumber, message }) => ({ phoneNumber, message })));

module.exports = router;
