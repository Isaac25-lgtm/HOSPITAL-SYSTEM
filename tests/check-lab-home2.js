// Verify: Lab tile -> /lab/home with VIPERS logo; Back returns to Home; patient lab page still works.
const { browser, login, BASE } = require('./lib');
(async () => {
  const { b, page, errors } = await browser({ width: 1366, height: 768 });
  await login(page, 'demo.lab', 'chelsea');
  await page.waitForTimeout(2000);
  await page.locator('a:has-text("Lab Entry")').first().click();
  await page.waitForSelector('text=Active Patient List', { timeout: 60000 }); await page.waitForTimeout(1500);
  const logo = await page.evaluate(() => { const i = [...document.querySelectorAll('img')].find(x => x.getBoundingClientRect().width > 150); return i ? i.getAttribute('src') + ' alt=' + i.getAttribute('alt') : 'none'; });
  console.log('Lab home url:', page.url().replace(BASE, ''), '| big logo:', logo);
  await page.screenshot({ path: '/t/out/lab-home-branded.png' });
  await page.goBack(); await page.waitForTimeout(4000);
  console.log('After Back:', page.url().replace(BASE, ''), '| tiles visible:', await page.locator('a:has-text("Lab Entry")').count() > 0);
  await page.goto(`${BASE}/lab/patient/${process.env.PATIENT}`, { waitUntil: 'domcontentloaded' });
  console.log('Lab patient page:', await page.waitForSelector('text=Pending Lab Orders', { timeout: 30000 }).then(() => 'OK').catch(() => 'FAILED'));
  console.log('errors:', errors.slice(0, 3).join(' || '));
  await b.close();
})();
