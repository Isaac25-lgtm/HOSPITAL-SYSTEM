// Reusable UI flows (verified by the acceptance tests) used to seed the demonstration dataset.
const { browser, login, passGate, BASE } = require('./lib');
// Playwright's emulated phone viewport can mis-hit-test buttons near the page end; real taps are unaffected
// (verified: elementFromPoint at the button centre is the button). Fall back to activating the element.
async function press(locator) {
  try { await locator.click({ timeout: 8000 }); }
  catch (e) {
    if (!/intercepts pointer events/.test(e.message)) throw e;
    // only accept the fallback if a real tap at the button centre would hit the button itself
    const hit = await locator.evaluate(el => { let r = el.getBoundingClientRect(); if (r.top < 0 || r.bottom > innerHeight) { el.scrollIntoView({ block: 'center' }); r = el.getBoundingClientRect(); }
      const t = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return !!t && (t === el || el.contains(t)); });
    if (!hit) throw new Error('button is genuinely covered by another element: ' + e.message.split('\n')[0]);
    await locator.evaluate(el => el.click());
  }
}
const BILL = BASE.replace('://demo.', '://billing.');

async function withUser(user, pass, fn) {
  const { b, page } = await browser({ width: 1366, height: 900 });
  try { await login(page, user, pass); return await fn(page); } finally { await b.close(); }
}

async function findPatient(page, name) {
  return page.evaluate(n => fetch(`/openmrs/ws/rest/v1/patient?q=${encodeURIComponent(n)}&v=custom:(uuid,display)`, { headers: { Accept: 'application/json' } })
    .then(r => r.json()).then(j => (j.results || [])[0] || null), name);
}

