// Exploration pass 4: register a patient through the v2 UI, then start an OPD visit.
const { browser, login, shot, BASE } = require('./lib');
const dump = page => page.evaluate(() => {
  const vis = e => e.offsetParent !== null && !e.closest('#vipers-root');
  const t = s => (s || '').trim().replace(/\s+/g, ' ').slice(0, 70);
  return [...document.querySelectorAll('input, select, textarea, button, [role=tab], [role=combobox], h1, h2, h3, h4')].filter(vis)
    .map(e => `${e.tagName.toLowerCase()}${e.id ? '#' + e.id : ''}${e.name ? '[name=' + e.name + ']' : ''} "${t(e.innerText || e.placeholder || e.getAttribute('aria-label') || e.value)}"`).slice(0, 70);
});
(async () => {
  const { b, page, errors } = await browser({ width: 1366, height: 900 });
  page.on('response', async r => { if (r.request().method() !== 'GET' && /openmrs\/ws/.test(r.url())) console.log('API', r.request().method(), r.status(), r.url().replace(BASE, '').slice(0, 110)); });
  await login(page, 'demo.reception', 'liverpool');
  await page.goto(BASE + '/bahmni-v2/registration/patient/new', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#first-name');
  const stamp = Date.now().toString().slice(-5);
  await page.fill('#first-name', 'Explore');
  await page.fill('#last-name', 'Test' + stamp.replace(/\d/g, d => 'abcdefghij'[d]));
  await page.click('label:has-text("Gender") ~ div button, #downshift-_r_v_-toggle-button').catch(() => {});
  await page.waitForTimeout(500);
  const opts = await page.$$eval('[role=option]', os => os.map(o => o.innerText.trim()));
  console.log('GENDER OPTIONS', opts);
  await page.click('[role=option]:has-text("Female")').catch(e => console.log('gender click', e.message));
  await page.fill('#age-years', '34');
  await page.waitForTimeout(500);
  console.log('DOB after age', await page.inputValue('#date-of-birth'));
  await page.click('button:has-text("Address information")'); await page.waitForTimeout(800);
  await page.fill('#cityVillage', 'Kampala');
  await page.click('button:has-text("Contact information")'); await page.waitForTimeout(800);
  await page.fill('input[placeholder="Phone Number"]', '0700000' + stamp.slice(-3));
  await page.click('button:has-text("Additional information")'); await page.waitForTimeout(800);
  await shot(page, 'r-sections');
  console.log('SECTIONS\n' + (await dump(page)).join('\n'));
  page.on('console', m => { if (/error|warn/i.test(m.type())) console.log('CONSOLE', m.type(), m.text().slice(0, 200)); });
  page.on('request', r => { if (/openmrs/.test(r.url())) console.log('REQ', r.method(), r.url().replace(BASE, '').slice(0, 100)); });
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await page.waitForTimeout(5000);
  console.log('AFTER SAVE URL', page.url());
  console.log('INVALID', JSON.stringify(await page.$$eval('[data-invalid], .cds--form-requirement, [aria-invalid=true]', es => es.map(e => (e.id || '') + ':' + (e.innerText || e.getAttribute('aria-describedby') || '').slice(0, 80)))));
  console.log('TOASTS', JSON.stringify(await page.$$eval('.cds--toast-notification, .cds--inline-notification, [role=alert], [role=status]', es => es.map(e => e.innerText.slice(0, 120)))));
  await page.screenshot({ path: '/t/out/r-saved.png', fullPage: true });
  console.log('AFTER SAVE\n' + (await dump(page)).join('\n'));
  const sv = page.locator('button:has-text("Start OPD visit")');
  if (await sv.count()) { await sv.first().click(); await page.waitForTimeout(5000); console.log('AFTER VISIT URL', page.url()); await shot(page, 'r-visit'); console.log((await dump(page)).join('\n')); }
  console.log('ERRORS', errors.slice(0, 5).join(' || '));
  await b.close();
})();
