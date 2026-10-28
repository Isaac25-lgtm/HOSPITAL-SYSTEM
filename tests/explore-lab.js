// Exploration: Lab Entry (bahmni-lab) as demo.lab.
const { browser, login, shot, BASE } = require('./lib');
const dump = page => page.evaluate(() => {
  const vis = e => e.offsetParent !== null && !e.closest('#vipers-root');
  const t = s => (s || '').trim().replace(/\s+/g, ' ').slice(0, 60);
  return [...document.querySelectorAll('input, select, textarea, button, a, [role=tab], h1, h2, h3, h4, label, td, th')].filter(vis)
    .map(e => `${e.tagName.toLowerCase()}${e.id ? '#' + e.id : ''} "${t(e.innerText || e.placeholder || e.getAttribute('aria-label') || e.value)}"`).slice(0, 80);
});
(async () => {
  const { b, page, errors } = await browser({ width: 1366, height: 900 });
  page.on('response', r => { if (r.request().method() !== 'GET' && /openmrs\/ws/.test(r.url()) && !/auditlog/.test(r.url())) console.log('API', r.request().method(), r.status(), r.url().replace(BASE, '').slice(0, 100)); });
  await login(page, 'demo.lab', 'chelsea');
  await page.goto(BASE + '/lab', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(4000);
  await shot(page, 'l-home');
  console.log('LAB HOME\n' + (await dump(page)).join('\n'));
  await page.click('text=Search Patient').catch(e => console.log('no search btn', e.message));
  await page.waitForTimeout(2500);
  await shot(page, 'l-search');
  console.log('LAB SEARCH\n' + (await dump(page)).join('\n'));
  const inp = page.locator('input:visible').first();
  await inp.fill(process.env.LAST || 'Wftest'); await page.waitForTimeout(3500);
  await shot(page, 'l-search-results');
  console.log('RESULTS\n' + (await dump(page)).join('\n'));
  console.log('ERRORS', errors.slice(0, 6).join(' || '));
  await b.close();
})();
