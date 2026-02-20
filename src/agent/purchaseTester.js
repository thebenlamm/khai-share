const { v4: uuidv4 } = require('uuid');

class PurchaseTester {
  constructor(page, config) {
    this.page = page;
    this.config = config;
    this.pendingPurchases = new Map();
  }

  async detectCheckoutPage() {
    try {
      const isCheckout = await this.page.evaluate(() => {
        const urlPath = new URL(window.location.href).pathname.toLowerCase();

        // Payment form selectors used for both URL and text detection paths
        const paymentSelectors = [
          'input[name*="card"]', 'input[autocomplete*="cc-"]',
          'iframe[src*="stripe"]', 'iframe[src*="braintree"]',
          '[data-stripe]', '.StripeElement', '#card-element',
          'input[name*="cvv"]', 'input[name*="expir"]'
        ];
        const hasPaymentForm = paymentSelectors.some(sel => document.querySelector(sel) !== null);

        // URL indicators — checkout/payment are high confidence, cart requires form elements
        if (/\b(checkout|payment)\b/.test(urlPath)) {
          return true;
        }
        if (/\bcart\b/.test(urlPath) && hasPaymentForm) {
          return true;
        }

        // For text indicators: require BOTH text match AND actual payment form elements
        const bodyText = document.body.innerText.toLowerCase();
        const checkoutIndicators = [
          'credit card', 'card number', 'payment method',
          'billing address', 'checkout', 'complete purchase',
          'place order', 'pay now', 'submit payment'
        ];

        const hasTextIndicator = checkoutIndicators.some(indicator => bodyText.includes(indicator));
        if (!hasTextIndicator) return false;

        // Must also have actual payment form elements
        return hasPaymentForm;
      });

      return isCheckout;
    } catch (error) {
      return false;
    }
  }

  async extractPurchaseDetails() {
    try {
      return await this.page.evaluate(() => {
        let product = '';
        let amount = '';

        // Try to find product info
        const productSelectors = [
          '.product-name', '.item-name', '[class*="product"]',
          '.cart-item', '.order-item', 'h1', 'h2'
        ];
        for (const sel of productSelectors) {
          const el = document.querySelector(sel);
          if (el && el.textContent.trim()) {
            product = el.textContent.trim().substring(0, 100);
            break;
          }
        }

        // Try to find total amount
        const amountSelectors = [
          '.total', '.order-total', '[class*="total"]',
          '.amount', '.price', '[class*="price"]'
        ];
        for (const sel of amountSelectors) {
          const el = document.querySelector(sel);
          if (el) {
            const text = el.textContent;
            const match = text.match(/\$[\d,]+\.?\d*/);
            if (match) {
              amount = match[0];
              break;
            }
          }
        }

        return { product, amount };
      });
    } catch (error) {
      return { product: 'Unknown', amount: 'Unknown' };
    }
  }

  async fillPaymentForm(cardConfig) {
    const selectors = this.config.selectors;

    try {
      // Wait for payment form to be visible
      await this.page.waitForSelector(selectors.cardNumber.split(',')[0], { timeout: 5000 });

      // Fill card number
      for (const sel of selectors.cardNumber.split(',')) {
        try {
          await this.page.type(sel.trim(), cardConfig.number, { delay: 50 });
          break;
        } catch (e) { continue; }
      }

      // Fill expiry
      for (const sel of selectors.expiry.split(',')) {
        try {
          await this.page.type(sel.trim(), cardConfig.expiry, { delay: 50 });
          break;
        } catch (e) { continue; }
      }

      // Fill CVV
      for (const sel of selectors.cvv.split(',')) {
        try {
          await this.page.type(sel.trim(), cardConfig.cvv, { delay: 50 });
          break;
        } catch (e) { continue; }
      }

      // Fill name if present
      for (const sel of selectors.name.split(',')) {
        try {
          await this.page.type(sel.trim(), cardConfig.name, { delay: 50 });
          break;
        } catch (e) { continue; }
      }

      // Fill zip if present
      for (const sel of selectors.zip.split(',')) {
        try {
          await this.page.type(sel.trim(), cardConfig.zip, { delay: 50 });
          break;
        } catch (e) { continue; }
      }

      return true;
    } catch (error) {
      console.error('Error filling payment form:', error.message);
      return false;
    }
  }

  async createPurchaseRequest(site) {
    const details = await this.extractPurchaseDetails();
    const cardLast4 = this.config.cards?.primary?.number?.slice(-4) || '0000';

    const purchase = {
      id: uuidv4(),
      site,
      url: this.page.url(),
      product: details.product,
      amount: details.amount.replace('$', ''),
      cardLast4,
      status: 'pending',
      timestamp: new Date().toISOString()
    };

    this.pendingPurchases.set(purchase.id, purchase);
    return purchase;
  }

  async confirmPurchase(purchaseId, confirmed) {
    const purchase = this.pendingPurchases.get(purchaseId);
    if (!purchase) return null;

    if (confirmed) {
      purchase.status = 'confirmed';
      // Click submit button
      const selectors = this.config.selectors;
      try {
        for (const sel of selectors.submitButton.split(',')) {
          try {
            await this.page.click(sel.trim());
            purchase.status = 'completed';
            break;
          } catch (e) { continue; }
        }
      } catch (error) {
        purchase.status = 'error';
        purchase.error = error.message;
      }
    } else {
      purchase.status = 'cancelled';
    }

    return purchase;
  }

  getPendingPurchases() {
    return Array.from(this.pendingPurchases.values())
      .filter(p => p.status === 'pending');
  }

  getAllPurchases() {
    return Array.from(this.pendingPurchases.values());
  }
}

module.exports = PurchaseTester;
