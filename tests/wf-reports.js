// Run every configured report (as demo.admin) + "Print latest medications" (as demo.doctor).
const { browser, login, BASE } = require('./lib');
(async () => {
  let { b, page } = await browser({ width: 1366, height: 768 });
  await login(page, 'demo.admin', 'fulham');
  await page.goto(BASE + '/bahmni/reports/#/dashboard/reports', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(4000);
  const cfg = await page.evaluate(() => fetch('/bahmni_config/openmrs/apps/reports/reports.json').then(r => r.json()).catch(() => ({})));
  const names = Object.values(cfg).map(r => r.name).filter(Boolean);
  console.log(`reports configured: ${names.length}`);
  const d = new Date().toISOString().slice(0, 10), from = new Date(Date.now() - 30 * 86400e3).toISOString().slice(0, 10);
  let ok = 0;
  for (const n of names) {
    const url = `${BASE}/bahmnireports/report?name=${encodeURIComponent(n)}&startDate=${from}&endDate=${d}&responseType=text/html&paperSize=A4&appName=reports`;
    const t = Date.now();
    const r = await page.request.get(url, { timeout: 120000 }).catch(e => ({ status: () => 0, text: async () => e.message }));
    const body = await r.text();
    const good = r.status() === 200 && !/Internal Server Error|Exception|Could not authenticate/i.test(body);
    if (good) ok++;
    console.log(`${good ? 'PASS' : 'FAIL'} | report "${n}" | HTTP ${r.status()} ${Date.now() - t} ms${good ? '' : ' | ' + body.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').slice(0, 140)}`);
  }
  console.log(`REPORTS ${ok}/${names.length} ran successfully`);
  await b.close();

  ({ b, page } = await browser({ width: 1366, height: 768 }));
  await login(page, 'demo.doctor', 'arsenal');
  await page.goto(`${BASE}/bahmni-v2/clinical/${process.env.PATIENT}`, { waitUntil: 'domcontentloaded' });
  const btn = page.locator('button:has-text("Print latest medications")');
  await btn.waitFor({ timeout: 60000 });
  const errs = []; page.on('response', r => { if (r.status() >= 400 && !/patientImage/.test(r.url())) errs.push(`${r.status()} ${r.url().replace(BASE, '').slice(0, 90)}`); });
  for (let i = 1; i <= 3; i++) {
    const t = Date.now();
    const got = await Promise.race([
      page.waitForEvent('download', { timeout: 60000 }).then(dl => `download ${dl.suggestedFilename()}`),
      page.waitForEvent('popup', { timeout: 60000 }).then(p => `popup ${p.url().slice(0, 60)}`),
      page.waitForResponse(r => /template-service|print|pdf/i.test(r.url()), { timeout: 60000 }).then(r => `response ${r.status()} ${r.url().replace(BASE, '').slice(0, 70)}`),
      btn.click().then(() => new Promise(() => {})),
    ]).catch(e => 'nothing: ' + e.message.split('\n')[0]);
    const toast = await page.locator('text=/server encountered an error/i').count();
    console.log(`print attempt ${i}: ${got} (${Date.now() - t} ms)${toast ? ' + ERROR TOAST' : ''}`);
    await page.waitForTimeout(3000);
  }
  console.log('HTTP errors seen:', JSON.stringify(errs.slice(0, 8)));
  await b.close();
})();
