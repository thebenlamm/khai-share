const { createBrowser } = require('../utils/browser');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const fs = require('fs');

/**
 * FormFuzzer - Discovers and fuzz-tests forms on web pages using Puppeteer.
 * Identifies input fields, generates adversarial payloads per type, submits
 * each variant and checks for crashes, missing validation, XSS reflection,
 * and unexpected navigation.
 */
class FormFuzzer {
  constructor(config) {
    this.baseUrl = config.baseUrl;
    this.screenshotDir = config.screenshotDir || path.join(__dirname, '../../screenshots/fuzz');
    this.browser = null;
    this.page = null;
    this.results = [];
  }

  async init() {
    fs.mkdirSync(this.screenshotDir, { recursive: true });
    const { browser, page } = await createBrowser();
    this.browser = browser;
    this.page = page;
    this.page.on('dialog', async (dialog) => { await dialog.dismiss(); });
  }

  async login(accountConfig) {
    const loginUrl = this.baseUrl + accountConfig.loginUrl;
    console.log(`[FormFuzzer] Logging in at ${loginUrl}`);
    await this.page.goto(loginUrl, { waitUntil: 'networkidle2', timeout: 30000 });
    await new Promise((r) => setTimeout(r, 2000));

    const emailInput = await this._findSelector(accountConfig.usernameField);
    if (!emailInput) throw new Error('Could not find email input for login');
    const pwInput = (await this._findSelector(accountConfig.passwordField)) || 'input[type="password"]';

    await this.page.type(emailInput, accountConfig.username, { delay: 30 });
    await this.page.type(pwInput, accountConfig.password, { delay: 30 });

    for (const sel of accountConfig.submitButton.split(',').map((s) => s.trim())) {
      try {
        const btn = await this.page.$(sel);
        if (btn) {
          await Promise.all([
            btn.click(),
            this.page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 20000 }).catch(() => {}),
          ]);
          break;
        }
      } catch { continue; }
    }
    await new Promise((r) => setTimeout(r, 2000));
    console.log(`[FormFuzzer] Logged in. URL: ${this.page.url()}`);
  }

  async _findSelector(commaList) {
    for (const sel of commaList.split(',').map((s) => s.trim())) {
      try { await this.page.waitForSelector(sel, { timeout: 3000 }); return sel; }
      catch { continue; }
    }
    return null;
  }

  // ===========================
  // Fuzz payload generators
  // ===========================

  _getFuzzPayloads(fieldType) {
    const xss = ['<script>alert(1)</script>', '"><img src=x onerror=alert(1)>', "'-alert(1)-'", '<svg/onload=alert(1)>'];
    const sql = ["' OR 1=1 --", "'; DROP TABLE users; --", '1 UNION SELECT null,null--'];
    const special = '!@#$%^&*()_+-=[]{}|;:,.<>?';
    const nullBytes = '\u0000\u0001\u0002';

    const payloads = {
      text:     ['', 'a'.repeat(5000), ...xss, ...sql, special, nullBytes, '\u{1F4A9}\u{1F600}', 'null', 'undefined', '${7*7}'],
      email:    ['', 'notanemail', 'a@', '@b.com', 'a'.repeat(200) + '@test.com', '<script>alert(1)</script>@test.com', 'test@test.com<script>', 'a@b@c.com', '"very.unusual"@strange.com'],
      number:   ['', '-1', '0', '99999999999999', '1.23456789', 'NaN', 'Infinity', '-Infinity', 'abc', '1e308'],
      tel:      ['', 'abc', '12', '1'.repeat(30), '+1-555-not-real', '000-000-0000', '+0000000000'],
      password: ['', 'a'.repeat(5000), special, '<script>alert(1)</script>', '\u0000password\u0000'],
      select:   ['', '__invalid__', '-1', '999999'],
      textarea: ['', 'a'.repeat(5000), ...xss, ...sql, 'line1\nline2\n'.repeat(500), special, nullBytes],
    };
    return payloads[fieldType] || payloads.text;
  }

  // ===========================
  // Form discovery
  // ===========================

  async _discoverForms() {
    return await this.page.evaluate(() => {
      const forms = [];
      document.querySelectorAll('form').forEach((form, fi) => {
        const fields = [];
        form.querySelectorAll('input, select, textarea').forEach((el) => {
          if (el.type === 'hidden' || el.type === 'submit') return;
          const tag = el.tagName.toLowerCase();
          fields.push({
            tag, type: el.type || (tag === 'textarea' ? 'textarea' : 'text'),
            name: el.name || el.id || `field_${fields.length}`,
            required: el.required, pattern: el.pattern || null,
            maxLength: el.maxLength > 0 ? el.maxLength : null,
            selector: el.id ? `#${el.id}`
              : el.name ? `form:nth-of-type(${fi + 1}) [name="${el.name}"]`
              : `form:nth-of-type(${fi + 1}) ${tag}:nth-of-type(${fields.length + 1})`,
          });
        });
        forms.push({ index: fi, action: form.action || '', method: (form.method || 'GET').toUpperCase(), fields });
      });
      return forms;
    });
  }

  // ===========================
  // Core fuzzing
  // ===========================

  async fuzzPage(url) {
    console.log(`[FormFuzzer] Fuzzing page: ${url}`);
    await this.page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
    await new Promise((r) => setTimeout(r, 1500));

    const forms = await this._discoverForms();
    console.log(`[FormFuzzer] Found ${forms.length} form(s)`);
    const pageResult = { url, forms: [] };

    for (const form of forms) {
      if (form.fields.length === 0) continue;
      pageResult.forms.push(await this.fuzzForm(form, url));
    }
    this.results.push(pageResult);
    return pageResult;
  }

  async fuzzForm(formInfo, pageUrl) {
    const formResult = { action: formInfo.action, method: formInfo.method, fields: formInfo.fields, results: [] };

    for (const field of formInfo.fields) {
      const payloads = this._getFuzzPayloads(this._mapFieldType(field.type, field.tag));
      for (const payload of payloads) {
        await this.page.goto(pageUrl, { waitUntil: 'networkidle2', timeout: 20000 });
        await new Promise((r) => setTimeout(r, 800));

        const outcome = await this._submitWithPayload(formInfo, field, payload);
        formResult.results.push(outcome);

        if (outcome.outcome === 'crash' || outcome.outcome === 'xss_reflected') {
          const name = `fuzz-${uuidv4().slice(0, 8)}`;
          await this._takeScreenshot(name);
          outcome.screenshot = `${name}.png`;
        }
      }
    }
    return formResult;
  }

  async _submitWithPayload(formInfo, field, payload) {
    const result = {
      fieldName: field.name, fieldType: field.type,
      input: typeof payload === 'string' ? payload.substring(0, 200) : String(payload),
      outcome: 'accepted', detail: '',
    };
    const urlBefore = this.page.url();

    try {
      // Fill the target field
      if (field.tag === 'select') {
        await this.page.select(field.selector, payload).catch(() => {});
      } else {
        await this.page.click(field.selector).catch(() => {});
        await this.page.evaluate((sel) => { const el = document.querySelector(sel); if (el) el.value = ''; }, field.selector);
        await this.page.type(field.selector, String(payload), { delay: 5 });
      }

      // Submit the form
      await Promise.all([
        this.page.evaluate((idx) => {
          const form = document.querySelectorAll('form')[idx];
          if (!form) return;
          const btn = form.querySelector('button[type="submit"], input[type="submit"]');
          btn ? btn.click() : form.submit();
        }, formInfo.index),
        this.page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 8000 }).catch(() => {}),
      ]);
      await new Promise((r) => setTimeout(r, 500));

      // Check for crashes
      const bodyText = await this.page.evaluate(() => document.body?.innerText || '').catch(() => '');
      const bodyHtml = await this.page.evaluate(() => document.body?.innerHTML || '').catch(() => '');

      if (!bodyText && !bodyHtml) {
        result.outcome = 'crash'; result.detail = 'Page rendered blank after submission'; return result;
      }
      const crashWords = ['application error', 'internal server error', 'unhandled runtime error', 'something went wrong', 'error boundary'];
      for (const cw of crashWords) {
        if (bodyText.toLowerCase().includes(cw)) {
          result.outcome = 'crash'; result.detail = `Error: "${cw}" found in page`; return result;
        }
      }

      // Check XSS reflection
      if (typeof payload === 'string' && payload.includes('<') && bodyHtml.includes(payload)) {
        result.outcome = 'xss_reflected'; result.detail = 'XSS payload reflected unescaped in DOM'; return result;
      }

      // Validation and URL change checks
      const hasValidation = await this.page.evaluate(() => {
        return document.querySelectorAll(':invalid, .error, .field-error, [class*="error"], [role="alert"]').length > 0;
      });
      const urlAfter = this.page.url();
      if (urlAfter !== urlBefore) result.detail = `URL changed: ${urlBefore} -> ${urlAfter}`;

      result.outcome = hasValidation ? 'rejected' : 'accepted';
      result.detail = result.detail || (hasValidation ? 'Validation message shown' : 'Input accepted without validation error');
    } catch (err) {
      result.outcome = 'crash'; result.detail = `Exception: ${err.message}`;
    }
    return result;
  }

  _mapFieldType(type, tag) {
    if (tag === 'select') return 'select';
    if (tag === 'textarea') return 'textarea';
    return { email: 'email', number: 'number', tel: 'tel', password: 'password', text: 'text', search: 'text', url: 'text' }[type] || 'text';
  }

  async _takeScreenshot(name) {
    try {
      const fp = path.join(this.screenshotDir, `${name}.png`);
      await this.page.screenshot({ path: fp, fullPage: true });
      return fp;
    } catch { return null; }
  }

  async close() {
    if (this.browser) { await this.browser.close(); this.browser = null; this.page = null; }
    return this.results;
  }
}

module.exports = FormFuzzer;
