// Exploration pass 5: doctor flow in the Clinical app for the patient registered in pass 4.
const { browser, login, shot, BASE } = require('./lib');
const dump = page => page.evaluate(() => {
  const vis = e => e.offsetParent !== null && !e.closest('#vipers-root');
  const t = s => (s || '').trim().replace(/\s+/g, ' ').slice(0, 60);
  return [...document.querySelectorAll('input, select, textarea, button, a, [role=tab], h1, h2, h3, h4, .tab-item, li.tab')].filter(vis)
    .map(e => `${e.tagName.toLowerCase()}${e.id ? '#' + e.id : ''}${e.className && typeof e.className === 'string' ? '.' + e.className.split(' ').slice(0, 2).join('.') : ''} "${t(e.innerText || e.placeholder || e.getAttribute('aria-label') || e.value)}"${e.getAttribute('href') ? ' ->' + e.getAttribute('href').slice(0, 60) : ''}`).slice(0, 90);
});
(async () => {
  const { b, page, errors } = await browser({ width: 1366, height: 900 });
  await login(page, 'demo.doctor', 'arsenal');
  await page.goto(BASE + '/bahmni/clinical/index.html#/default/patient/search', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(4000);
  await shot(page, 'c-search');
  console.log('SEARCH PAGE\n' + (await dump(page)).join('\n'));
  // Active-visit patients are usually listed; otherwise search by name
  const inp = page.locator('input#patientIdentifier, input[type=search], input[placeholder*="Search" i]').first();
  if (await inp.count()) { await inp.fill('Explore'); await inp.press('Enter'); await page.waitForTimeout(3500); }
  await shot(page, 'c-search-results');
  console.log('RESULTS\n' + (await dump(page)).join('\n'));
  const hit = page.locator('text=/Explore Test/i').first();
  if (await hit.count()) { await hit.click(); await page.waitForTimeout(6000); }
  console.log('DASHBOARD URL', page.url());
  await shot(page, 'c-dashboard');
  console.log('DASHBOARD\n' + (await dump(page)).join('\n'));
  console.log('ERRORS', errors.slice(0, 6).join(' || '));
  await b.close();
})();
