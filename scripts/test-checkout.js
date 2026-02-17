const puppeteer = require('puppeteer');

// Configure your sites here
const SITES = [
  {
    name: 'My Site Checkout',
    url: 'https://yoursite.com/checkout',
    promoCode: 'TESTCODE'
  }
];

async function testCheckout(site) {
  console.log(`\n${'='.repeat(50)}`);
  console.log(`Testing: ${site.name}`);
  console.log(`URL: ${site.url}`);
  console.log(`Promo: ${site.promoCode}`);
  console.log('='.repeat(50));

  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox']
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 800 });

  try {
    console.log('Loading checkout page...');
    await page.goto(site.url, { waitUntil: 'networkidle2', timeout: 30000 });

    const screenshotName = site.name.toLowerCase().replace(/\s+/g, '-');
    await page.screenshot({
      path: `../screenshots/checkout-${screenshotName}-1-initial.png`,
      fullPage: true
    });

    // Get initial price
    const getPrice = async () => {
      return await page.evaluate(() => {
        const priceEl = document.querySelector('[class*="due-today"], [class*="total"], .text-2xl.font-bold');
        if (priceEl) return priceEl.textContent;
        const allText = document.body.innerText;
        const match = allText.match(/Due Today[:\s]*\$?([\d,]+)/i);
        return match ? match[0] : 'Price not found';
      });
    };

    const initialPrice = await getPrice();
    console.log(`Initial price: ${initialPrice}`);

    // Check for promo code input
    const promoInputSelectors = [
      'input[name="promoCode"]',
      'input[name="coupon"]',
      'input[name="discountCode"]',
      'input[placeholder*="promo" i]',
      'input[placeholder*="code" i]',
      'input[placeholder*="coupon" i]',
      '#promoCode',
      '#couponCode'
    ];

    let promoInput = null;
    for (const sel of promoInputSelectors) {
      try {
        promoInput = await page.$(sel);
        if (promoInput) break;
      } catch (e) {}
    }

    if (promoInput) {
      await promoInput.click({ clickCount: 3 });
      await promoInput.type(site.promoCode, { delay: 30 });
      console.log(`Entered promo code: ${site.promoCode}`);

      const clicked = await page.evaluate(() => {
        const buttons = Array.from(document.querySelectorAll('button'));
        const applyBtn = buttons.find(b => b.textContent.toLowerCase().includes('apply'));
        if (applyBtn) { applyBtn.click(); return true; }
        return false;
      });

      if (!clicked) await page.keyboard.press('Enter');

      await new Promise(r => setTimeout(r, 3000));

      await page.screenshot({
        path: `../screenshots/checkout-${screenshotName}-2-promo-applied.png`,
        fullPage: true
      });

      const afterPrice = await getPrice();
      console.log(`After promo price: ${afterPrice}`);

      const promoSuccess = await page.evaluate(() => {
        const text = document.body.innerText.toLowerCase();
        return text.includes('applied') || text.includes('discount') || text.includes('$0');
      });

      console.log(promoSuccess ? 'Promo code applied!' : 'Promo code may not have been applied');
    } else {
      console.log('No promo code input found on page');
    }

    console.log('Test completed');
    return { success: true, site: site.name };

  } catch (error) {
    console.error(`Error: ${error.message}`);
    return { success: false, site: site.name, error: error.message };

  } finally {
    await browser.close();
  }
}

async function main() {
  console.log('\nCheckout Flow Test with Promo Codes\n');
  const results = [];
  for (const site of SITES) {
    results.push(await testCheckout(site));
  }
  console.log('\nRESULTS:');
  for (const r of results) {
    console.log(`${r.success ? 'PASS' : 'FAIL'} ${r.site}`);
  }
}

main().catch(console.error);
