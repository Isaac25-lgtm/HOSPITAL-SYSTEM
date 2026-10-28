// Exploration pass 8: what the consultation pad searches return (diagnosis, investigation, medication).
const { browser, login, shot, BASE } = require('./lib');
(async () => {
  const P = process.env.PATIENT || '37ecfa82-1755-44c3-9c50-60638f39a53c';
  const { b, page, errors } = await browser({ width: 1366, height: 900 });
  await login(page, 'demo.doctor', 'arsenal');
  await page.goto(`${BASE}/bahmni-v2/clinical/${P}`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('button:has-text("New Consultation"), button:has-text("Consultation in progress")', { timeout: 60000 });
  await page.waitForTimeout(1500);
  const nc = page.locator('button:has-text("New Consultation")');
  if (await nc.count()) await nc.click();
  await page.waitForSelector('text=Order Investigations/Procedures');
  await page.waitForTimeout(1500);
  await shot(page, 'c-pad-full');
  const sections = await page.$$eval('h2,h3,h4,h5,label', es => es.filter(e => e.offsetParent && !e.closest('#vipers-root')).map(e => e.innerText.trim()).filter(Boolean));
  console.log('SECTIONS', JSON.stringify(sections));
  const inputs = await page.$$eval('input', es => es.filter(e => e.offsetParent).map(e => `#${e.id} ${e.placeholder}`));
  console.log('INPUTS', JSON.stringify(inputs));
  for (const [sel, q, name] of [
    ['input[placeholder*="iagnos" i], input[id*="diagnos" i], input[id*="condition" i]', 'Malaria', 'diag'],
    ['#investigations-procedures-search', 'Malaria', 'inv'],
    ['#investigations-procedures-search', 'Haemo', 'inv2'],
    ['#medication-search', 'Paracetamol', 'med'],
    ['#medication-search', 'Artemether', 'med2'],
    ['input[placeholder*="llerg" i], input[id*="allerg" i]', 'Peni', 'allergy'],
  ]) {
    const inp = page.locator(sel).first();
    if (!(await inp.count())) { console.log(`NO INPUT for ${name}`); continue; }
    await inp.click(); await inp.fill(q); await page.waitForTimeout(3000);
    const opts = await page.$$eval('[role=option], .cds--list-box__menu-item', os => os.filter(o => o.offsetParent).map(o => o.innerText.trim().replace(/\s+/g, ' ')).slice(0, 12));
    console.log(`OPTIONS ${name} (${q}): ${JSON.stringify(opts)}`);
    await shot(page, `c-opt-${name}`);
    await inp.fill(''); await page.keyboard.press('Escape'); await page.waitForTimeout(500);
  }
  console.log('ERRORS', errors.slice(0, 6).join(' || '));
  await b.close();
})();
