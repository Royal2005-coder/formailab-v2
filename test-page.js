const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  page.on('console', msg => console.log('PAGE LOG:', msg.text()));
  page.on('pageerror', exception => {
    console.error('PAGE EXCEPTION:', exception);
  });
  
  await page.goto('https://formailab.royalai.dev/s/cms7i03kc000201pluwi68q1d?preview=true');
  await page.waitForTimeout(5000);
  await browser.close();
})();
