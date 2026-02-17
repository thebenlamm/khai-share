const express = require('express');
const router = express.Router();
const CommunicationMonitor = require('../agent/communicationMonitor');
const { loadCredentials } = require('../utils/config');
const { ok, fail, errorHandler } = require('../utils/response');

let commMonitor = null;

// Initialize communication monitor
router.post('/init', async (req, res) => {
  try {
    const config = loadCredentials();
    if (!config?.communications) {
      return res.status(400).json(fail('No communications config found'));
    }

    if (commMonitor) {
      commMonitor.stop();
    }

    commMonitor = new CommunicationMonitor(config.communications);

    if (config.communications.platform) {
      await commMonitor.setupPlatformMonitor(config.communications.platform);
    } else {
      if (config.communications.email) {
        await commMonitor.setupEmailMonitor(config.communications.email);
      }
      if (config.communications.sms) {
        await commMonitor.setupSMSMonitor(config.communications.sms);
      }
      if (config.communications.fax) {
        await commMonitor.setupFaxMonitor(config.communications.fax);
      }
    }

    res.json(ok({
      message: 'Khai communication monitor initialized',
      monitoring: {
        platform: !!config.communications.platform,
        email: !!config.communications.email,
        sms: !!config.communications.sms,
        fax: !!config.communications.fax
      }
    }));
  } catch (error) {
    errorHandler(res, error, 'comms/init');
  }
});

// Stop communication monitor
router.post('/stop', (req, res) => {
  if (commMonitor) {
    commMonitor.stop();
    commMonitor = null;
  }
  res.json(ok({ message: 'Communication monitor stopped' }));
});

// Get all messages
router.get('/messages', (req, res) => {
  if (!commMonitor) {
    return res.json(ok({ messages: [], warning: 'Monitor not initialized' }));
  }

  const { type, unread } = req.query;

  let messages;
  if (unread === 'true') {
    messages = commMonitor.getUnreadMessages(type || null);
  } else {
    messages = commMonitor.getAllMessages(type || null);
  }

  res.json(ok({ messages }));
});

// Get unread count
router.get('/unread', (req, res) => {
  if (!commMonitor) {
    return res.json(ok({ count: 0, byType: {} }));
  }

  const emails = commMonitor.getUnreadMessages('email');
  const sms = commMonitor.getUnreadMessages('sms');
  const faxes = commMonitor.getUnreadMessages('fax');

  res.json(ok({
    count: emails.length + sms.length + faxes.length,
    byType: {
      email: emails.length,
      sms: sms.length,
      fax: faxes.length
    }
  }));
});

// Mark message as read
router.post('/messages/:messageId/read', (req, res) => {
  if (!commMonitor) {
    return res.status(400).json(fail('Monitor not initialized'));
  }

  const { messageId } = req.params;
  const message = commMonitor.markAsRead(messageId);

  if (!message) {
    return res.status(404).json(fail('Message not found'));
  }

  res.json(ok({ message }));
});

// Wait for verification code
router.post('/wait-for-code', async (req, res) => {
  if (!commMonitor) {
    return res.status(400).json(fail('Monitor not initialized'));
  }

  const { type = 'sms', timeout = 120000 } = req.body;

  const result = await commMonitor.waitForVerificationCode(type, timeout);

  if (!result) {
    return res.status(408).json(fail('Timeout waiting for verification code'));
  }

  res.json(ok({
    code: result.code,
    message: result.message
  }));
});

// Manually add a message (for webhook integration)
router.post('/webhook/:type', (req, res) => {
  if (!commMonitor) {
    commMonitor = new CommunicationMonitor({});
  }

  const { type } = req.params;
  const message = commMonitor.addMessage(type, req.body);

  res.json(ok({ message }));
});

// Check for new messages now
router.post('/check', async (req, res) => {
  if (!commMonitor) {
    return res.status(400).json(fail('Monitor not initialized'));
  }

  if (commMonitor.platformConfig) {
    const result = await commMonitor.checkPlatformCommunications();
    return res.json(ok({
      message: 'Platform check completed',
      stats: commMonitor.getStats(),
      data: result
    }));
  }

  const results = {
    emails: await commMonitor.checkEmails(),
    sms: await commMonitor.checkSMS(),
    faxes: await commMonitor.checkFaxes()
  };

  res.json(ok({
    message: 'Check completed',
    newMessages: {
      email: results.emails.length,
      sms: results.sms.length,
      fax: results.faxes.length
    }
  }));
});

// Get monitor status and stats
router.get('/status', (req, res) => {
  if (!commMonitor) {
    return res.json(ok({
      initialized: false,
      message: 'Monitor not initialized. POST /api/comms/init to start.'
    }));
  }

  res.json(ok({
    initialized: true,
    stats: commMonitor.getStats(),
    monitoring: {
      platform: !!commMonitor.platformConfig,
      email: !!commMonitor.emailConfig,
      sms: !!commMonitor.smsConfig,
      fax: !!commMonitor.faxConfig
    }
  }));
});

module.exports = router;
