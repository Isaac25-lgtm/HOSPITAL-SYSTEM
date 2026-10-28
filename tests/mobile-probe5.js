// Probe: on a phone, what covers "Save Form" in the Vitals form of the consultation pad?
const { browser, login, BASE } = require('./lib');
(async () => {
  const { b, page } = await browser();
  await login(page, 'demo.doctor', 'arsenal');
  await page.goto(`${BASE}/bahmni-v2/clinical/${process.env.PATIENT}`, { waitUntil: 'domcontentloaded' });
  await page.locator('button:has-text("New Consultation"), button:has-text("Continue Consultation")').first().click({ timeout: 60000 });
  await page.waitForSelector('#diagnoses-search');
  await page.locator('text=/^Vitals$/').last().click();
  await page.locator('text=Pulse (beats/min)').waitFor();
  await page.waitForTimeout(1500);
  const info = await page.evaluate(() => {
    const btn = [...document.querySelectorAll('button')].find(x => /Save Form/.test(x.innerText) && x.offsetParent);
    const r = btn.getBoundingClientRect();
    const t = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    const chain = e => { const o = []; for (let i = 0; e && i < 6; i++, e = e.parentElement) { const cs = getComputedStyle(e); o.push(`${e.tagName}.${String(e.className).slice(0, 45)} pos=${cs.position} z=${cs.zIndex} y=${Math.round(e.getBoundingClientRect().top)}..${Math.round(e.getBoundingClientRect().bottom)}`); } return o; };
    return { viewport: [innerWidth, innerHeight], button: [Math.round(r.top), Math.round(r.bottom)], topEl: chain(t), btnChain: chain(btn) };
  });
  console.log(JSON.stringify(info, null, 1));
  await page.screenshot({ path: '/t/out/m-vitals-form.png' });
  await b.close();
})();
