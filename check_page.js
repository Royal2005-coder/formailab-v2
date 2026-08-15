const { chromium } = require('@playwright/test');
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  page.on('console', msg => console.log('BROWSER_CONSOLE:', msg.text()));
  page.on('pageerror', error => console.log('BROWSER_ERROR:', error.message, error.stack));
  await page.goto('http://127.0.0.1:3103/s/cms7i03kc000201pluwi68q1d?preview=true');
  await page.waitForTimeout(5000);
  await browser.close();
})();
