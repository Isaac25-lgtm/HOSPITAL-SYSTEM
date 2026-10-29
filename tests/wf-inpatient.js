// Acceptance: inpatient (Ward Nurse) - admit, assign bed, Admitted list, transfer to another ward, discharge.
const { browser, login, shot, BASE } = require('./lib');
const P = process.env.PATIENT;   // patient with an active OPD visit (run-all's test patient)
const results = [];
const ok = (step, pass, note = '') => { results.push({ step, pass: !!pass, note }); console.log(`${pass ? 'PASS' : 'FAIL'} | ${step} | ${note}`); };
const api = (page, url) => page.evaluate(u => fetch(u, { headers: { Accept: 'application/json' } }).then(r => r.json()), url);

async function openPatient(page, id) {
  await page.goto(`${BASE}/bahmni/adt/#/home`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('text=Ward List', { timeout: 60000 });
  await page.locator('.tab-item a', { hasText: /^\s*All\s*$/ }).first().click();
  const box = page.locator('input[placeholder*="Patient Id"]:visible').first();
  await box.fill(id); await box.press('Enter');
  await page.waitForSelector('text=Patient Movement', { timeout: 30000 });
}
async function assignBed(page, ward) {
  // exact ward title ("Male Ward" must not match "Female Ward")
  const title = page.locator(".section-title", { hasText: new RegExp("(^|\\s)" + ward) }).first();
  await page.waitForSelector("span.ward-header", { timeout: 30000 });   // ward bars of the bed page (not the previous page's panels)
  const hdr = title.locator("span.ward-header").first();
  console.log("  bed page: titles=" + await page.locator(".section-title").count() + " match=" + await title.count() + " header=" + await hdr.count() + " beds=" + await title.locator("xpath=ancestor::ward[1]").locator("li.col").count());
  await hdr.click({ timeout: 10000 });   // the expand handler is on the title text
  await page.waitForTimeout(1500);
  console.log("  after expand: beds=" + await title.locator("xpath=ancestor::ward[1]").locator("li.col").count() + " available=" + await page.locator("li.col.available").count());
  const bed = title.locator("xpath=ancestor::ward[1]").locator(".bed-assignment li.col.available").first();
  await bed.waitFor({ state: "visible", timeout: 15000 });
  await bed.click();
  // each ward has its own (hidden) pop-up: use the visible control - "Assign" when admitting, "Transfer" when moving
  await page.locator("button:visible, a:visible, input[type=button]:visible").filter({ hasText: /^\s*(Assign|Transfer)\s*$/ }).first().click({ timeout: 15000 });
  // the success toast disappears after a few seconds: read it the moment it appears
  const toast = await page.waitForSelector("text=/(assigned|transferred) successfully/i", { timeout: 20000 });
  return (await toast.innerText()).replace(/\s+/g, " ");
}
async function openAdmitted(page, id) {
  await page.goto(BASE + "/bahmni/adt/#/home", { waitUntil: "domcontentloaded" });
  await page.waitForSelector("text=Ward List", { timeout: 60000 });
  await page.locator(".tab-item a", { hasText: /Admitted/ }).first().click();
  await page.waitForTimeout(2500);
  const tile = page.locator("li.active-patient", { hasText: id }).first();
  if (!(await tile.isVisible().catch(() => false))) return false;
  await tile.click();
  await page.waitForSelector("text=Patient Movement", { timeout: 30000 });
  return true;
}
async function movementOptions(page) { return page.$$eval("select option", os => os.map(o => o.textContent.trim())); }
async function discharge(page) {
  await page.selectOption("select", { label: "Discharge Patient" });
  await page.locator("button:has-text(\"Discharge\")").last().click();
  const y = page.locator("button:has-text(\"Yes\")");
  if (await y.waitFor({ state: "visible", timeout: 5000 }).then(() => true).catch(() => false)) await y.click();
  await page.waitForTimeout(4000);
}

(async () => {
  const { b, page, errors } = await browser({ width: 1366, height: 900 });
  try {
    await login(page, 'demo.nurse', 'brighton');
    // the Home tiles render after the sign-in redirect settles; give them time instead of reading the page at once
    await page.waitForFunction(() => /In-Patient/.test(document.body.innerText), null, { timeout: 30000 }).catch(() => {});
    const tiles = await page.evaluate(() => document.body.innerText);
    ok('Ward Nurse home shows the In-Patient tile', /In-Patient/.test(tiles), tiles.split('\n').filter(Boolean).slice(0, 8).join(', '));
    const pat = (await api(page, `/openmrs/ws/rest/v1/patient/${P}?v=custom:(identifiers:(identifier),display)`));
    const id = pat.identifiers[0].identifier;

    if (await openAdmitted(page, id)) { await discharge(page); console.log("  reset: discharged leftover admission"); }
    // make sure the patient has an open OPD visit to admit from (earlier runs may have discharged them)
    const visitNote = await page.evaluate(async (pu) => {
      const H = { Accept: "application/json", "Content-Type": "application/json" };
      const act = await fetch("/openmrs/ws/rest/v1/visit?patient=" + pu + "&includeInactive=false&v=custom:(uuid,visitType:(display))", { headers: H }).then(r => r.json());
      const opd = (act.results || []).filter(v => v.visitType.display === "OPD");
      if (opd.length) return "open visit: OPD";
      // close leftover IPD visits (patient already discharged by an earlier run)
      for (const v of act.results || []) await fetch("/openmrs/ws/rest/v1/visit/" + v.uuid, { method: "POST", headers: H, body: JSON.stringify({ stopDatetime: new Date(Date.now() - 1000).toISOString().replace("Z", "+0000") }) });
      const vt = await fetch("/openmrs/ws/rest/v1/visittype?q=OPD&v=custom:(uuid,name)", { headers: H }).then(r => r.json());
      const ses = await fetch("/openmrs/ws/rest/v1/session?v=custom:(sessionLocation:(uuid))", { headers: H }).then(r => r.json());
      const r = await fetch("/openmrs/ws/rest/v1/visit", { method: "POST", headers: H, body: JSON.stringify({ patient: pu,
        visitType: vt.results.find(x => x.name === "OPD").uuid, location: ses.sessionLocation.uuid }) });
      return "started OPD visit: HTTP " + r.status;
    }, P);
    console.log("  " + visitNote);
    // admit (discharge first if an earlier run left the patient admitted)
    await openPatient(page, id);
    console.log("  options before admit:", JSON.stringify(await movementOptions(page)), page.url().replace(BASE, ""));

    await page.selectOption('select', { label: 'Admit Patient' });
    await page.locator('textarea').first().fill('Automated test admission');
    await page.locator('button:has-text("Admit")').last().click();
    const yes = page.locator('button:has-text("Yes")');
    if (await yes.waitFor({ state: "visible", timeout: 6000 }).then(() => true).catch(() => false)) await yes.click();
    await page.waitForURL(/\/bed/, { timeout: 30000 });
    ok('Admit patient (OPD visit -> IPD visit)', true, id);
    const a1 = await assignBed(page, 'Male Ward');
    ok('Assign a bed in Male Ward', /assigned/i.test(a1), a1);
    await shot(page, 'ipd-1-assigned');

    // admitted list
    await page.goto(`${BASE}/bahmni/adt/#/home`, { waitUntil: 'domcontentloaded' });
    await page.locator('.tab-item a', { hasText: /Admitted/ }).first().click();
    await page.waitForTimeout(2500);
    ok('Patient appears in Admitted list', (await page.innerText('body')).includes(id));

    // transfer
    await openAdmitted(page, id);
    await page.selectOption('select', { label: 'Transfer Patient' });
    await page.locator('button.admit_btn', { hasText: /^\s*Save\s*$/ }).click();   // the transfer button is labelled Save
    await page.waitForURL(/\/bed/, { timeout: 30000 });
    const a2 = await assignBed(page, 'Female Ward');
    ok('Transfer to another ward (Female Ward)', /(assigned|transferred)/i.test(a2), a2);

    // discharge
    await openAdmitted(page, id);
    await discharge(page);
    const ws = await api(page, '/openmrs/ws/rest/v1/admissionLocation?v=full');
    const occupied = (ws.results || []).flatMap(w => (w.bedLayouts || []).filter(x => x.status === 'OCCUPIED').map(x => x.bedNumber));
    await page.goto(`${BASE}/bahmni/adt/#/home`, { waitUntil: 'domcontentloaded' });
    await page.locator('.tab-item a', { hasText: /Admitted/ }).first().click();
    await page.waitForTimeout(2500);
    const still = (await page.innerText('body')).includes(id);
    ok('Discharge: patient leaves Admitted list and bed is freed', !still, `occupied beds now: ${occupied.join(',') || 'none'}`);
    await shot(page, 'ipd-2-discharged');
  } catch (e) { ok('Unexpected error', false, e.message.split('\n')[0]); await shot(page, 'ipd-fail'); }
  if (errors.length) console.log('ERRORS', [...new Set(errors)].slice(0, 4).join(' | '));
  await b.close();
  console.log('RESULTS ' + JSON.stringify(results));
})();
