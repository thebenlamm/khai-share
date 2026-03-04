const { v4: uuidv4 } = require('uuid');

class CommunicationMonitor {
  constructor(config) {
    this.config = config;
    this.messages = [];
    this.pollingIntervals = {};
    this.lastChecked = new Date(Date.now() - 24 * 60 * 60 * 1000); // Start from 24h ago
  }

  // Setup unified platform monitoring
  async setupPlatformMonitor(platformConfig) {
    if (!platformConfig) return;

    console.log(`[Khai] Setting up platform communication monitor`);
    this.platformConfig = platformConfig;

    if (platformConfig.apiEndpoint) {
      // Initial check
      await this.checkPlatformCommunications();

      // Set up polling
      this.pollingIntervals.platform = setInterval(async () => {
        await this.checkPlatformCommunications();
      }, platformConfig.pollInterval || 30000);
    }
  }

  async checkPlatformCommunications() {
    if (!this.platformConfig?.apiEndpoint) return [];

    try {
      const url = `${this.platformConfig.apiEndpoint}?since=${this.lastChecked.toISOString()}`;
      const response = await fetch(url, {
        headers: {
          'x-khai-api-key': this.platformConfig.apiKey || ''
        }
      });

      if (response.ok) {
        const data = await response.json();

        // Process SMS messages
        if (data.communications?.sms) {
          data.communications.sms.forEach(msg => {
            if (!this.messages.find(m => m.externalId === msg.id)) {
              this.addMessage('sms', {
                externalId: msg.id,
                from: msg.phoneNumber,
                body: msg.content,
                patient: msg.patient?.User ? `${msg.patient.User.firstName} ${msg.patient.User.lastName}` : 'Unknown',
                timestamp: msg.createdAt
              });
            }
          });
        }

        // Process faxes
        if (data.communications?.faxes) {
          data.communications.faxes.forEach(fax => {
            if (!this.messages.find(m => m.externalId === fax.id)) {
              this.addMessage('fax', {
                externalId: fax.id,
                from: fax.fromNumber,
                pages: fax.pageCount,
                status: fax.status,
                category: fax.aiCategory,
                summary: fax.aiSummary,
                documentUrl: fax.documentUrl,
                timestamp: fax.createdAt
              });
            }
          });
        }

        // Process emails
        if (data.communications?.emails) {
          data.communications.emails.forEach(email => {
            if (!this.messages.find(m => m.externalId === email.id)) {
              this.addMessage('email', {
                externalId: email.id,
                from: email.from,
                to: email.to,
                subject: email.subject,
                status: email.status,
                timestamp: email.createdAt
              });
            }
          });
        }

        this.lastChecked = new Date();

        console.log(`[Khai] Communications check: ${data.counts?.sms || 0} SMS, ${data.counts?.faxes || 0} faxes, ${data.counts?.emails || 0} emails`);

        return data;
      }
    } catch (error) {
      console.error('[Khai] Platform communication check error:', error.message);
    }
    return [];
  }

  // Legacy email monitoring (fallback)
  async setupEmailMonitor(emailConfig) {
    if (!emailConfig) return;

    console.log(`[Khai] Setting up email monitor for ${emailConfig.address}`);
    this.emailConfig = emailConfig;

    if (emailConfig.apiEndpoint && !this.platformConfig) {
      this.pollingIntervals.email = setInterval(async () => {
        await this.checkEmails();
      }, emailConfig.pollInterval || 30000);
    }
  }

  async checkEmails() {
    if (!this.emailConfig?.apiEndpoint) return [];

    try {
      const response = await fetch(this.emailConfig.apiEndpoint, {
        headers: {
          'x-khai-api-key': this.emailConfig.apiKey || '',
          'Authorization': `Bearer ${this.emailConfig.apiKey}`
        }
      });

      if (response.ok) {
        const data = await response.json();
        const emails = data.communications?.emails || data.emails || data;

        if (Array.isArray(emails)) {
          emails.forEach(email => {
            this.addMessage('email', {
              from: email.from,
              subject: email.subject,
              body: email.body,
              timestamp: email.timestamp || email.createdAt
            });
          });
        }
        return emails;
      }
    } catch (error) {
      console.error('[Khai] Email check error:', error.message);
    }
    return [];
  }

  // Legacy SMS monitoring (fallback)
  async setupSMSMonitor(smsConfig) {
    if (!smsConfig) return;

    console.log(`[Khai] Setting up SMS monitor for ${smsConfig.phoneNumber}`);
    this.smsConfig = smsConfig;

    if (smsConfig.apiEndpoint && !this.platformConfig) {
      this.pollingIntervals.sms = setInterval(async () => {
        await this.checkSMS();
      }, smsConfig.pollInterval || 30000);
    }
  }

