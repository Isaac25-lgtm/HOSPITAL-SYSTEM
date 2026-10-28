// Acceptance: demo administrator - safe admin functions work, owner/infrastructure functions are blocked.
const { browser, login, shot, BASE } = require('./lib');
const R = [];
const ok = (step, pass, note = '') => { R.push({ step, pass, note }); console.log(`${pass ? 'PASS' : 'FAIL'} | ${step}${note ? ' | ' + note : ''}`); };

(async () => {
  const { b, page, errors } = await browser({ width: 1366, height: 900 });
  try {
    await login(page, 'demo.admin', 'fulham');
    await page.waitForTimeout(2000);
    const tiles = await page.$$eval('a', as => as.filter(a => a.offsetParent && !a.closest('#vipers-root')).map(a => a.innerText.trim()).filter(Boolean));
    ok('Demo admin home shows admin modules (no AtomFeed console)', tiles.includes('Admin') && tiles.includes('Form Builder') && tiles.includes('Billing') && !tiles.includes('AtomFeed Console'), tiles.join(', '));
    await shot(page, 'wf-adm-1-home');

    await page.goto(BASE + '/bahmni/admin/#/auditLog', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(4000);
    const audit = await page.innerText('body');
    ok('Admin > Audit Log opens and lists events', /User|Event|Date|Patient/i.test(audit), audit.match(/(VIEWED|EDIT|CREATE|USER_LOGIN|LOGIN)[A-Z_]*/) ? audit.match(/(VIEWED|EDIT|CREATE|USER_LOGIN|LOGIN)[A-Z_]*/)[0] : '');
    await shot(page, 'wf-adm-2-audit');

    await page.goto(BASE + '/implementer-interface/#/form-builder', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(4000);
    ok('Form Builder lists clinical forms', /Vitals|History and Examination|Create a Form/i.test(await page.innerText('body')));
    await shot(page, 'wf-adm-3-formbuilder');

    // safe, reversible admin action: add an appointment service
    await page.goto(BASE + '/appointments/#/home/admin/service', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3500);
    if (!(await page.locator('a', { hasText: 'Antenatal Care' }).count())) {
      await page.locator('button.add-service-btn').click();
      await page.waitForSelector('#name');
      await page.fill('#name', 'Antenatal Care');
      await page.fill('#description', 'ANC clinic visits (demo)');
      await page.fill('#duration', '20');
      await page.fill('#start-time', '08:00'); await page.fill('#end-time', '17:00');
      await page.selectOption('#speciality', { label: 'General Medicine' }).catch(() => {});
      const locs = await page.$$eval('#location option', os => os.map(o => o.textContent.trim()));
      if (locs.some(l => /VIPERS/i.test(l))) await page.selectOption('#location', { label: locs.find(l => /VIPERS/i.test(l)) });
      await page.click('button:has-text("Save")');
      await page.waitForTimeout(3500);
    }
    await page.goto(BASE + '/appointments/#/home/admin/service', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3500);
    ok('Safe reversible admin action: add appointment service "Antenatal Care"', (await page.locator('a', { hasText: 'Antenatal Care' }).count()) > 0, 'service listed (can be removed with Delete)');
    await shot(page, 'wf-adm-4-service');

    // ---- restrictions ----
    const api = (method, url, body) => page.evaluate(async ([m, u, bd]) => { const r = await fetch(u, { method: m, headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: bd ? JSON.stringify(bd) : undefined }); return r.status; }, [method, url, body]);
    const sup = await page.evaluate(() => fetch('/openmrs/ws/rest/v1/user?q=superman&v=custom:(uuid)', { headers: { Accept: 'application/json' } }).then(r => r.json()).then(j => (j.results || [])[0] && j.results[0].uuid).catch(() => null));
    const pw = sup ? await api('POST', `/openmrs/ws/rest/v1/password/${sup}`, { newPassword: 'Hijack12345' }) : 0;
    ok('Demo admin cannot reset the owner (superman) password', pw === 403, `HTTP ${pw}`);
    const cu = await api('POST', '/openmrs/ws/rest/v1/user', { username: 'intruder', password: 'Intruder123', person: { names: [{ givenName: 'X', familyName: 'Y' }], gender: 'M' }, roles: [] });
    ok('Demo admin cannot create user accounts', cu === 403, `HTTP ${cu}`);
    const gp = await api('POST', '/openmrs/ws/rest/v1/systemsetting', { property: 'vipers.test', value: 'x' });
    ok('Demo admin cannot change system settings', gp === 403, `HTTP ${gp}`);
    await page.goto(BASE + '/openmrs/admin', { waitUntil: 'domcontentloaded' });
    ok('Legacy OpenMRS admin is not reachable', /bahmni-v2\/home/.test(page.url()), page.url().replace(BASE, ''));
    await page.locator('#user-global-action-button, button:has-text("Hi,")').first().click();
    await page.waitForTimeout(1000);
    const menu = await page.$$eval('[role=menuitem], [role=menu] *, .cds--overflow-menu-options *, li, button', es => es.filter(e => e.offsetParent && !e.closest('#vipers-root')).map(e => (e.innerText || '').trim()).filter(t => t && t.length < 30));
    console.log('  user menu:', JSON.stringify([...new Set(menu)].slice(0, 15)));
    await page.locator('text=/^\\s*(Logout|Log out|Sign out)\\s*$/i').first().click();
    await page.waitForTimeout(3000);
    ok('Logout returns to the login page', /login/i.test(page.url()), page.url().replace(BASE, ''));
  } catch (e) {
    ok('Unexpected error', false, e.message.split('\n')[0]);
    await shot(page, 'wf-adm-fail');
  }
  console.log('ERRORS', errors.slice(0, 6).join(' || '));
  console.log('RESULTS', JSON.stringify(R));
  await b.close();
})();
