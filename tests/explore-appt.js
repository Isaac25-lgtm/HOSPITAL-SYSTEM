// Exploration: Appointments + Patient Documents as receptionist.
const { browser, login, shot, BASE } = require('./lib');
const dump = page => page.evaluate(() => {
  const vis = e => e.offsetParent !== null && !e.closest('#vipers-root');
  const t = s => (s || '').trim().replace(/\s+/g, ' ').slice(0, 60);
  return [...document.querySelectorAll('input, select, textarea, button, a, h1, h2, h3, label')].filter(vis)
    .map(e => `${e.tagName.toLowerCase()}${e.id ? '#' + e.id : ''}${e.name ? '[' + e.name + ']' : ''} "${t(e.innerText || e.placeholder || e.getAttribute('aria-label') || e.value)}"${e.getAttribute('href') ? ' ->' + e.getAttribute('href').slice(0, 50) : ''}`).slice(0, 80);
});
(async () => {
  const { b, page, errors } = await browser({ width: 1366, height: 900 });
  await login(page, 'demo.reception', 'liverpool');
  await page.goto(BASE + '/appointments/#/home/manage/summary', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(5000);
  await shot(page, 'a-summary');
  console.log('APPT SUMMARY\n' + (await dump(page)).join('\n'));
  const add = page.locator('text=/Add new appointment|New Appointment|Add Appointment/i').first();
  if (await add.count()) { await add.click(); await page.waitForTimeout(3500); await shot(page, 'a-new'); console.log('NEW APPT URL', page.url(), '\n' + (await dump(page)).join('\n')); }
  await page.goto(BASE + '/bahmni/document-upload/?encounterType=Patient%20Document&topLevelConcept=Patient%20Document&defaultOption=Patient%20file', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(4500);
  await shot(page, 'd-home');
  console.log('DOCS URL', page.url(), '\n' + (await dump(page)).join('\n'));
  console.log('ERRORS', errors.slice(0, 6).join(' || '));
  await b.close();
})();
