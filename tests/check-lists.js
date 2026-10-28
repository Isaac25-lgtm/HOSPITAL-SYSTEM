// After cleanup: what do the Lab queue, Clinical active list and registration search show?
const { browser, login, BASE } = require('./lib');
(async () => {
  let { b, page } = await browser();
  await login(page, 'demo.lab', 'chelsea');
  await page.goto(BASE + '/lab', { waitUntil: 'domcontentloaded' }); await page.waitForSelector('text=Active Patient List'); await page.waitForTimeout(2500);
  console.log('LAB ACTIVE:', JSON.stringify(await page.$$eval('td a', as => [...new Set(as.map(a => a.innerText.trim()).filter(t => !/^ABC/.test(t)))])));
  await b.close();
  ({ b, page } = await browser());
  await login(page, 'demo.doctor', 'arsenal');
  await page.goto(BASE + '/bahmni/clinical/index.html#/default/patient/search', { waitUntil: 'domcontentloaded' }); await page.waitForTimeout(5000);
  console.log('CLINICAL ACTIVE TAB:', (await page.locator('text=/Active \\(\\d+\\)/').first().innerText().catch(() => '?')));
  console.log('CLINICAL NAMES:', JSON.stringify(await page.$$eval('.patient-name, .name, [class*="patient"] [class*="name"]', es => es.map(e => e.innerText.trim()).filter(Boolean).slice(0, 12))));
  await page.screenshot({ path: '/t/out/clinical-active-after-cleanup.png' });
  await b.close();
})();
