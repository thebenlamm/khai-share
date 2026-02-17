const { createBrowser } = require('../utils/browser');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const fs = require('fs');

class PasswordRotator {
  constructor() {
    this.browser = null;
    this.page = null;
    this.screenshotDir = path.join(__dirname, '../../screenshots/rotations');
  }

  async init() {
    fs.mkdirSync(this.screenshotDir, { recursive: true });

    const { browser, page } = await createBrowser({
      headless: false,  // Visible so user can handle 2FA/CAPTCHA
      extraArgs: ['--start-maximized'],
      viewport: null
    });
    this.browser = browser;
    this.page = page;
  }

  async takeScreenshot(name) {
    const filename = `${Date.now()}-${name}.png`;
    await this.page.screenshot({
      path: path.join(this.screenshotDir, filename),
      fullPage: true
    });
    return filename;
  }

  async waitForUserAction(message, timeoutMs = 120000) {
    console.log(`[Khai] ⏳ ${message}`);
    // User has 2 minutes to handle 2FA/CAPTCHA
    return new Promise(resolve => setTimeout(resolve, timeoutMs));
  }

  async rotatePassword(config) {
    const {
      site,
      loginUrl,
      changePasswordUrl,
      username,
      currentPassword,
      newPassword,
      selectors,
      postLoginCheck
    } = config;

    const rotationId = uuidv4();
    const result = {
      id: rotationId,
      site,
      status: 'started',
      startTime: new Date().toISOString(),
      steps: []
    };

    try {
      await this.init();

      // Step 1: Navigate to login
      result.steps.push({ step: 'navigate-login', status: 'started' });
      console.log(`[Khai] 🔐 Navigating to ${loginUrl}`);
      await this.page.goto(loginUrl, { waitUntil: 'networkidle2', timeout: 30000 });
      await this.takeScreenshot('01-login-page');
      result.steps[result.steps.length - 1].status = 'completed';

      // Step 2: Fill login form
      result.steps.push({ step: 'fill-login', status: 'started' });
      console.log(`[Khai] 📝 Waiting for page to fully load...`);

      // Wait for page to settle (SPAs need time)
      await new Promise(resolve => setTimeout(resolve, 5000));
      await this.takeScreenshot('02-page-loaded');

      // Try multiple selectors
      const usernameSelectors = selectors.username.split(',').map(s => s.trim());
      const passwordSelectors = selectors.password.split(',').map(s => s.trim());

      let usernameField = null;
      for (const sel of usernameSelectors) {
        try {
          const exists = await this.page.$(sel);
          if (exists) {
            usernameField = sel;
            console.log(`[Khai] Found username field: ${sel}`);
            break;
          }
        } catch (e) {}
      }

      let passwordField = null;
      for (const sel of passwordSelectors) {
        try {
          const exists = await this.page.$(sel);
          if (exists) {
            passwordField = sel;
            console.log(`[Khai] Found password field: ${sel}`);
            break;
          }
        } catch (e) {}
      }

      if (!usernameField || !passwordField) {
        // Take screenshot to see what's on page
        await this.takeScreenshot('debug-no-fields');
        console.log(`[Khai] ⚠️ Could not find login fields. Check screenshot.`);
        console.log(`[Khai] Browser staying open for 60 seconds - you can manually log in.`);
        await new Promise(resolve => setTimeout(resolve, 60000));
        throw new Error('Could not find login form fields - check screenshots');
      }

      await this.page.type(usernameField, username, { delay: 50 });
      await this.page.type(passwordField, currentPassword, { delay: 50 });
      await this.takeScreenshot('02-login-filled');
      result.steps[result.steps.length - 1].status = 'completed';

      // Step 3: Submit login
      result.steps.push({ step: 'submit-login', status: 'started' });
      console.log(`[Khai] 🚀 Submitting login...`);

      const loginButtonSelectors = selectors.loginButton.split(',').map(s => s.trim());
      for (const sel of loginButtonSelectors) {
        try {
          await this.page.click(sel);
          break;
        } catch (e) {}
      }

      // Wait for navigation or 2FA
      console.log(`[Khai] ⏳ Waiting for login (handle 2FA/CAPTCHA if needed)...`);
      await this.page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 120000 }).catch(() => {});
      await this.takeScreenshot('03-after-login');
      result.steps[result.steps.length - 1].status = 'completed';

      // Step 4: Navigate to password change
      result.steps.push({ step: 'navigate-password-change', status: 'started' });
      console.log(`[Khai] 🔑 Navigating to password change: ${changePasswordUrl}`);
      await this.page.goto(changePasswordUrl, { waitUntil: 'networkidle2', timeout: 30000 });
      await this.takeScreenshot('04-password-change-page');
      result.steps[result.steps.length - 1].status = 'completed';

      // Step 5: Fill password change form
      result.steps.push({ step: 'fill-password-form', status: 'started' });
      console.log(`[Khai] 📝 Filling password change form...`);

      // Current password (if required)
      if (selectors.currentPassword) {
        const currentPwdSelectors = selectors.currentPassword.split(',').map(s => s.trim());
        for (const sel of currentPwdSelectors) {
          try {
            await this.page.waitForSelector(sel, { timeout: 3000 });
            await this.page.type(sel, currentPassword, { delay: 50 });
            break;
          } catch (e) {}
        }
      }

      // New password
      const newPwdSelectors = selectors.newPassword.split(',').map(s => s.trim());
      for (const sel of newPwdSelectors) {
        try {
          await this.page.waitForSelector(sel, { timeout: 3000 });
          await this.page.type(sel, newPassword, { delay: 50 });
          break;
        } catch (e) {}
      }

      // Confirm password
      if (selectors.confirmPassword) {
        const confirmPwdSelectors = selectors.confirmPassword.split(',').map(s => s.trim());
        for (const sel of confirmPwdSelectors) {
          try {
            await this.page.waitForSelector(sel, { timeout: 3000 });
            await this.page.type(sel, newPassword, { delay: 50 });
            break;
          } catch (e) {}
        }
      }

      await this.takeScreenshot('05-password-form-filled');
      result.steps[result.steps.length - 1].status = 'completed';

      // Step 6: Submit
      result.steps.push({ step: 'submit-password-change', status: 'started' });
      console.log(`[Khai] 🚀 Submitting password change...`);

      const submitSelectors = selectors.submitButton.split(',').map(s => s.trim());
      for (const sel of submitSelectors) {
        try {
          await this.page.click(sel);
          break;
        } catch (e) {}
      }

      // Wait for confirmation
      await new Promise(resolve => setTimeout(resolve, 5000));
      await this.takeScreenshot('06-password-changed');
      result.steps[result.steps.length - 1].status = 'completed';

      result.status = 'success';
      result.endTime = new Date().toISOString();
      console.log(`[Khai] ✅ Password rotated successfully for ${site}`);

    } catch (error) {
      result.status = 'error';
      result.error = error.message;
      result.endTime = new Date().toISOString();
      console.error(`[Khai] ❌ Password rotation failed: ${error.message}`);
      await this.takeScreenshot('error-state');
    } finally {
      if (this.browser) {
        // Keep browser open for 10 seconds so user can verify
        console.log(`[Khai] 👀 Browser will close in 10 seconds...`);
        await new Promise(resolve => setTimeout(resolve, 10000));
        await this.browser.close();
      }
    }

    return result;
  }
}

module.exports = PasswordRotator;
