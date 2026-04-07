const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const { KhaiActions } = require('../agent/actions');
const { loadCredentials } = require('../utils/config');
const { ok, fail, errorHandler } = require('../utils/response');
const { v4: uuidv4 } = require('uuid');
const { JobStore, runAsyncJob } = require('../utils/jobStore');
const { safePath, PROJECT_ROOT } = require('../utils/safePath');

// Store active action sessions
const activeJobs = new JobStore();

// Execute a sequence of actions
router.post('/execute', async (req, res) => {
  const { site, account, actions, webhookUrl = null, recordHar = false } = req.body;

  if (!site || !account || !actions) {
    return res.status(400).json(fail('Site, account, and actions are required'));
  }

  if (!Array.isArray(actions)) {
    return res.status(400).json(fail('actions must be an array'));
  }

  const sessionId = `action-${uuidv4()}`;

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

    // Run actions in background
    // Note: job._actionResults is used for per-action accumulation during execution.
    // The status/results endpoints read _actionResults for in-progress and completed sessions.
    runAsyncJob(activeJobs, sessionId, {
      khai, _actionResults: [], startTime: new Date().toISOString(),
      recordHar: !!recordHar, harFile: null
    }, async (job) => {
      let harRecorder = null;

      // Helper: stop HAR recorder and save to disk (partial traces are valuable)
      async function saveHar() {
        if (!harRecorder) return;
        try {
          const har = await harRecorder.stop();
          const harDir = safePath(PROJECT_ROOT, 'reports', 'har');
          fs.mkdirSync(harDir, { recursive: true });
          const harPath = safePath(harDir, sessionId + '.har');
          fs.writeFileSync(harPath, JSON.stringify(har, null, 2));
          job.harFile = harPath;
          console.log(`[Khai] HAR saved to ${harPath}`);
        } catch (harError) {
          console.error('[Khai] Failed to save HAR:', harError.message);
        }
        harRecorder = null;
      }

      try {
        await khai.init();
        job.status = 'logging-in';

        // Start HAR recording after browser is initialized
        if (job.recordHar) {
          const { HarRecorder } = require('../utils/har-recorder');
          harRecorder = new HarRecorder(khai.page);
          await harRecorder.start();
          console.log('[Khai] HAR recording started');
        }

        let loginSuccess = true;
        if (accountConfig.skipLogin) {
          console.log('[Khai] Skipping login (skipLogin=true)');
        } else {
          loginSuccess = await khai.login(accountConfig);
          if (!loginSuccess) {
            // Flag for login-failed status override in runAsyncJob catch block
            job.loginError = 'Login failed';
            await saveHar();
            try { await khai.close(); } catch (_) {}
            // Throw so runAsyncJob sets endTime + webhook; loginError flag overrides status to 'login-failed'
            throw new Error('Login failed');
          }
        }

        job.status = 'executing';

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

          job._actionResults.push({
            action: action.type,
            ...result,
            timestamp: new Date().toISOString()
          });
        }

        // Persist results to disk
        try {
          const reportsDir = safePath(PROJECT_ROOT, 'reports', 'actions');
          fs.mkdirSync(reportsDir, { recursive: true });
          fs.writeFileSync(
            safePath(reportsDir, `${sessionId}.json`),
            JSON.stringify({ sessionId, results: job._actionResults, completedAt: new Date().toISOString() }, null, 2)
          );
        } catch (persistErr) {
          console.error(`[Khai] Failed to persist action results: ${persistErr.message}`);
        }

        await saveHar();
        try { await khai.close(); } catch (_) {}

        // Return full payload for webhook; status/results endpoints read _actionResults directly
        return { sessionId, status: 'completed', results: job._actionResults, startTime: job.startTime, harFile: job.harFile || null };
      } catch (err) {
        await saveHar();
        try { await khai.close(); } catch (_) {}
        throw err; // runAsyncJob handles error status + endTime + webhook; loginError flag overrides to 'login-failed'
      }
    }, { operationType: 'action', operationId: sessionId, webhookUrl });

    const startResponse = { sessionId, message: 'Action execution started', site, account, actionCount: actions.length };
    if (webhookUrl) startResponse.webhookUrl = webhookUrl;
    if (recordHar) startResponse.recordHar = true;
    res.json(ok(startResponse));

  } catch (error) {
    errorHandler(res, error, 'actions/execute');
  }
});

// Get action session status
router.get('/status/:sessionId', (req, res) => {
  const { sessionId } = req.params;
  const session = activeJobs.get(sessionId);

  if (!session) {
    return res.status(404).json(fail('Session not found'));
  }

  const actionResults = session._actionResults || [];
  res.json(ok({
    sessionId,
    status: session.status,
    actionsCompleted: actionResults.length,
    error: session.error || null,
    startTime: session.startTime,
    webhook: session.webhook || null,
    harFile: session.harFile || null
  }));
});

// Get full action session results
router.get('/results/:sessionId', (req, res) => {
  const { sessionId } = req.params;
  const session = activeJobs.get(sessionId);

  if (!session) {
    return res.status(404).json(fail('Session not found'));
  }

  res.json(ok({
    sessionId,
    status: session.status,
    results: session._actionResults || [],
    startTime: session.startTime,
    error: session.error || null,
    webhook: session.webhook || null,
    harFile: session.harFile || null
  }));
});

// Download HAR file for a completed session
router.get('/har/:sessionId', (req, res) => {
  const { sessionId } = req.params;
  const session = activeJobs.get(sessionId);

  if (!session) {
    return res.status(404).json(fail('Session not found'));
  }

  if (!session.harFile) {
    return res.status(404).json(fail('No HAR file for this session. Was recordHar enabled?'));
  }

  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Content-Disposition', `attachment; filename="${sessionId}.har"`);
  const harStream = fs.createReadStream(session.harFile);
  harStream.on('error', (err) => {
    console.error('[Khai] HAR stream error:', err.message);
    if (!res.headersSent) {
      res.status(500).json(fail('Failed to read HAR file'));
    }
  });
  harStream.pipe(res);
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
