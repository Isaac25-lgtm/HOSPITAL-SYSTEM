// What does "Print latest medications" request, and do those requests succeed?
const { browser, login, BASE } = require('./lib');
(async () => {
  const { b, page, errors } = await browser({ width: 1366, height: 768 });
  await login(page, 'demo.doctor', 'arsenal');
  await page.goto(`${BASE}/bahmni-v2/clinical/${process.env.PATIENT}`, { waitUntil: 'domcontentloaded' });
  const btn = page.locator('button:has-text("Print latest medications")'); await btn.waitFor({ timeout: 60000 });
  await page.waitForLoadState('networkidle').catch(() => {});
  await page.evaluate(() => { window.__printed = 0; window.print = () => { window.__printed++; }; document.querySelectorAll('iframe').forEach(f => { try { f.contentWindow.print = () => { window.__printed++; }; } catch (e) {} }); });
  const reqs = [];
  page.on('response', r => reqs.push(`${r.status()} ${r.request().method()} ${r.url().replace(BASE, '').slice(0, 100)}`));
  page.on('frameattached', f => reqs.push('iframe attached'));
  await btn.click();
  await page.waitForTimeout(12000);
  const printed = await page.evaluate(() => window.__printed);
  const frames = page.frames().map(f => f.url().slice(0, 80));
  console.log('REQUESTS after click:\n  ' + reqs.join('\n  '));
  console.log('print() called:', printed, '| frames:', JSON.stringify(frames));
  console.log('error toast:', await page.locator('text=/server encountered an error/i').count(), '| page errors:', errors.slice(0, 3).join(' || '));
  await b.close();
})();
