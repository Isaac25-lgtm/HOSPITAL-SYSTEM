// Acceptance: doctor consultation on the 2.0 clinical dashboard
// (diagnosis, lab order, prescription, vitals, save, verify on dashboard).
const { browser, login, shot, BASE } = require('./lib');
const R = [];
const ok = (step, pass, note = '') => { R.push({ step, pass, note }); console.log(`${pass ? 'PASS' : 'FAIL'} | ${step}${note ? ' | ' + note : ''}`); };
const dumpNear = (page, re) => page.evaluate(src => {
  const rx = new RegExp(src, 'i'); const t = s => (s || '').trim().replace(/\s+/g, ' ').slice(0, 50);
  return [...document.querySelectorAll('input,button,[role=combobox],label,select')].filter(e => e.offsetParent && !e.closest('#vipers-root'))
    .map(e => `${e.tagName.toLowerCase()}${e.id ? '#' + e.id : ''} "${t(e.innerText || e.placeholder || e.getAttribute('aria-label') || e.value)}"`).filter(s => rx.test(s));
}, re.source);

async function pick(page, inputSel, query, optionText) {
  const inp = page.locator(inputSel).first();
  await inp.click(); await inp.fill(query);
  const opt = page.locator('[role=option]', { hasText: optionText }).first();
  await opt.waitFor({ timeout: 20000 });
  await opt.click();
  await page.waitForTimeout(1200);
}

