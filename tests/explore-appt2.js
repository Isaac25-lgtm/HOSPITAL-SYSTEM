// Exploration: Appointments List -> add appointment form; Documents -> patient page.
const { browser, login, shot, BASE } = require('./lib');
const dump = page => page.evaluate(() => {
  const vis = e => e.offsetParent !== null && !e.closest('#vipers-root');
  const t = s => (s || '').trim().replace(/\s+/g, ' ').slice(0, 60);
  return [...document.querySelectorAll('input, select, textarea, button, a, h1, h2, h3, label')].filter(vis)
    .map(e => `${e.tagName.toLowerCase()}${e.id ? '#' + e.id : ''}${e.name ? '[' + e.name + ']' : ''}${e.type ? '(' + e.type + ')' : ''} "${t(e.innerText || e.placeholder || e.getAttribute('aria-label') || e.value)}"`).slice(0, 90);
});
(async () => {
  const { b, page, errors } = await browser({ width: 1366, height: 900 });
  await login(page, 'demo.reception', 'liverpool');
  await page.goto(BASE + '/appointments/#/home/manage/appointments/list', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(5000);
  await shot(page, 'a-list');
  console.log('LIST\n' + (await dump(page)).join('\n'));
  const add = page.locator('button:has-text("Add"), a:has-text("Add")').first();
  if (await add.count()) { console.log('clicking', await add.innerText()); await add.click(); await page.waitForTimeout(3500); await shot(page, 'a-new'); console.log('NEW URL', page.url(), '\n' + (await dump(page)).join('\n')); }
  // documents for patient
  await page.goto(BASE + '/bahmni/document-upload/?encounterType=Patient%20Document&topLevelConcept=Patient%20Document&defaultOption=Patient%20file#/search', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3500);
  await page.locator('text=/Wftestejheh/').first().click().catch(e => console.log('doc patient click', e.message));
  await page.waitForTimeout(4500);
  await shot(page, 'd-patient');
  console.log('DOC PATIENT URL', page.url(), '\n' + (await dump(page)).join('\n'));
  console.log('ERRORS', errors.slice(0, 6).join(' || '));
  await b.close();
})();
