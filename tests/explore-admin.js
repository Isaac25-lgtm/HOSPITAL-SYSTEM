// Exploration: demo.admin modules.
const { browser, login, shot, BASE } = require('./lib');
const dump = page => page.evaluate(() => {
  const vis = e => e.offsetParent !== null && !e.closest('#vipers-root');
  const t = s => (s || '').trim().replace(/\s+/g, ' ').slice(0, 60);
  return [...document.querySelectorAll('button, a, h1, h2, h3, h4, label, .app-name, li')].filter(vis)
    .map(e => `${e.tagName.toLowerCase()} "${t(e.innerText || e.getAttribute('aria-label') || e.title)}"${e.getAttribute('href') ? ' ->' + e.getAttribute('href').slice(0, 60) : ''}`).filter(s => !/""$/.test(s)).slice(0, 60);
});
(async () => {
  const { b, page, errors } = await browser({ width: 1366, height: 900 });
  await login(page, 'demo.admin', 'fulham');
  for (const [u, n] of [['/bahmni/admin/#/dashboard', 'adm-dashboard'], ['/implementer-interface/#/', 'adm-ii'], ['/bahmni/reports/#/dashboard/reports', 'adm-reports'], ['/appointments/#/home/admin/services', 'adm-appt-services'], ['/openmrs/admin', 'adm-openmrs-legacy'], ['/atomfeed-console', 'adm-atomfeed']]) {
    const resp = await page.goto(BASE + u, { waitUntil: 'domcontentloaded' }).catch(e => null);
    await page.waitForTimeout(4000);
    await shot(page, n);
    console.log(`=== ${u} -> ${page.url()} (HTTP ${resp && resp.status()})\n` + (await dump(page)).join('\n'));
  }
  console.log('ERRORS', errors.slice(0, 6).join(' || '));
  await b.close();
})();