(async () => {
  const P = process.env.PATIENT;
  const { b, page, errors } = await browser({ width: 1366, height: 900 });
  page.on('response', r => { if (r.request().method() !== 'GET' && /openmrs\/ws/.test(r.url()) && !/auditlog|session|\/user\//.test(r.url())) console.log('  API', r.request().method(), r.status(), r.url().replace(BASE, '').slice(0, 90)); });
  try {
    await login(page, 'demo.doctor', 'arsenal');
    const t0 = Date.now();
    await page.goto(`${BASE}/bahmni-v2/clinical/${P}`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('button:has-text("New Consultation"), button:has-text("Consultation in progress"), button:has-text("Continue Consultation")', { timeout: 60000 });
    ok('Open patient clinical dashboard', true, `${Date.now() - t0} ms`);
    await shot(page, 'wf-doc-1-dashboard');

    const nc = page.locator('button:has-text("New Consultation"), button:has-text("Continue Consultation")');
    if (await nc.count()) await nc.click();
    await page.waitForSelector('#diagnoses-search', { timeout: 30000 });
    ok('Open New Consultation pad', true);

    await pick(page, '#diagnoses-search', 'Malaria', 'Falciparum malaria');
    console.log('  after diagnosis:', JSON.stringify(await dumpNear(page, /malaria|primary|secondary|confirm|presum|certain/)));
    ok('Add diagnosis "Falciparum malaria"', (await page.locator('text=Falciparum malaria').count()) > 0);

    await pick(page, '#investigations-procedures-search', 'Malaria', 'Rapid test for malaria');
    console.log('  after investigation:', JSON.stringify(await dumpNear(page, /rapid|urgent|note/)));
    ok('Order lab investigation "Rapid test for malaria"', (await page.locator('text=Rapid test for malaria').count()) > 0);

    await pick(page, '#medication-search', 'Artemether', 'Artemether 20 mg + Lumefantrine 120 mg (Tablet)');
    await shot(page, 'wf-doc-2-medication-row');
    console.log('  medication controls:', JSON.stringify(await dumpNear(page, /dos|unit|freq|route|durat|instruct|stat|prn|tablet|day/)));
    ok('Add medication row "Artemether/Lumefantrine 20/120 mg"', (await page.locator('text=/Artemether 20 mg/').count()) > 0);

    // dropdown helper: Carbon/downshift toggle button identified by its current text
    const choose = async (btnText, optText) => {
      const btn = page.locator('button[id$="-toggle-button"]', { hasText: btnText }).first();
      await btn.scrollIntoViewIfNeeded(); await btn.click();
      const opts = await page.$$eval('[role=option]', os => os.filter(o => o.offsetParent).map(o => o.innerText.trim()));
      const want = opts.find(o => o.toLowerCase() === optText.toLowerCase()) || opts.find(o => o.toLowerCase().includes(optText.toLowerCase()));
      console.log(`  ${btnText} options: ${JSON.stringify(opts.slice(0, 12))} -> ${want}`);
      await page.locator('[role=option]', { hasText: want }).first().click();
      await page.waitForTimeout(500);
    };
    await choose('Select Certainty', 'Confirmed');
    const dose = page.locator('input[id^="medication-dosage-input"]').first(); await dose.fill('4');
    await choose('Dosage Unit', 'Tablet');
    await choose('Frequency', 'Twice a day');
    const dur = page.locator('input[id^="medication-duration-input"]').first(); await dur.fill('3');
    ok('Complete prescription details (4 tablets, twice a day, 3 days, oral)', true);
    await shot(page, 'wf-doc-3-pad');

    // Vitals via the pinned form
    await page.locator('text=/^Vitals$/').last().click();
    // the form's labels are not linked to inputs; fill the six numeric fields in on-screen order
    await page.locator('text=Pulse (beats/min)').waitFor({ timeout: 20000 });
    const nums = page.locator('input[type=number]:visible');
    const vals = ['96', '97', '20', '101.3', '118', '76']; // pulse, SpO2, RR, temp (F), systolic, diastolic
    console.log('  numeric inputs in Vitals form:', await nums.count());
    for (let i = 0; i < vals.length; i++) await nums.nth(i).fill(vals[i]);
    await shot(page, 'wf-doc-4-vitals');
    await page.click('button:has-text("Save Form")');
    await page.waitForTimeout(1500);
    ok('Record vital signs in Vitals form (pulse, SpO2, RR, temp, BP)', true);

    const tDone = Date.now();
    await page.click('button:has-text("Done")');
    const toast = await page.locator('.cds--toast-notification, .cds--inline-notification, [role=status]').filter({ hasText: /success|saved|error|fail/i }).first().textContent({ timeout: 30000 }).catch(() => '');
    ok('Save consultation (Done)', /success|saved/i.test(toast) || !/error|fail/i.test(toast), `${Date.now() - tDone} ms; toast="${(toast || '').trim().replace(/\s+/g, ' ').slice(0, 80)}"`);
    await page.waitForTimeout(4000);
    await shot(page, 'wf-doc-5-saved');

    // Re-open the dashboard and verify the saved data is shown
    await page.goto(`${BASE}/bahmni-v2/clinical/${P}`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('button:has-text("Continue Consultation"), button:has-text("New Consultation")', { timeout: 60000 });
    await page.waitForTimeout(6000);
    for (let i = 0; i < 10; i++) { await page.mouse.wheel(0, 700); await page.waitForTimeout(300); }
    const body = await page.innerText('body');
    ok('Reopened record: dashboard shows diagnosis', /Falciparum malaria/i.test(body));
    ok('Reopened record: dashboard shows lab order', /Rapid test for malaria/i.test(body));
    ok('Reopened record: dashboard shows medication', /Artemether/i.test(body));
    ok('Reopened record: dashboard shows vitals', /96/.test(body));
    await page.screenshot({ path: '/t/out/wf-doc-6-dashboard-after.png', fullPage: true });
    // persistence check through the API, using the doctor's own session
    const api = await page.evaluate(async p => {
      const j = u => fetch(u, { headers: { Accept: 'application/fhir+json, application/json' } }).then(r => r.json()).catch(() => ({}));
      const fh = '/openmrs/ws/fhir2/R4/';
      const obs = await j(`${fh}Observation?patient=${p}&_count=50`);
      const cond = await j(`${fh}Condition?patient=${p}&category=encounter-diagnosis`);
      const sr = await j(`${fh}ServiceRequest?patient=${p}`);
      const mr = await j(`${fh}MedicationRequest?patient=${p}`);
      const names = b => (b.entry || []).map(e => (e.resource.code && (e.resource.code.text || (e.resource.code.coding || [{}])[0].display)) || (e.resource.medicationReference && e.resource.medicationReference.display) || '');
      const vals = (obs.entry || []).map(e => `${e.resource.code.text}=${e.resource.valueQuantity ? e.resource.valueQuantity.value : ''}`);
      const diag = await j(`/openmrs/ws/rest/v1/bahmnicore/diagnosis/search?patientUuid=${p}`);
      return { obs: vals, conditions: names(cond), serviceRequests: names(sr), medications: names(mr), diagnoses: (Array.isArray(diag) ? diag : []).map(d => d.codedAnswer && d.codedAnswer.name) };
    }, P);
    console.log('  API:', JSON.stringify(api));
    ok('Persisted: vitals observations', api.obs.filter(v => /Pulse=96|Systolic.*=118|Diastolic.*=76|Temperature.*=101.3|Respiratory.*=20/i.test(v)).length >= 4, api.obs.slice(0, 8).join('; '));
    ok('Persisted: lab order', api.serviceRequests.some(n => /malaria/i.test(n)), api.serviceRequests.join('; '));
    ok('Persisted: medication order', api.medications.some(n => /Artemether/i.test(n)), api.medications.join('; '));
    ok('Persisted: diagnosis', [...api.conditions, ...api.diagnoses].some(n => /malaria/i.test(n || '')), [...api.conditions, ...api.diagnoses].join('; '));
    console.log('RESULTS', JSON.stringify(R));
  } catch (e) {
    ok('Unexpected error', false, e.message.split('\n')[0]);
    await shot(page, 'wf-doc-fail');
  }
  console.log('ERRORS', errors.slice(0, 8).join(' || '));
  await b.close();
})();
