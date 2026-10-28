// Evidence screenshots of screens the workflow tests pass through quickly.
const { browser, passGate, BASE } = require('./lib');
const BILL = BASE.replace('://demo.', '://billing.');
(async () => {
  const { b, page } = await browser({ width: 1366, height: 768 });
  await page.goto(BASE + '/vipers-gate/', { waitUntil: 'networkidle' });
  await page.screenshot({ path: '/t/out/r-00-gate.png' });
  await passGate(page); await page.waitForSelector('#username'); await page.waitForTimeout(2500);
  await page.screenshot({ path: '/t/out/r-01-login.png' });
  await page.goto(BASE + '/vipers-assets/about.html', { waitUntil: 'networkidle' });
  await page.screenshot({ path: '/t/out/r-12-about-licences.png', fullPage: true });
  await page.goto(BASE + '/vipers-assets/help.html', { waitUntil: 'networkidle' });
  await page.screenshot({ path: '/t/out/r-13-help-guide.png' });
  await page.goto(BILL + '/', { waitUntil: 'networkidle' }); await page.waitForTimeout(2000);
  await page.screenshot({ path: '/t/out/r-14-billing-login.png' });
  await b.close();
})();
