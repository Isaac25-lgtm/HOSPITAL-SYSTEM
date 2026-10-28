// Acceptance: lab technician enters a result for the doctor's order; doctor then sees it.
const { browser, login, shot, BASE } = require('./lib');
const R = [];
const ok = (step, pass, note = '') => { R.push({ step, pass, note }); console.log(`${pass ? 'PASS' : 'FAIL'} | ${step}${note ? ' | ' + note : ''}`); };

(async () => {
  const P = process.env.PATIENT;
  let { b, page, errors } = await browser({ width: 1366, height: 900 });
  page.on('response', r => { if (r.request().method() !== 'GET' && /openmrs\/ws/.test(r.url()) && !/auditlog|session|\/user\//.test(r.url())) console.log('  API', r.request().method(), r.status(), r.url().replace(BASE, '').slice(0, 90)); });
  try {
    await login(page, 'demo.lab', 'chelsea');
    await page.goto(BASE + '/lab', { waitUntil: 'domcontentloaded' });
    const tq = Date.now();
    await page.waitForSelector('text=Active Patient List');
    ok('Lab work queue (Active Patient List) loads', true, `${Date.now() - tq} ms`);
    await shot(page, 'wf-lab-1-queue');
    await page.goto(`${BASE}/lab/patient/${P}`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('text=Pending Lab Orders');
    const pending = page.locator('tr', { hasText: 'Rapid test for malaria' });
    await pending.first().waitFor({ timeout: 20000 });
    ok('Doctor\'s order appears in lab pending orders', true, 'Rapid test for malaria / Demo Doctor');
    await pending.locator('label').first().click();
    await page.click('button:has-text("Enter Test Results")');
    await page.locator('button[id$="-toggle-button"]', { hasText: 'Select an answer' }).click();
    const opts = await page.$$eval('[role=option]', os => os.map(o => o.innerText.trim()));
    console.log('  answers:', JSON.stringify(opts));
    await page.locator('[role=option]', { hasText: 'Positive for Plasmodium falciparum' }).first().click();
    await page.locator('label:has-text("Abnormal")').first().click();
    const rd = page.locator('#reportDate');
    if (!(await rd.inputValue())) {
      const d = new Date(); const mm = String(d.getMonth() + 1).padStart(2, '0'), dd = String(d.getDate()).padStart(2, '0');
      // calendar-only input (flatpickr): open the calendar and pick today, as a user would
      await rd.click({ force: true });
      const today = page.locator('.flatpickr-calendar.open .flatpickr-day.today, .flatpickr-day.today').first();
      await today.waitFor({ timeout: 10000 });
      await today.click();
      await page.waitForTimeout(500);
      console.log('  report date now:', await rd.inputValue(), `(expected ${mm}/${dd}/${d.getFullYear()})`);
    }
    await shot(page, 'wf-lab-2-entry');
    const ts = Date.now();
    await page.click('button:has-text("Save and Upload")');
    // typed results: success toast + order leaves the pending list (the Reports table lists uploaded files only)
    const toastOk = await page.locator('text=/Report successfully uploaded/i').first().waitFor({ timeout: 30000 }).then(() => true).catch(() => false);
    await page.waitForTimeout(2000);
    const stillPending = await page.locator('tr', { hasText: 'Rapid test for malaria' }).count();
    ok('Enter and save lab result (RDT malaria = Positive for P. falciparum, abnormal)', toastOk && stillPending === 0, `${Date.now() - ts} ms; toast=${toastOk}; pending rows left=${stillPending}`);
    await shot(page, 'wf-lab-3-saved');
    await b.close();

    // doctor sees the result
    ({ b, page, errors } = await browser({ width: 1366, height: 900 }));
    await login(page, 'demo.doctor', 'arsenal');
    await page.goto(`${BASE}/bahmni-v2/clinical/${P}`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('text=Lab Investigations', { timeout: 60000 });
    await page.locator('a:has-text("Lab Investigations")').first().click().catch(() => {});
    await page.waitForTimeout(5000);
    const txt = await page.innerText('body');
    const seen = /RDT malaria|Rapid test for malaria/i.test(txt) && /Positive/i.test(txt);
    const api = await page.evaluate(p => fetch(`/openmrs/ws/fhir2/R4/DiagnosticReport?patient=${p}`, { headers: { Accept: 'application/fhir+json' } }).then(r => r.json()).then(j => (j.entry || []).map(e => (e.resource.code && e.resource.code.text) + ':' + e.resource.status)).catch(() => []), P);
    console.log('  DiagnosticReport:', JSON.stringify(api));
    ok('Doctor can view the lab result on the patient dashboard', seen, seen ? 'Positive shown under Lab Investigations' : 'result text not found on dashboard');
    await page.screenshot({ path: '/t/out/wf-lab-4-doctor-view.png', fullPage: true });
  } catch (e) {
    ok('Unexpected error', false, e.message.split('\n')[0]);
    await shot(page, 'wf-lab-fail');
  }
  console.log('ERRORS', errors.slice(0, 6).join(' || '));
  console.log('RESULTS', JSON.stringify(R));
  await b.close();
})();