// Registration (receptionist): create patient, optionally start OPD visit. Returns uuid.
async function register(page, p) {
  await page.goto(BASE + '/bahmni-v2/registration/patient/new', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#first-name');
  await page.fill('#first-name', p.first);
  if (p.middle) await page.fill('#middle-name', p.middle);
  await page.fill('#last-name', p.last);
  await page.locator('button[id$="-toggle-button"]', { hasText: 'Select' }).first().click();
  await page.locator('[role=option]', { hasText: p.gender }).first().click();
  if (p.ageMonths !== undefined) { await page.fill('#age-years', String(p.age || 0)); await page.fill('#age-months', String(p.ageMonths)); }
  else await page.fill('#age-years', String(p.age));
  await page.click('button:has-text("Address information")');
  if (p.address) await page.fill('#address1', p.address);
  await page.fill('#cityVillage', p.city);
  await page.click('button:has-text("Contact information")');
  await page.fill('input[placeholder="Phone Number"]', p.phone);
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await page.waitForURL(/registration\/patient\/[0-9a-f-]{36}/, { timeout: 30000 });
  const uuid = page.url().match(/patient\/([0-9a-f-]{36})/)[1];
  if (p.visit) {
    await press(page.locator('button:has-text("Start OPD visit"):visible').first());
    await page.locator('button:has-text("Patient Dashboard"):visible').first().waitFor({ timeout: 30000 });
  }
  return uuid;
}

// Consultation (doctor): diagnoses, investigations, medications, vitals -> Done.
async function consult(page, uuid, c) {
  await page.goto(`${BASE}/bahmni-v2/clinical/${uuid}`, { waitUntil: 'domcontentloaded' });
  await page.locator('button:has-text("New Consultation"), button:has-text("Continue Consultation")').first().click({ timeout: 60000 });
  await page.waitForSelector('#diagnoses-search', { timeout: 30000 });
  const pick = async (sel, q, opt) => {
    const inp = page.locator(sel).first(); await inp.click(); await inp.fill(q);
    await page.locator('[role=option]', { hasText: opt }).first().click({ timeout: 20000 }); await page.waitForTimeout(900);
  };
  const choose = async (btnText, optText) => {
    const btn = page.locator('button[id$="-toggle-button"], button[role=combobox]', { hasText: btnText }).first();
    await btn.scrollIntoViewIfNeeded(); await btn.click();
    const opts = await page.$$eval('[role=option]', os => os.filter(o => o.offsetParent).map(o => o.innerText.trim()));
    const want = opts.find(o => o.toLowerCase() === optText.toLowerCase()) || opts.find(o => o.toLowerCase().startsWith(optText.toLowerCase())) || opts[0];
    await page.locator('[role=option]', { hasText: want }).first().click(); await page.waitForTimeout(400);
  };
  for (const [q, opt, certainty] of c.diagnoses || []) { await pick('#diagnoses-search', q, opt); await choose('Select Certainty', certainty); }
  for (const [q, opt] of c.tests || []) await pick('#investigations-procedures-search', q, opt);
  const ids = () => page.$$eval('input[id^="medication-dosage-input-"]', es => es.map(e => e.id));
  for (const m of c.meds || []) {
    const before = await ids();
    await pick('#medication-search', m.q, m.drug);
    // new rows are inserted at the top: find the row that just appeared by its input id
    const id = (await ids()).find(x => !before.includes(x)).replace('medication-dosage-input-', '');
    await page.locator(`#medication-dosage-input-${id}`).fill(String(m.dose));
    await page.locator(`#medication-duration-input-${id}`).fill(String(m.days));
    // only the new row still shows the placeholder text on its dropdowns
    if (await page.locator('button[id$="-toggle-button"]', { hasText: 'Dosage Unit' }).count()) await choose('Dosage Unit', m.unit);
    await choose('Frequency', m.freq);
    // some drug forms (e.g. oral solutions) have no default route; the newest row is first in the DOM
    const routeBtn = page.locator('button[role=combobox][aria-label="Route"]').first();
    if ((await routeBtn.count()) && (await routeBtn.innerText()).trim() === 'Route') {
      await routeBtn.click();
      const ropts = await page.$$eval('[role=option]', os => os.filter(o => o.offsetParent).map(o => o.innerText.trim()));
      await page.locator('[role=option]', { hasText: ropts.find(o => o === (m.route || 'Oral')) || ropts[0] }).first().click();
    }
  }
  if (c.vitals) {
    await page.locator('text=/^Vitals$/').last().click();
    await page.locator('text=Pulse (beats/min)').waitFor({ timeout: 20000 });
    const nums = page.locator('input[type=number]:visible');
    for (let i = 0; i < c.vitals.length; i++) if (c.vitals[i] !== null) await nums.nth(i).fill(String(c.vitals[i]));
    await press(page.locator('button:has-text("Save Form"):visible').first()); await page.waitForTimeout(1200);
  }
  await press(page.locator('button:has-text("Done"):visible').first());
  await page.locator('text=/Consultation saved successfully/i').first().waitFor({ timeout: 30000 });
}

// Lab result (lab technician): coded answer for one pending test.
async function labResult(page, uuid, test, answer, abnormal) {
  await page.goto(`${BASE}/lab/patient/${uuid}`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('text=Pending Lab Orders');
  await page.locator('tr', { hasText: test }).first().locator('label').first().click({ timeout: 20000 });
  await page.click('button:has-text("Enter Test Results")');
  await page.locator('button[id$="-toggle-button"]', { hasText: 'Select an answer' }).click();
  await page.locator('[role=option]', { hasText: answer }).first().click();
  if (abnormal) await page.locator('label:has-text("Abnormal")').first().click();
  await page.locator('#reportDate').click({ force: true });
  await page.locator('.flatpickr-day.today').first().click();
  await page.click('button:has-text("Save and Upload")');
  await page.locator('text=/Report successfully uploaded/i').first().waitFor({ timeout: 30000 });
}

// Appointment (receptionist).
async function appointment(page, last, service, daysAhead, time, note, checkIn) {
  await page.goto(BASE + '/appointments/#/home/manage/appointments/list/new', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#PatientSearch', { timeout: 30000 });
  await page.fill('#PatientSearch', last);
  await page.locator('[role=option]', { hasText: last }).first().click({ timeout: 20000 });
  const svc = page.locator('input#combo-box').nth(1); await svc.click(); await svc.fill(service.slice(0, 12));
  await page.locator('[role=option]', { hasText: service }).first().click();
  await page.locator('label:has-text("Scheduled")').first().click();
  const d = new Date(Date.now() + daysAhead * 86400e3);
  const date = page.locator('input[id="Appointment Date"]'); await date.click();
  await page.keyboard.type(`${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}/${d.getFullYear()}`, { delay: 30 });
  await page.keyboard.press('Escape');
  const [hh, mm] = time.split(':').map(Number);
  await page.locator('input#time-selector').nth(0).fill(`${String(((hh + 11) % 12) + 1).padStart(2, '0')}:${String(mm).padStart(2, '0')}`);
  await page.locator('select[id^="time-picker-select"]').nth(0).selectOption(hh >= 12 ? 'PM' : 'AM');
  if (note) await page.fill('textarea', note);
  await page.click('button:has-text("Check and Save")');
  await page.waitForTimeout(2500);
  const confirm = page.locator('button:has-text("Yes"), button:has-text("Confirm")').last();
  if (await confirm.isVisible().catch(() => false)) await confirm.click();
  await page.waitForTimeout(2500);
}

// Billing (cashier, Crater): invoice for a synced patient; optional payment.
async function invoice(last, items, pay) {
  const { b, page } = await browser({ width: 1366, height: 900 });
  try {
    await passGate(page, BILL + '/');
    await page.fill('input[type=email]', 'demo.cashier@vipers.demo');
    await page.fill('input[type=password]', 'everton');
    await page.click('button[type=submit]');
    await page.waitForURL(/admin\/dashboard/, { timeout: 30000 });
    // wait until the patient has synced into Crater
    for (let i = 0; i < 20; i++) {
      const found = await page.evaluate(n => fetch(`/api/v1/customers?search=${encodeURIComponent(n)}`, { headers: { Accept: 'application/json', company: '1' } }).then(r => r.json()).then(j => (j.data || []).length), last);
      if (found) break; await page.waitForTimeout(3000);
    }
    await page.goto(BILL + '/admin/invoices/create', { waitUntil: 'domcontentloaded' });
    await page.locator('button:has-text("New Customer")').first().click();
    await page.locator('input[placeholder*="Search" i]:visible').last().fill(last);
    await page.waitForTimeout(1500);
    await page.locator(`text=${last}`).last().click();
    await page.waitForTimeout(1000);
    for (let i = 0; i < items.length; i++) {
      if (i > 0) { await page.locator('text=/Add New Item/i').first().click(); await page.waitForTimeout(700); }
      const desc = page.locator('[placeholder*="Item Description" i]').last();
      const box = await desc.boundingBox();
      await page.mouse.click(box.x + 150, box.y - 32); await page.waitForTimeout(300);
      await page.keyboard.type(items[i].split(' ')[0], { delay: 25 }); await page.waitForTimeout(1500);
      await page.locator(`li:has-text("${items[i]}"), span:has-text("${items[i]}")`).first().click(); await page.waitForTimeout(700);
    }
    await page.locator('button:has-text("Save Invoice"):visible').first().click();
    await page.waitForURL(/invoices\/\d+\/view/, { timeout: 30000 });
    const id = page.url().match(/invoices\/(\d+)/)[1];
    if (pay) {
      await page.goto(`${BILL}/admin/payments/${id}/create`, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(2500);
      await page.locator('button:has-text("Save Payment"):visible').first().click();
      await page.waitForURL(/payments\/\d+\/view/, { timeout: 30000 });
    }
    return id;
  } finally { await b.close(); }
}

module.exports = { withUser, findPatient, register, consult, labResult, appointment, invoice, BILL };