  async checkSMS() {
    if (!this.smsConfig?.apiEndpoint) return [];

    try {
      const response = await fetch(this.smsConfig.apiEndpoint, {
        headers: {
          'x-khai-api-key': this.smsConfig.apiKey || '',
          'Authorization': `Bearer ${this.smsConfig.apiKey}`
        }
      });

      if (response.ok) {
        const data = await response.json();
        const messages = data.communications?.sms || data.messages || data;

        if (Array.isArray(messages)) {
          messages.forEach(msg => {
            this.addMessage('sms', {
              from: msg.from || msg.phoneNumber,
              body: msg.body || msg.content,
              timestamp: msg.timestamp || msg.createdAt
            });
          });
        }
        return messages;
      }
    } catch (error) {
      console.error('[Khai] SMS check error:', error.message);
    }
    return [];
  }

  // Legacy fax monitoring (fallback)
  async setupFaxMonitor(faxConfig) {
    if (!faxConfig) return;

    console.log(`[Khai] Setting up fax monitor for ${faxConfig.faxNumber}`);
    this.faxConfig = faxConfig;

    if (faxConfig.apiEndpoint && !this.platformConfig) {
      this.pollingIntervals.fax = setInterval(async () => {
        await this.checkFaxes();
      }, faxConfig.pollInterval || 60000);
    }
  }

  async checkFaxes() {
    if (!this.faxConfig?.apiEndpoint) return [];

    try {
      const response = await fetch(this.faxConfig.apiEndpoint, {
        headers: {
          'x-khai-api-key': this.faxConfig.apiKey || '',
          'Authorization': `Bearer ${this.faxConfig.apiKey}`
        }
      });

      if (response.ok) {
        const data = await response.json();
        const faxes = data.communications?.faxes || data.faxes || data;

        if (Array.isArray(faxes)) {
          faxes.forEach(fax => {
            this.addMessage('fax', {
              from: fax.from || fax.fromNumber,
              pages: fax.pages || fax.pageCount,
              documentUrl: fax.documentUrl,
              timestamp: fax.timestamp || fax.createdAt
            });
          });
        }
        return faxes;
      }
    } catch (error) {
      console.error('[Khai] Fax check error:', error.message);
    }
    return [];
  }

  addMessage(type, data) {
    // Avoid duplicates
    if (data.externalId && this.messages.find(m => m.externalId === data.externalId)) {
      return null;
    }

    const message = {
      id: uuidv4(),
      type,
      ...data,
      receivedAt: new Date().toISOString(),
      read: false,
      processed: false
    };
    this.messages.push(message);
    console.log(`[Khai] New ${type} received:`, message.id, data.from || data.subject || '');
    return message;
  }

  getUnreadMessages(type = null) {
    let msgs = this.messages.filter(m => !m.read);
    if (type) {
      msgs = msgs.filter(m => m.type === type);
    }
    return msgs;
  }

  getAllMessages(type = null) {
    if (type) {
      return this.messages.filter(m => m.type === type);
    }
    return this.messages;
  }

  getStats() {
    return {
      total: this.messages.length,
      unread: this.messages.filter(m => !m.read).length,
      byType: {
        sms: this.messages.filter(m => m.type === 'sms').length,
        fax: this.messages.filter(m => m.type === 'fax').length,
        email: this.messages.filter(m => m.type === 'email').length
      },
      lastChecked: this.lastChecked.toISOString()
    };
  }

  markAsRead(messageId) {
    const msg = this.messages.find(m => m.id === messageId);
    if (msg) {
      msg.read = true;
    }
    return msg;
  }

  markAsProcessed(messageId, result = null) {
    const msg = this.messages.find(m => m.id === messageId);
    if (msg) {
      msg.processed = true;
      msg.processedAt = new Date().toISOString();
      msg.processResult = result;
    }
    return msg;
  }

  // Extract verification codes from messages
  extractVerificationCode(message) {
    const patterns = [
      /\b(\d{4,8})\b/,
      /code[:\s]*(\d{4,8})/i,
      /verification[:\s]*(\d{4,8})/i,
      /OTP[:\s]*(\d{4,8})/i,
      /pin[:\s]*(\d{4,8})/i
    ];

    const text = message.body || message.subject || message.content || '';

    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match) {
        return match[1];
      }
    }
    return null;
  }

  // Wait for a verification code with timeout
  async waitForVerificationCode(type, timeout = 120000) {
    const startTime = Date.now();

    while (Date.now() - startTime < timeout) {
      const unread = this.getUnreadMessages(type);

      for (const msg of unread) {
        const code = this.extractVerificationCode(msg);
        if (code) {
          this.markAsRead(msg.id);
          this.markAsProcessed(msg.id, { extractedCode: code });
          return { code, message: msg };
        }
      }

      await new Promise(resolve => setTimeout(resolve, 5000));
    }

    return null;
  }

  stop() {
    Object.values(this.pollingIntervals).forEach(interval => {
      clearInterval(interval);
    });
    this.pollingIntervals = {};
  }
}

module.exports = CommunicationMonitor;
