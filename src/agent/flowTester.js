/**
 * Khai Flow Tester
 *
 * Executes multi-step user journey flows with assertions.
 * Each flow is a sequence of steps (navigate, click, fill, assert, etc.)
 * that simulates a real user interacting with the site.
 */

const { createBrowser } = require('../utils/browser');
const path = require('path');
const fs = require('fs');

class FlowTester {
  constructor(config) {
    this.baseUrl = config.baseUrl;
    this.screenshotDir = config.screenshotDir || path.join(__dirname, '../../screenshots/flows');
    this.browser = null;
    this.page = null;
    this.extractedValues = {};
  }

  async init() {
    fs.mkdirSync(this.screenshotDir, { recursive: true });

    const { browser, page } = await createBrowser();
    this.browser = browser;
    this.page = page;

    this.page.on('console', msg => {
      if (msg.type() === 'error') {
        console.log(`[FlowTester] Console error: ${msg.text()}`);
      }
    });

    this.page.on('pageerror', error => {
      console.log(`[FlowTester] Page error: ${error.message}`);
    });

    console.log('[FlowTester] Browser initialized');
  }

  async login(accountConfig) {
    const loginUrl = this.baseUrl + accountConfig.loginUrl;
    console.log(`[FlowTester] Logging in at ${loginUrl}`);

    try {
      await this.page.goto(loginUrl, { waitUntil: 'networkidle2', timeout: 30000 });
      await new Promise(resolve => setTimeout(resolve, 3000));

      // Handle loginTrigger if present (e.g., "Admin Portal Login" button)
      if (accountConfig.loginTrigger) {
        try {
          const triggerClicked = await this.page.evaluate((triggerText) => {
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
            await new Promise(resolve => setTimeout(resolve, 2000));
          }
        } catch (e) {
          console.log('[FlowTester] Login trigger error:', e.message);
        }
      }

      // Fill email
      const emailSelectors = accountConfig.usernameField.split(',').map(s => s.trim());
      for (const selector of emailSelectors) {
        try {
          await this.page.waitForSelector(selector, { timeout: 5000 });
          await this.page.type(selector, accountConfig.username, { delay: 50 });
          break;
        } catch (e) { continue; }
      }

      // Fill password
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

      const currentUrl = this.page.url();
      const loginPath = accountConfig.loginUrl || '/login';
      if (currentUrl.includes(loginPath) && !currentUrl.includes('callback')) {
        console.log('[FlowTester] Login may have failed - still on login page');
        return false;
      }

      console.log(`[FlowTester] Login successful, URL: ${currentUrl}`);
      return true;
    } catch (error) {
      console.log('[FlowTester] Login error:', error.message);
      await this.takeScreenshot('login-error');
      return false;
    }
  }

  async runFlow(flow) {
    const result = {
      name: flow.name,
      passed: 0,
      failed: 0,
      steps: [],
      startTime: new Date().toISOString(),
      endTime: null
    };

    console.log(`[FlowTester] Running flow: ${flow.name}`);

    for (let i = 0; i < flow.steps.length; i++) {
      const step = flow.steps[i];
      const stepLabel = step.label || `${step.type}${step.selector ? ' ' + step.selector : ''}`;
      console.log(`[FlowTester]   Step ${i + 1}/${flow.steps.length}: ${stepLabel}`);

      let stepResult;
      try {
        stepResult = await this.runStep(step);
      } catch (error) {
        stepResult = { passed: false, detail: `Unexpected error: ${error.message}` };
      }

      const entry = {
        step: stepLabel,
        type: step.type,
        status: stepResult.passed ? 'passed' : 'failed',
        detail: stepResult.detail
      };

      if (!stepResult.passed) {
        result.failed++;
        try {
          const screenshotName = `fail-${flow.name.replace(/\s+/g, '-').toLowerCase()}-step${i + 1}`;
          const screenshotPath = await this.takeScreenshot(screenshotName);
          if (screenshotPath) {
            entry.screenshot = screenshotPath;
          }
        } catch (e) {
          // Screenshot on failure is best-effort
        }
      } else {
        result.passed++;
      }

      if (stepResult.screenshot) {
        entry.screenshot = stepResult.screenshot;
      }

      result.steps.push(entry);
    }

    result.endTime = new Date().toISOString();
    console.log(`[FlowTester] Flow "${flow.name}" complete: ${result.passed} passed, ${result.failed} failed`);
    return result;
  }

  async runStep(step) {
    switch (step.type) {
      case 'navigate':
        return await this._stepNavigate(step);
      case 'click':
        return await this._stepClick(step);
      case 'fill':
        return await this._stepFill(step);
      case 'submit':
        return await this._stepSubmit(step);
      case 'wait':
        return await this._stepWait(step);
      case 'screenshot':
        return await this._stepScreenshot(step);
      case 'assert':
        return await this._stepAssert(step);
      case 'extractText':
        return await this._stepExtractText(step);
      default:
        return { passed: false, detail: `Unknown step type: ${step.type}` };
    }
  }

  async _stepNavigate(step) {
    const url = step.url.startsWith('http') ? step.url : this.baseUrl + step.url;
    try {
      const response = await this.page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
      const status = response ? response.status() : 0;
      if (status >= 400) {
        return { passed: false, detail: `Navigation to ${url} returned HTTP ${status}` };
      }
      await new Promise(resolve => setTimeout(resolve, 1000));
      return { passed: true, detail: `Navigated to ${url} (HTTP ${status})` };
    } catch (error) {
      return { passed: false, detail: `Navigation failed: ${error.message}` };
    }
  }

  async _stepClick(step) {
    try {
      await this.page.waitForSelector(step.selector, { timeout: step.timeout || 10000 });
      await this.page.click(step.selector);
      await new Promise(resolve => setTimeout(resolve, step.waitAfter || 1000));
      return { passed: true, detail: `Clicked ${step.selector}` };
    } catch (error) {
      return { passed: false, detail: `Click failed on ${step.selector}: ${error.message}` };
    }
  }

  async _stepFill(step) {
    try {
      await this.page.waitForSelector(step.selector, { timeout: step.timeout || 10000 });
      // Clear existing value first
      await this.page.click(step.selector, { clickCount: 3 });
      await this.page.keyboard.press('Backspace');
      const value = this._resolveValue(step.value);
      await this.page.type(step.selector, value, { delay: step.delay || 30 });
      return { passed: true, detail: `Filled ${step.selector} with "${value}"` };
    } catch (error) {
      return { passed: false, detail: `Fill failed on ${step.selector}: ${error.message}` };
    }
  }

  async _stepSubmit(step) {
    try {
      if (step.selector) {
        await this.page.waitForSelector(step.selector, { timeout: step.timeout || 10000 });
        await Promise.all([
          this.page.click(step.selector),
          this.page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 }).catch(() => {})
        ]);
      } else {
        await Promise.all([
          this.page.keyboard.press('Enter'),
          this.page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 }).catch(() => {})
        ]);
      }
      await new Promise(resolve => setTimeout(resolve, 1000));
      return { passed: true, detail: `Submitted form${step.selector ? ' via ' + step.selector : ''}` };
    } catch (error) {
      return { passed: false, detail: `Submit failed: ${error.message}` };
    }
  }

  async _stepWait(step) {
    try {
      if (step.duration) {
        await new Promise(resolve => setTimeout(resolve, step.duration));
        return { passed: true, detail: `Waited ${step.duration}ms` };
      }
      if (step.selector) {
        await this.page.waitForSelector(step.selector, { timeout: step.timeout || 10000 });
        return { passed: true, detail: `Element ${step.selector} appeared` };
      }
      return { passed: false, detail: 'Wait step requires either duration or selector' };
    } catch (error) {
      return { passed: false, detail: `Wait failed for ${step.selector}: ${error.message}` };
    }
  }

  async _stepScreenshot(step) {
    const name = step.name || `screenshot-${Date.now()}`;
    const filepath = await this.takeScreenshot(name);
    if (filepath) {
      return { passed: true, detail: `Screenshot saved: ${name}.png`, screenshot: filepath };
    }
    return { passed: false, detail: 'Screenshot failed' };
  }

  async _stepAssert(step) {
    try {
      switch (step.check) {
        case 'textContains': {
          const bodyText = await this.page.evaluate(() => document.body.innerText);
          const found = bodyText.includes(step.value);
          return {
            passed: found,
            detail: found
              ? `Page contains text "${step.value}"`
              : `Page does not contain text "${step.value}"`
          };
        }

        case 'elementExists': {
          const el = await this.page.$(step.value);
          return {
            passed: !!el,
            detail: el
              ? `Element ${step.value} exists`
              : `Element ${step.value} not found`
          };
        }

        case 'urlContains': {
          const currentUrl = this.page.url();
          const matches = currentUrl.includes(step.value);
          return {
            passed: matches,
            detail: matches
              ? `URL contains "${step.value}" (${currentUrl})`
              : `URL does not contain "${step.value}" (${currentUrl})`
          };
        }

        case 'urlEquals': {
          const currentUrl = this.page.url();
          const expected = step.value.startsWith('http') ? step.value : this.baseUrl + step.value;
          const matches = currentUrl === expected;
          return {
            passed: matches,
            detail: matches
              ? `URL matches "${expected}"`
              : `URL mismatch: expected "${expected}", got "${currentUrl}"`
          };
        }

        case 'elementHasValue': {
          const val = await this.page.$eval(step.selector, el => el.value);
          const expected = this._resolveValue(step.value);
          const matches = val === expected;
          return {
            passed: matches,
            detail: matches
              ? `${step.selector} has value "${expected}"`
              : `${step.selector} value mismatch: expected "${expected}", got "${val}"`
          };
        }

        default:
          return { passed: false, detail: `Unknown assert check type: ${step.check}` };
      }
    } catch (error) {
      return { passed: false, detail: `Assert error (${step.check}): ${error.message}` };
    }
  }

  async _stepExtractText(step) {
    try {
      await this.page.waitForSelector(step.selector, { timeout: step.timeout || 10000 });
      const text = await this.page.$eval(step.selector, el => el.innerText.trim());
      if (step.saveTo) {
        this.extractedValues[step.saveTo] = text;
      }
      return { passed: true, detail: `Extracted "${text}" from ${step.selector}` };
    } catch (error) {
      return { passed: false, detail: `Extract failed on ${step.selector}: ${error.message}` };
    }
  }

  /**
   * Resolve a value that may reference an extracted variable via {{varName}} syntax.
   */
  _resolveValue(value) {
    if (typeof value !== 'string') return value;
    return value.replace(/\{\{(\w+)\}\}/g, (match, varName) => {
      return this.extractedValues[varName] !== undefined ? this.extractedValues[varName] : match;
    });
  }

  async takeScreenshot(name) {
    try {
      const filepath = path.join(this.screenshotDir, `${name}.png`);
      await this.page.screenshot({ path: filepath, fullPage: true });
      return filepath;
    } catch (error) {
      console.log('[FlowTester] Screenshot error:', error.message);
      return null;
    }
  }

  async close() {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
      this.page = null;
    }
    console.log('[FlowTester] Browser closed');
  }
}

module.exports = FlowTester;
