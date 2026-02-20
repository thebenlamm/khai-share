/**
 * Khai Action Automation
 *
 * Performs real actions on websites like creating notes, sending faxes, SMS, etc.
 */

const { createBrowser } = require('../utils/browser');
const path = require('path');
const fs = require('fs');

class KhaiActions {
  constructor(config) {
    this.config = config;
    this.browser = null;
    this.page = null;
    this.screenshotDir = path.join(__dirname, '../../screenshots/actions');
  }

  async init() {
    fs.mkdirSync(this.screenshotDir, { recursive: true });

    const { browser, page } = await createBrowser();
    this.browser = browser;
    this.page = page;
  }

  async login(accountConfig) {
    const loginUrl = this.config.baseUrl + accountConfig.loginUrl;
    console.log(`[Khai Action] Logging in at ${loginUrl}`);

    await this.page.goto(loginUrl, { waitUntil: 'networkidle2', timeout: 30000 });
    await new Promise(resolve => setTimeout(resolve, 3000));

    // Check if this is Twilio's two-step login
    const isTwilioLogin = this.page.url().includes('twilio.com');

    if (isTwilioLogin) {
      console.log('[Khai Action] Detected Twilio two-step login');
      return await this.loginTwilio(accountConfig);
    }

    // Handle loginTrigger if present (e.g., "Admin Portal Login" button)
    if (accountConfig.loginTrigger) {
      console.log(`[Khai Action] Looking for login trigger: ${accountConfig.loginTrigger}`);
      try {
        // Try to find and click the trigger button
        const triggerClicked = await this.page.evaluate((triggerText) => {
          // Extract text from selector like "button:has-text('Admin')"
          const textMatch = triggerText.match(/has-text\(['"](.+?)['"]\)/);
          if (textMatch) {
            const searchText = textMatch[1].toLowerCase();
            const buttons = Array.from(document.querySelectorAll('button, a'));
            const trigger = buttons.find(b => b.textContent.toLowerCase().includes(searchText));
            if (trigger) {
              trigger.click();
              return true;
            }
          }
          return false;
        }, accountConfig.loginTrigger);

        if (triggerClicked) {
          console.log('[Khai Action] Clicked login trigger');
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
      } catch (e) {
        console.log('[Khai Action] Login trigger error:', e.message);
      }
    }

    // Find and fill email
    const emailSelectors = accountConfig.usernameField.split(',').map(s => s.trim());
    for (const selector of emailSelectors) {
      try {
        await this.page.waitForSelector(selector, { timeout: 3000 });
        await this.page.type(selector, accountConfig.username, { delay: 50 });
        break;
      } catch (e) { continue; }
    }

    // Find and fill password
    const passwordSelectors = accountConfig.passwordField.split(',').map(s => s.trim());
    for (const selector of passwordSelectors) {
      try {
        await this.page.waitForSelector(selector, { timeout: 3000 });
        await this.page.type(selector, accountConfig.password, { delay: 50 });
        break;
      } catch (e) { continue; }
    }

    // Click submit
    const submitSelectors = accountConfig.submitButton.split(',').map(s => s.trim());
    for (const selector of submitSelectors) {
      try {
        const btn = await this.page.$(selector);
        if (btn) {
          await Promise.all([
            btn.click(),
            this.page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 }).catch(() => {})
          ]);
          break;
        }
      } catch (e) { continue; }
    }

    await new Promise(resolve => setTimeout(resolve, 3000));

    // Check if login actually succeeded by verifying we're not still on the login page
    const finalUrl = this.page.url();
    const loginPath = accountConfig.loginUrl || '/login';
    const stillOnLogin = finalUrl.endsWith(loginPath) || finalUrl.includes('/login');

    await this.screenshot('login-complete');
    console.log(`[Khai Action] Login complete, URL: ${finalUrl}, success: ${!stillOnLogin}`);

    if (stillOnLogin) {
      console.log('[Khai Action] WARNING: Still on login page after submit — login may have failed');
      // Still return true to allow actions to proceed (they may handle their own auth redirects)
      // but log the warning so it's visible in server output
    }

    return true;
  }

  async screenshot(name) {
    const filepath = path.join(this.screenshotDir, `${name}-${Date.now()}.png`);
    await this.page.screenshot({ path: filepath, fullPage: false });
    console.log(`[Khai Action] Screenshot: ${filepath}`);
    return filepath;
  }

  /**
   * Twilio two-step login handler
   */
  async loginTwilio(accountConfig) {
    console.log('[Khai Action] Starting Twilio login flow');

    await this.screenshot('twilio-before-login');

    // Step 1: Enter email - Twilio uses placeholder "Email address"
    try {
      // Wait for any input field
      await this.page.waitForSelector('input', { timeout: 15000 });
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Find the email input by various selectors
      const emailInput = await this.page.evaluateHandle(() => {
        // Try multiple ways to find the email field
        let input = document.querySelector('input[placeholder*="Email"]');
        if (!input) input = document.querySelector('input[type="email"]');
        if (!input) input = document.querySelector('input[name="email"]');
        if (!input) input = document.querySelector('input[autocomplete="email"]');
        if (!input) {
          // Fallback: find first visible input
          const inputs = document.querySelectorAll('input:not([type="hidden"])');
          input = inputs[0];
        }
        return input;
      });

      if (emailInput) {
        await emailInput.click();
        await emailInput.type(accountConfig.username, { delay: 50 });
        console.log(`[Khai Action] Entered email: ${accountConfig.username}`);
      } else {
        console.log('[Khai Action] Could not find email input');
        return false;
      }
    } catch (e) {
      console.log('[Khai Action] Email input error:', e.message);
      await this.screenshot('twilio-email-error');
      return false;
    }

    await this.screenshot('twilio-email-entered');

    // Click Continue
    try {
      const continueClicked = await this.page.evaluate(() => {
        const buttons = Array.from(document.querySelectorAll('button'));
        const continueBtn = buttons.find(b =>
          b.textContent.toLowerCase().includes('continue') ||
          b.textContent.toLowerCase().includes('next')
        );
        if (continueBtn) {
          continueBtn.click();
          return true;
        }
        return false;
      });

      if (continueClicked) {
        console.log('[Khai Action] Clicked Continue');
        await new Promise(resolve => setTimeout(resolve, 3000));
      }
    } catch (e) {
      console.log('[Khai Action] Continue button error:', e.message);
    }

    await this.screenshot('twilio-after-email');

    // Step 2: Enter password
    try {
      await this.page.waitForSelector('input[type="password"]', { timeout: 10000 });
      const passwordInput = await this.page.$('input[type="password"]');
      if (passwordInput) {
        await passwordInput.click();
        await passwordInput.type(accountConfig.password, { delay: 50 });
        console.log('[Khai Action] Entered password');
      }
    } catch (e) {
      console.log('[Khai Action] Password input error:', e.message);
      return false;
    }

    await this.screenshot('twilio-password-entered');

    // Click Login/Sign In
    try {
      const loginClicked = await this.page.evaluate(() => {
        const buttons = Array.from(document.querySelectorAll('button'));
        const loginBtn = buttons.find(b =>
          b.textContent.toLowerCase().includes('log in') ||
          b.textContent.toLowerCase().includes('login') ||
          b.textContent.toLowerCase().includes('sign in') ||
          b.textContent.toLowerCase().includes('continue')
        );
        if (loginBtn) {
          loginBtn.click();
          return true;
        }
        return false;
      });

      if (loginClicked) {
        console.log('[Khai Action] Clicked Login');
        await new Promise(resolve => setTimeout(resolve, 5000));
      }
    } catch (e) {
      console.log('[Khai Action] Login button error:', e.message);
    }

    await this.screenshot('twilio-login-complete');
    console.log(`[Khai Action] Twilio login complete, URL: ${this.page.url()}`);

    // Check if we're logged in (URL should be console, not login)
    const finalUrl = this.page.url();
    if (finalUrl.includes('console.twilio.com') && !finalUrl.includes('login')) {
      return true;
    }

    return true; // Continue even if URL check fails
  }

  async navigateTo(target) {
    // Support both full URLs and relative paths
    const url = (target && (target.startsWith('http://') || target.startsWith('https://')))
      ? target
      : this.config.baseUrl + target;
    console.log(`[Khai Action] Navigating to ${url}`);
    try {
      // Use 'load' instead of 'networkidle2' — WordPress sites have persistent
      // background requests (heartbeat API, analytics) that prevent networkidle2
      // from ever resolving, causing guaranteed 30s timeouts.
      await this.page.goto(url, { waitUntil: 'load', timeout: 30000 });
    } catch (error) {
      // If 'load' times out, the page may still be usable (slow assets).
      // Log it but don't abort — the caller can still screenshot/interact.
      if (error.name === 'TimeoutError') {
        console.warn(`[Khai Action] Navigation to ${url} timed out, continuing anyway`);
      } else {
        throw error;
      }
    }
    await new Promise(resolve => setTimeout(resolve, 2000));
    console.log(`[Khai Action] Navigation complete, URL: ${this.page.url()}`);
    return true;
  }

  async createPatientNote(patientId, noteContent) {
    console.log(`[Khai Action] Creating note for patient ${patientId}`);

    // Navigate to notes/new
    await this.navigateTo('/admin/notes/new');
    await new Promise(resolve => setTimeout(resolve, 3000));
    await this.screenshot('notes-new-page');

    // Select patient from dropdown - click the patient combobox
    try {
      // Find patient selector by looking for "Select patient" text or combobox
      const patientSelectors = [
        'button:has-text("Select patient")',
        '[data-testid="patient-select"]',
        'button[role="combobox"]'
      ];

      for (const selector of patientSelectors) {
        try {
          const patientSelect = await this.page.$(selector);
          if (patientSelect) {
            await patientSelect.click();
            await new Promise(resolve => setTimeout(resolve, 1500));

            // Type to search for a test patient
            await this.page.keyboard.type('test', { delay: 100 });
            await new Promise(resolve => setTimeout(resolve, 2000));

            // Click first result in dropdown
            const firstOption = await this.page.$('[role="option"], [data-radix-collection-item]');
            if (firstOption) {
              await firstOption.click();
              await new Promise(resolve => setTimeout(resolve, 1000));
              console.log('[Khai Action] Patient selected');
            }
            break;
          }
        } catch (e) { continue; }
      }
    } catch (e) {
      console.log('[Khai Action] Patient selection error:', e.message);
    }

    await this.screenshot('patient-selected');

    // Fill in chief complaint
    try {
      const chiefComplaint = await this.page.$('input[placeholder*="Follow-up"], input[placeholder*="chief"], #chief-complaint');
      if (chiefComplaint) {
        await chiefComplaint.click();
        await chiefComplaint.type(noteContent.chiefComplaint || 'Follow-up visit', { delay: 30 });
        console.log('[Khai Action] Chief complaint filled');
      }
    } catch (e) {
      console.log('[Khai Action] Chief complaint skipped');
    }

    // Fill in subjective - look for textarea after "S - Subjective" label
    try {
      const subjective = await this.page.$('textarea[placeholder*="history"], textarea[placeholder*="subjective"], #subjective');
      if (subjective) {
        await subjective.click();
        await subjective.type(noteContent.subjective || 'Patient reports feeling well. No new complaints.', { delay: 15 });
        console.log('[Khai Action] Subjective filled');
      }
    } catch (e) {
      console.log('[Khai Action] Subjective skipped');
    }

    // Fill in objective
    try {
      const objective = await this.page.$('textarea[placeholder*="exam"], textarea[placeholder*="objective"], #objective');
      if (objective) {
        await objective.click();
        await objective.type(noteContent.objective || 'Vitals stable. Alert and oriented. General appearance good.', { delay: 15 });
        console.log('[Khai Action] Objective filled');
      }
    } catch (e) {
      console.log('[Khai Action] Objective skipped');
    }

    // Fill in assessment
    try {
      const assessment = await this.page.$('textarea[placeholder*="assessment"], textarea[placeholder*="diagnosis"], #assessment');
      if (assessment) {
        await assessment.click();
        await assessment.type(noteContent.assessment || 'Stable condition. Continue current management.', { delay: 15 });
        console.log('[Khai Action] Assessment filled');
      }
    } catch (e) {
      console.log('[Khai Action] Assessment skipped');
    }

    // Fill in plan
    try {
      const plan = await this.page.$('textarea[placeholder*="plan"], textarea[placeholder*="treatment"], #plan');
      if (plan) {
        await plan.click();
        await plan.type(noteContent.plan || 'Continue current regimen. Follow up as needed.', { delay: 15 });
        console.log('[Khai Action] Plan filled');
      }
    } catch (e) {
      console.log('[Khai Action] Plan skipped');
    }

    await this.screenshot('note-filled');

    // Scroll to top to find Sign & Complete button
    await this.page.evaluate(() => window.scrollTo(0, 0));
    await new Promise(resolve => setTimeout(resolve, 500));

    // Click Sign & Complete button
    try {
      // Look for Sign & Complete button using various methods
      const signBtnFound = await this.page.evaluate(() => {
        const buttons = Array.from(document.querySelectorAll('button'));
        const signBtn = buttons.find(b =>
          b.textContent.includes('Sign') ||
          b.textContent.includes('Complete') ||
          b.textContent.includes('Save')
        );
        if (signBtn) {
          signBtn.click();
          return true;
        }
        return false;
      });

      if (signBtnFound) {
        await new Promise(resolve => setTimeout(resolve, 3000));
        await this.screenshot('note-signed');
        console.log('[Khai Action] Note signed and completed');
        return { success: true, message: 'Note created and signed' };
      }
    } catch (e) {
      console.log('[Khai Action] Sign button error:', e.message);
    }

    return { success: false, message: 'Could not sign note - button not found' };
  }

  async sendFax(faxNumber, content) {
    console.log(`[Khai Action] Sending fax to ${faxNumber}`);

    // Navigate to faxes
    await this.navigateTo('/admin/faxes');
    await new Promise(resolve => setTimeout(resolve, 2000));
    await this.screenshot('faxes-page');

    // Click "Send Fax" button in header
    try {
      await this.page.evaluate(() => {
        const buttons = Array.from(document.querySelectorAll('button'));
        const sendBtn = buttons.find(b => b.textContent.includes('Send Fax'));
        if (sendBtn) sendBtn.click();
      });
      await new Promise(resolve => setTimeout(resolve, 2000));
      await this.screenshot('send-fax-dialog');
    } catch (e) {
      console.log('[Khai Action] Send fax button not found:', e.message);
    }

    // Fill in fax number - clear first then type
    try {
      // Find the fax number input (first input in dialog)
      const faxInput = await this.page.$('input[placeholder*="555-0000"], input[type="tel"]');
      if (faxInput) {
        await faxInput.click();
        await this.page.keyboard.down('Meta');
        await this.page.keyboard.press('a');
        await this.page.keyboard.up('Meta');
        await this.page.keyboard.press('Backspace');
        await faxInput.type(faxNumber, { delay: 50 });
        console.log(`[Khai Action] Fax number entered: ${faxNumber}`);
      }
    } catch (e) {
      console.log('[Khai Action] Fax number input error:', e.message);
    }

    // Fill in recipient name
    try {
      const nameInput = await this.page.$('input[placeholder*="facility"], input[placeholder*="name"]');
      if (nameInput) {
        await nameInput.click();
        await this.page.keyboard.down('Meta');
        await this.page.keyboard.press('a');
        await this.page.keyboard.up('Meta');
        await this.page.keyboard.press('Backspace');
        await nameInput.type('Dr. Ben Soffer', { delay: 30 });
        console.log('[Khai Action] Recipient name entered');
      }
    } catch (e) {
      console.log('[Khai Action] Recipient name input error:', e.message);
    }

    // Fill in cover page notes
    try {
      const notesInput = await this.page.$('textarea[placeholder*="cover"], textarea[placeholder*="Optional"]');
      if (notesInput) {
        await notesInput.click();
        await notesInput.type(content || 'Practice note from Dr. Ben Soffer. Please review.', { delay: 20 });
        console.log('[Khai Action] Cover notes entered');
      }
    } catch (e) {
      console.log('[Khai Action] Notes input error:', e.message);
    }

    await this.screenshot('fax-form-filled');

    // Click Send Fax button in dialog
    try {
      const sent = await this.page.evaluate(() => {
        const buttons = Array.from(document.querySelectorAll('button'));
        // Find the Send Fax button inside the dialog (not the header button)
        const sendBtn = buttons.find(b =>
          b.textContent.includes('Send Fax') &&
          b.closest('[role="dialog"], .modal, [data-state="open"]')
        );
        if (sendBtn && !sendBtn.disabled) {
          sendBtn.click();
          return true;
        }
        return false;
      });

      if (sent) {
        await new Promise(resolve => setTimeout(resolve, 3000));
        await this.screenshot('fax-sent');
        console.log('[Khai Action] Fax sent successfully');
        return { success: true, message: `Fax sent to ${faxNumber}` };
      } else {
        console.log('[Khai Action] Send button not clickable or not found');
      }
    } catch (e) {
      console.log('[Khai Action] Send button error:', e.message);
    }

    return { success: false, message: 'Could not send fax - button may be disabled or not found' };
  }

  async sendSMS(phoneNumber, message) {
    console.log(`[Khai Action] Sending SMS to ${phoneNumber}`);

    // Navigate to texts page
    await this.navigateTo('/admin/communications/texts');
    await new Promise(resolve => setTimeout(resolve, 2000));
    await this.screenshot('texts-page');

    // Click "Send Text" button in header
    try {
      await this.page.evaluate(() => {
        const buttons = Array.from(document.querySelectorAll('button'));
        const sendBtn = buttons.find(b => b.textContent.includes('Send Text'));
        if (sendBtn) sendBtn.click();
      });
      await new Promise(resolve => setTimeout(resolve, 2000));
      await this.screenshot('compose-sms-dialog');
    } catch (e) {
      console.log('[Khai Action] Send Text button not found:', e.message);
    }

    // Fill in phone number - must clear and type the full number
    try {
      const phoneInput = await this.page.$('input[type="tel"], input[placeholder*="555-0100"]');
      if (phoneInput) {
        // Triple click to select all, then clear
        await phoneInput.click({ clickCount: 3 });
        await new Promise(resolve => setTimeout(resolve, 200));
        await this.page.keyboard.press('Backspace');
        await new Promise(resolve => setTimeout(resolve, 200));

        // Type the phone number
        await phoneInput.type(phoneNumber, { delay: 50 });
        console.log(`[Khai Action] Phone number entered: ${phoneNumber}`);
      }
    } catch (e) {
      console.log('[Khai Action] Phone input error:', e.message);
    }

    // Fill in message
    try {
      const msgInput = await this.page.$('textarea[placeholder*="message"], textarea[placeholder*="160 chars"]');
      if (msgInput) {
        await msgInput.click();
        await msgInput.type(message || 'Reminder from Dr. Ben Soffer office. Please call if you have questions.', { delay: 15 });
        console.log('[Khai Action] Message entered');
      }
    } catch (e) {
      console.log('[Khai Action] Message input error:', e.message);
    }

    await this.screenshot('sms-form-filled');

    // Click Send Text button in dialog
    try {
      const sent = await this.page.evaluate(() => {
        const buttons = Array.from(document.querySelectorAll('button'));
        // Find the Send Text button inside the dialog
        const sendBtn = buttons.find(b =>
          b.textContent.includes('Send Text') &&
          b.closest('[role="dialog"], .modal, [data-state="open"]')
        );
        if (sendBtn && !sendBtn.disabled) {
          sendBtn.click();
          return true;
        }
        return false;
      });

      if (sent) {
        await new Promise(resolve => setTimeout(resolve, 3000));
        await this.screenshot('sms-sent');
        console.log('[Khai Action] SMS sent successfully');
        return { success: true, message: `SMS sent to ${phoneNumber}` };
      } else {
        console.log('[Khai Action] Send Text button not clickable');
      }
    } catch (e) {
      console.log('[Khai Action] Send button error:', e.message);
    }

    return { success: false, message: 'Could not send SMS - button may be disabled' };
  }

  async close() {
    if (this.browser) {
      await this.browser.close();
    }
  }

  /**
   * Execute arbitrary JavaScript on the page and return the result
   */
  async evaluate(script, waitAfter = 3000) {
    console.log(`[Khai Action] Evaluating script`);
    try {
      const result = await this.page.evaluate((code) => {
        // Execute the script and return the result
        return new Function('return ' + code)();
      }, script);
      await new Promise(resolve => setTimeout(resolve, waitAfter));
      await this.screenshot('evaluate-result');
      console.log('[Khai Action] Script executed successfully');
      return { success: true, result };
    } catch (e) {
      console.log('[Khai Action] Script error:', e.message);
      return { success: false, error: e.message };
    }
  }

  /**
   * Register A2P 10DLC Brand on Twilio Console
   */
  async registerTwilioA2P(brandInfo) {
    console.log('[Khai Action] Starting Twilio A2P 10DLC Registration');

    // Navigate to A2P registration page
    const a2pUrl = 'https://console.twilio.com/us1/develop/sms/regulatory-compliance/a2p-10dlc';
    console.log(`[Khai Action] Navigating to ${a2pUrl}`);

    await this.page.goto(a2pUrl, { waitUntil: 'networkidle2', timeout: 60000 });
    await new Promise(resolve => setTimeout(resolve, 3000));
    await this.screenshot('twilio-a2p-page');

    // Check if we need to log in
    const currentUrl = this.page.url();
    if (currentUrl.includes('login')) {
      console.log('[Khai Action] Need to log in to Twilio');
      return { success: false, message: 'Twilio login required - please log in manually first', url: currentUrl };
    }

    // Look for "Register a new Brand" or similar button
    try {
      const registerBtn = await this.page.evaluate(() => {
        const buttons = Array.from(document.querySelectorAll('button, a'));
        const btn = buttons.find(b =>
          b.textContent.toLowerCase().includes('register') ||
          b.textContent.toLowerCase().includes('new brand') ||
          b.textContent.toLowerCase().includes('add brand')
        );
        if (btn) {
          btn.click();
          return true;
        }
        return false;
      });

      if (registerBtn) {
        await new Promise(resolve => setTimeout(resolve, 3000));
        await this.screenshot('twilio-register-brand-form');
      }
    } catch (e) {
      console.log('[Khai Action] Register button not found:', e.message);
    }

    // Fill in brand registration form
    const formData = {
      businessName: brandInfo.businessName || 'Your Business Name',
      businessType: brandInfo.businessType || 'Private Company',
      ein: brandInfo.ein || 'XX-XXXXXXX',
      industry: brandInfo.industry || 'Technology',
      website: brandInfo.website || 'https://yoursite.com',
      contactEmail: brandInfo.email || 'you@yoursite.com',
      contactPhone: brandInfo.phone || '+1XXXXXXXXXX',
      firstName: brandInfo.firstName || 'Your',
      lastName: brandInfo.lastName || 'Name',
      address: brandInfo.address || '123 Main Street',
      city: brandInfo.city || 'Your City',
      state: brandInfo.state || 'ST',
      zip: brandInfo.zip || '00000'
    };

    // Try to fill each field
    for (const [field, value] of Object.entries(formData)) {
      try {
        // Try various selector patterns
        const selectors = [
          `input[name*="${field}" i]`,
          `input[id*="${field}" i]`,
          `input[placeholder*="${field}" i]`,
          `select[name*="${field}" i]`,
          `textarea[name*="${field}" i]`
        ];

        for (const selector of selectors) {
          const element = await this.page.$(selector);
          if (element) {
            const tagName = await element.evaluate(el => el.tagName.toLowerCase());
            if (tagName === 'select') {
              await element.select(value);
            } else {
              await element.click({ clickCount: 3 });
              await element.type(value, { delay: 30 });
            }
            console.log(`[Khai Action] Filled ${field}: ${value}`);
            break;
          }
        }
      } catch (e) {
        console.log(`[Khai Action] Could not fill ${field}:`, e.message);
      }
    }

    await this.screenshot('twilio-brand-form-filled');

    // Look for Submit/Register button
    try {
      const submitted = await this.page.evaluate(() => {
        const buttons = Array.from(document.querySelectorAll('button'));
        const submitBtn = buttons.find(b =>
          b.textContent.toLowerCase().includes('submit') ||
          b.textContent.toLowerCase().includes('register') ||
          b.textContent.toLowerCase().includes('continue') ||
          b.textContent.toLowerCase().includes('next')
        );
        if (submitBtn && !submitBtn.disabled) {
          submitBtn.click();
          return true;
        }
        return false;
      });

      if (submitted) {
        await new Promise(resolve => setTimeout(resolve, 5000));
        await this.screenshot('twilio-brand-submitted');
        console.log('[Khai Action] Brand registration submitted');
        return { success: true, message: 'A2P Brand registration submitted' };
      }
    } catch (e) {
      console.log('[Khai Action] Submit error:', e.message);
    }

    return { success: false, message: 'Could not complete A2P registration - manual review needed' };
  }
}

module.exports = KhaiActions;
