/**
 * AccessibilityAgent - Runs axe-core accessibility audits on pages
 *
 * Provides WCAG 2.0/2.1/2.2 compliance testing using axe-core.
 * Supports configurable WCAG rule tags and third-party element exclusions.
 *
 * @example
 * const agent = new AccessibilityAgent({
 *   tags: ['wcag2a', 'wcag2aa'],
 *   excludeSelectors: ['#stripe-iframe', '.chat-widget']
 * });
 * const result = await agent.auditPage(page, 'https://example.com', 'Homepage');
 */
class AccessibilityAgent {
  /**
   * Create an AccessibilityAgent
   * @param {Object} config - Configuration options
   * @param {string[]} config.pages - Array of page URLs to audit (optional)
   * @param {string[]} config.tags - WCAG rule tags to apply (default: ['wcag2a', 'wcag2aa'])
   * @param {string[]} config.excludeSelectors - CSS selectors to exclude from audit (default: [])
   */
  constructor(config = {}) {
    this.pages = config.pages || [];
    this.tags = config.tags || ['wcag2a', 'wcag2aa'];
    this.excludeSelectors = config.excludeSelectors || [];
    this.results = [];
  }

  /**
   * Audit a page for accessibility violations
   *
   * CRITICAL: This method calls page.setBypassCSP(true) before navigation.
   * This is required for sites with strict Content Security Policy headers
   * (like HomeBay) that would otherwise block axe-core's injected scripts.
   *
   * @param {Object} page - Puppeteer page instance
   * @param {string} url - URL to audit
   * @param {string} name - Human-readable name for this page
   * @returns {Promise<Object>} Audit results with violations, incomplete, passes, inapplicable
   */
  async auditPage(page, url, name) {
    // Implementation in Task 2
    throw new Error('auditPage not yet implemented');
  }

  /**
   * Group violations by severity level
   * @private
   * @param {Array} violations - Array of axe-core violation objects
   * @returns {Object} Violations grouped by severity: { critical: [], serious: [], moderate: [], minor: [] }
   */
  _groupBySeverity(violations) {
    const grouped = {
      critical: [],
      serious: [],
      moderate: [],
      minor: []
    };

    for (const violation of violations) {
      const severity = violation.impact; // axe-core uses 'critical', 'serious', 'moderate', 'minor'
      if (grouped[severity]) {
        grouped[severity].push(violation);
      }
    }

    return grouped;
  }
}

module.exports = { AccessibilityAgent };
