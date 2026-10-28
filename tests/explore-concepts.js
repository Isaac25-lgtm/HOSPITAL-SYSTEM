// Exploration: which diagnoses / tests / drugs exist for the seed scenarios.
const { browser, login, BASE } = require('./lib');
(async () => {
  const P = process.env.PATIENT;
  const { b, page } = await browser({ width: 1366, height: 900 });
  await login(page, 'demo.doctor', 'arsenal');
  await page.goto(`${BASE}/bahmni-v2/clinical/${P}`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('button:has-text("New Consultation"), button:has-text("Continue Consultation")', { timeout: 60000 });
  await page.locator('button:has-text("New Consultation"), button:has-text("Continue Consultation")').first().click();
  await page.waitForSelector('#diagnoses-search');
  const probe = async (sel, q) => {
    const inp = page.locator(sel); await inp.click(); await inp.fill(q); await page.waitForTimeout(2500);
    const o = await page.$$eval('[role=option]', os => os.filter(x => x.offsetParent).map(x => x.innerText.trim().replace(/\s+/g, ' ')).slice(0, 10));
    console.log(`${sel.replace('#', '')} "${q}": ${JSON.stringify(o)}`);
    await inp.fill(''); await page.keyboard.press('Escape');
  };
  for (const q of ['Hypertension', 'Pregnan', 'Antenatal', 'Respiratory', 'Pneumonia', 'Common cold', 'Anaemia']) await probe('#diagnoses-search', q);
  for (const q of ['Haemoglobin', 'Urin', 'Glucose', 'HIV', 'Syphilis', 'Malaria', 'Blood group']) await probe('#investigations-procedures-search', q);
  for (const q of ['Amlodipine', 'Amoxicillin', 'Paracetamol', 'Ferrous', 'Folic', 'Zinc', 'ORS']) await probe('#medication-search', q);
  await page.locator('button:has-text("Cancel")').last().click().catch(() => {});
  await b.close();
})();
