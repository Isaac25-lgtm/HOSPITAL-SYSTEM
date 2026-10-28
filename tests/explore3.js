// Exploration pass 3: registration form (v2) and existing data.
const { browser, login, shot, BASE } = require('./lib');
const dump = page => page.evaluate(() => {
  const vis = e => e.offsetParent !== null && !e.closest('#vipers-root');
  const t = s => (s || '').trim().replace(/\s+/g, ' ').slice(0, 70);
  return [...document.querySelectorAll('input, select, textarea, button, [role=combobox], label')].filter(vis)
    .map(e => `${e.tagName.toLowerCase()}${e.id ? '#' + e.id : ''}${e.name ? '[name=' + e.name + ']' : ''}${e.type ? '(' + e.type + ')' : ''} "${t(e.innerText || e.placeholder || e.getAttribute('aria-label') || e.value)}"`);
});
(async () => {
  const { b, page, errors } = await browser({ width: 1366, height: 900 });
  await login(page, 'demo.reception', 'liverpool');
  const pc = await page.evaluate(() => fetch('/openmrs/ws/rest/v1/patient?q=a&limit=5&v=custom:(display)', { headers: { Accept: 'application/json' } }).then(r => r.json()));
  console.log('PATIENTS(q=a)', JSON.stringify(pc).slice(0, 400));
  await page.goto(BASE + '/bahmni-v2/registration/search', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3000);
  await page.click('button:has-text("Create New Patient")');
  await page.waitForTimeout(4000);
  console.log('NEW PATIENT URL', page.url());
  await shot(page, 'r-new-1');
  console.log((await dump(page)).join('\n'));
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.waitForTimeout(800);
  await shot(page, 'r-new-2');
  console.log('ERRORS', errors.slice(0, 5).join(' || '));
  await b.close();
})();
