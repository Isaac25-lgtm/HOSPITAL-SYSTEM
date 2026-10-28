// Acceptance: receptionist books an appointment and uploads a patient document.
const { browser, login, shot, BASE } = require('./lib');
const R = [];
const ok = (step, pass, note = '') => { R.push({ step, pass, note }); console.log(`${pass ? 'PASS' : 'FAIL'} | ${step}${note ? ' | ' + note : ''}`); };

(async () => {
  const P = process.env.PATIENT, LAST = process.env.LAST;
  const { b, page, errors } = await browser({ width: 1366, height: 900 });
  page.on('response', r => { if (r.request().method() !== 'GET' && /openmrs\/ws/.test(r.url()) && !/auditlog|session|\/user\//.test(r.url())) console.log('  API', r.request().method(), r.status(), r.url().replace(BASE, '').slice(0, 90)); });
  try {
    await login(page, 'demo.reception', 'liverpool');
    // ---------- appointment ----------
    if (!process.env.SKIP_APPT) {
    await page.goto(BASE + '/appointments/#/home/manage/appointments/list/new', { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#PatientSearch', { timeout: 30000 });
    await page.fill('#PatientSearch', LAST);
    await page.locator('[role=option]', { hasText: LAST }).first().click({ timeout: 20000 });
    const combos = page.locator('label:has-text("Service") ~ * input#combo-box, input#combo-box');
    // Service is the 2nd combo (Speciality, Service, Provider, Location, Reason)
    const service = page.locator('input#combo-box').nth(1);
    await service.click(); await service.fill('General Medicine OPD');
    await page.locator('[role=option]', { hasText: 'General Medicine OPD Consultation' }).first().click();
    const d = new Date(Date.now() + 2 * 86400e3);
    const mmddyyyy = `${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}/${d.getFullYear()}`;
    const date = page.locator('input[id="Appointment Date"]');
    await date.click(); await page.keyboard.type(mmddyyyy, { delay: 30 }); await page.keyboard.press('Escape');
    const times = page.locator('input#time-selector');
    await times.nth(0).fill('10:00'); await times.nth(1).fill('10:30');
    const ampm = page.locator('select[id^="time-picker-select"]');
    await ampm.nth(0).selectOption('AM'); await ampm.nth(1).selectOption('AM');
    await page.locator('label:has-text("Scheduled")').first().click();
    await page.fill('textarea', 'Follow-up review after malaria treatment (demo).');
    await shot(page, 'wf-appt-1-form');
    await page.click('button:has-text("Check and Save")');
    // a confirmation dialog may appear (e.g. outside service hours / overlap)
    await page.waitForTimeout(2500);
    const confirm = page.locator('button:has-text("Save"), button:has-text("Yes"), button:has-text("Confirm")').last();
    if (await confirm.isVisible().catch(() => false)) { console.log('  confirm dialog:', (await page.locator('[role=dialog], .modal').first().innerText().catch(() => '')).replace(/\s+/g, ' ').slice(0, 160)); await confirm.click(); }
    await page.waitForTimeout(3000);
    await shot(page, 'wf-appt-2-saved');
    const fhirAppts = () => page.evaluate(p => fetch(`/openmrs/ws/fhir2/R4/Appointment?patient=${p}`, { headers: { Accept: 'application/fhir+json' } }).then(r => r.json()).then(j => (j.entry || []).map(e => ({ id: e.resource.id, status: e.resource.status, start: e.resource.start, svc: JSON.stringify(e.resource.serviceType || e.resource.appointmentType || '') }))).catch(() => []), P);
    let list = await fhirAppts();
    const a = list.find(x => /General Medicine OPD/i.test(x.svc)) || list[0];
    ok('Create appointment (General Medicine OPD, in 2 days 10:00)', !!a, a ? `${a.status}; ${new Date(a.start).toLocaleString('en-GB', { timeZone: 'Africa/Kampala' })}` : 'not found via FHIR');
    if (a) {
      // update through the UI: open that day's list, select the appointment, Check-in
      const yyyy_mm_dd = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      await page.goto(`${BASE}/appointments/#/home/manage/appointments/list?viewDate=${yyyy_mm_dd}`, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(4000);
      const dateBox = page.locator('input[type=date]').first();
      if ((await dateBox.inputValue()) !== yyyy_mm_dd) { await dateBox.fill(yyyy_mm_dd); await dateBox.press('Enter'); await page.waitForTimeout(3000); }
      await page.locator(`text=${LAST}`).first().click();
      await page.waitForTimeout(800);
      await page.locator('button:has-text("Check-in")').first().click();
      await page.waitForTimeout(1200);
      const yes = page.locator('button:has-text("Yes"), button:has-text("Confirm"), button:has-text("Check-in")').last();
      if (await yes.isVisible().catch(() => false)) await yes.click();
      await page.waitForTimeout(3000);
      await shot(page, 'wf-appt-3-checkin');
      list = await fhirAppts();
      const a2 = list.find(x => x.id === a.id);
      ok('Update appointment in UI persists (Check-in)', a2 && a2.status !== a.status, `${a.status} -> ${a2 && a2.status}`);
    }
    }
    // ---------- patient document ----------
    const img = await page.context().newPage();
    await img.setContent('<div style="font:20px Arial;padding:30px;width:560px;border:2px solid #0f766e"><b>DEMO REFERRAL LETTER</b><br><br>Fictional document for the VIPERS HOSPITAL demonstration.<br>No real patient information.</div>');
    await img.locator('div').screenshot({ path: '/t/out/demo-referral.png' }); await img.close();
    await page.goto(`${BASE}/bahmni-v2/patient-documents/${P}?encounterType=Patient%20Document&topLevelConcept=Patient%20Document&defaultOption=Patient%20file`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('button:has-text("Upload")', { timeout: 30000 });
    await page.click('button:has-text("Upload")');
    await page.waitForTimeout(1500);
    await shot(page, 'wf-doc-up-1');
    const fileInput = page.locator('input[type=file]').first();
    await fileInput.setInputFiles('/t/out/demo-referral.png');
    await page.waitForTimeout(2500);
    await shot(page, 'wf-doc-up-2');
    const save = page.getByRole('button', { name: 'Save', exact: true }).first();
    await save.click();
    await page.waitForTimeout(4000);
    await shot(page, 'wf-doc-up-3');
    const docs = await page.evaluate(p => fetch(`/openmrs/ws/rest/v1/encounter?patient=${p}&encounterType=Patient%20Document&v=custom:(uuid,obs:(display))`, { headers: { Accept: 'application/json' } }).then(r => r.json()).then(j => j.results.map(e => e.obs.map(o => o.display).join(';'))), P);
    ok('Upload patient document (fictional referral letter)', docs.length > 0, JSON.stringify(docs).slice(0, 140));
  } catch (e) {
    ok('Unexpected error', false, e.message.split('\n')[0]);
    await shot(page, 'wf-appt-fail');
  }
  console.log('ERRORS', errors.slice(0, 6).join(' || '));
  console.log('RESULTS', JSON.stringify(R));
  await b.close();
})();
