// Appointments after the home warm-up: does it render, and what is slow?
const { browser, login, BASE } = require('./lib');
(async () => {
  const { b, page, errors } = await browser({ width: 1366, height: 768 });
  const slow = [];
  page.on('requestfinished', r => { const t = r.timing(); const d = t.responseEnd; if (d > 3000) slow.push(`${Math.round(d)}ms ${r.url().replace(BASE, '').slice(0, 90)}`); });
  page.on('requestfailed', r => slow.push(`FAILED ${r.url().replace(BASE, '').slice(0, 90)} ${r.failure() && r.failure().errorText}`));
  await login(page, 'demo.doctor', 'arsenal');
  await page.waitForTimeout(30000);
  const t = Date.now();
  await page.goto(BASE + '/appointments/#/home/manage/summary', { waitUntil: 'domcontentloaded' });
  for (let i = 0; i < 30; i++) { if (await page.locator('text=Services').count()) break; await page.waitForTimeout(1000); }
  console.log('Appointments rendered "Services" after', Date.now() - t, 'ms; url', page.url());
  await page.screenshot({ path: '/t/out/appt-after-warm.png' });
  console.log('SLOW/FAILED:', JSON.stringify(slow.slice(0, 10)));
  console.log('ERRORS:', errors.slice(0, 5).join(' || '));
  await b.close();
})();
