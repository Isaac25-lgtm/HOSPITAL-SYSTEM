// Acceptance: receptionist - register, search, open, update, start OPD visit. Prints PATIENT_UUID=... for later tests.
const { browser, login, shot, BASE } = require('./lib');
const R = [];
const ok = (step, pass, note = '') => { R.push({ step, pass, note }); console.log(`${pass ? 'PASS' : 'FAIL'} | ${step}${note ? ' | ' + note : ''}`); };
const letters = n => [...String(n)].map(d => 'abcdefghij'[d]).join('');

(async () => {
  const first = process.env.FIRST || 'Agnes';
  const last = process.env.LAST || ('Wftest' + letters(Date.now() % 100000));
  const { b, page, errors } = await browser({ width: 1366, height: 900 });
  let uuid = '';
  try {
    const ms = await login(page, 'demo.reception', 'liverpool');
    ok('Receptionist login', /bahmni-v2\/home/.test(page.url()), `${ms} ms`);

    await page.goto(BASE + '/bahmni-v2/registration/search', { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('button:has-text("Create New Patient")');
    await shot(page, 'wf-rec-1-search');
    await page.click('button:has-text("Create New Patient")');
    await page.waitForSelector('#first-name');
    await page.fill('#first-name', first);
    await page.fill('#last-name', last);
    await page.locator('button[id$="-toggle-button"]', { hasText: 'Select' }).first().click();
    await page.locator('[role=option]', { hasText: 'Female' }).first().click();
    await page.fill('#age-years', '28');
    await page.click('button:has-text("Address information")');
    await page.fill('#address1', 'Plot 12 (fictional)');
    await page.fill('#cityVillage', 'Kampala');
    await page.click('button:has-text("Contact information")');
    await page.fill('input[placeholder="Phone Number"]', '0700000' + String(Date.now()).slice(-3));
    await shot(page, 'wf-rec-2-form');
    const t0 = Date.now();
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await page.waitForURL(/registration\/patient\/[0-9a-f-]{36}/, { timeout: 30000 });
    uuid = page.url().match(/patient\/([0-9a-f-]{36})/)[1];
    const id = (await page.innerText('body')).match(/ABC\d+/);
    ok('Register new patient', true, `${Date.now() - t0} ms; ${first} ${last}; ${id ? id[0] : ''}`);
    await shot(page, 'wf-rec-3-saved');

    // search
    await page.goto(BASE + '/bahmni-v2/registration/search', { waitUntil: 'domcontentloaded' });
    const box = page.locator('input[placeholder="Search by Name or Patient ID"]');
    await box.fill(last);
    const ts = Date.now();
    await box.press('Enter');
    await page.locator(`text=${last}`).first().waitFor({ timeout: 20000 });
    ok('Search patient by name', true, `${Date.now() - ts} ms`);
    await shot(page, 'wf-rec-4-results');

    // open + update
    // the Patient ID cell is the link to the record
    await page.locator('tr', { hasText: last }).locator('a').first().click();
    await page.waitForURL(/registration\/patient\//, { timeout: 20000 });
    await page.waitForSelector('#middle-name');
    ok('Open patient record from search results', page.url().includes(uuid));
    await page.fill('#middle-name', 'Demo');
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    const upd = await page.locator('text=/updated successfully|saved successfully/i').first().textContent({ timeout: 20000 }).catch(() => '');
    ok('Update patient details (middle name)', /successfully/i.test(upd), upd.trim());

    // start visit
    const sv = page.locator('button:has-text("Start OPD visit")');
    await sv.first().click();
    await page.locator('button:has-text("Patient Dashboard")').waitFor({ timeout: 30000 });
    ok('Start OPD visit', true);
    await shot(page, 'wf-rec-5-visit');
  } catch (e) {
    ok('Unexpected error', false, e.message.split('\n')[0]);
    await shot(page, 'wf-rec-fail');
  }
  console.log('ERRORS', errors.slice(0, 6).join(' || '));
  console.log('RESULTS', JSON.stringify(R));
  if (uuid) console.log(`PATIENT_UUID=${uuid}`);
  await b.close();
})();
