// Exploration pass 6: New Consultation on the 2.0 clinical dashboard.
const { browser, login, shot, BASE } = require('./lib');
const dump = page => page.evaluate(() => {
  const vis = e => e.offsetParent !== null && !e.closest('#vipers-root');
  const t = s => (s || '').trim().replace(/\s+/g, ' ').slice(0, 60);
  return [...document.querySelectorAll('input, select, textarea, button, [role=tab], [role=combobox], h1, h2, h3, h4, h5, legend, label')].filter(vis)
    .map(e => `${e.tagName.toLowerCase()}${e.id ? '#' + e.id : ''} "${t(e.innerText || e.placeholder || e.getAttribute('aria-label') || e.value)}"`).slice(0, 120);
});
(async () => {
  const P = process.env.PATIENT || '37ecfa82-1755-44c3-9c50-60638f39a53c';
  const { b, page, errors } = await browser({ width: 1366, height: 900 });
  page.on('request', r => { if (r.method() !== 'GET' && /openmrs/.test(r.url())) console.log('REQ', r.method(), r.url().replace(BASE, '').slice(0, 100)); });
  await login(page, 'demo.doctor', 'arsenal');
  await page.goto(`${BASE}/bahmni-v2/clinical/${P}`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('button:has-text("New Consultation")', { timeout: 60000 });
  await page.waitForTimeout(2000);
  await shot(page, 'c-dashboard');
  await page.click('button:has-text("New Consultation")');
  await page.waitForTimeout(4000);
  await shot(page, 'c-consult');
  console.log('URL', page.url());
  console.log('CONSULT\n' + (await dump(page)).join('\n'));
  console.log('ERRORS', errors.slice(0, 6).join(' || '));
  await b.close();
})();
