const puppeteer = require('puppeteer');

// Example: test a multi-step consulting booking flow with a promo code
// Customize the URL, selectors, and promo code for your site

async function testConsultingPromo() {
  console.log('\nTesting Multi-Step Booking with Promo Code\n');

  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox']
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 900 });

  try {
    // Step 1: Load the booking page
    console.log('Step 1: Loading booking page...');
    await page.goto('https://yoursite.com/book', {
      waitUntil: 'networkidle2',
      timeout: 30000
    });
    await page.screenshot({ path: '../screenshots/booking-1-initial.png', fullPage: true });

    // Step 2: Select service (customize selectors for your site)
    console.log('Step 2: Select a service...');
    // await page.click('button.service-option');
    // await page.evaluate(() => {
    //   const btn = [...document.querySelectorAll('button')].find(b => b.textContent.includes('Continue'));
    //   if (btn) btn.click();
    // });

    // Step 3: Fill client details
    console.log('Step 3: Fill client details...');
    // await page.type('#clientName', 'Test User');
    // await page.type('#clientEmail', 'test@example.com');

    // Step 4: Apply promo code
    console.log('Step 4: Looking for promo code input...');
    const promoInput = await page.$('input[placeholder*="code" i], input[placeholder*="promo" i]');
    if (promoInput) {
      await promoInput.type('YOUR_PROMO_CODE', { delay: 50 });
      await page.evaluate(() => {
        const btn = [...document.querySelectorAll('button')].find(b => b.textContent === 'Apply');
        if (btn) btn.click();
      });
      await new Promise(r => setTimeout(r, 2000));
      await page.screenshot({ path: '../screenshots/booking-promo-applied.png', fullPage: true });
      console.log('Promo code entered - check screenshot');
    } else {
      console.log('Promo code input not found');
    }

    console.log('\nTest completed!');

  } catch (error) {
    console.error(`Error: ${error.message}`);
  } finally {
    await browser.close();
  }
}

testConsultingPromo().catch(console.error);
