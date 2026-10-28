// Probe: pinned forms layout in the consultation pad, and Crater payment buttons, on a phone.
const { browser, login, passGate, BASE } = require('./lib');
const BILL = BASE.replace('://demo.', '://billing.');
(async () => {
  let { b, page } = await browser();
  await login(page, 'demo.doctor', 'arsenal');
  await page.goto(`${BASE}/bahmni-v2/clinical/${process.env.PATIENT}`, { waitUntil: 'domcontentloaded' });
  await page.locator('button:has-text("New Consultation"), button:has-text("Continue Consultation")').first().click();
  await page.waitForSelector('#diagnoses-search'); await page.waitForTimeout(1500);
  console.log('PINNED', JSON.stringify(await page.evaluate(() => {
    const t = [...document.querySelectorAll('*')].find(e => e.children.length === 0 && /^Vitals$/.test((e.innerText || '').trim()));
    const out = []; let e = t; for (let i = 0; e && i < 7; i++, e = e.parentElement) { const r = e.getBoundingClientRect(); const cs = getComputedStyle(e); out.push(`${e.tagName}.${String(e.className).slice(0, 60)} x=${Math.round(r.left)}..${Math.round(r.right)} w=${Math.round(r.width)} disp=${cs.display} gtc=${cs.gridTemplateColumns} wrap=${cs.flexWrap} ovx=${cs.overflowX}`); }
    return out;
  }), null, 1));
  await b.close();
  ({ b, page } = await browser());
  await passGate(page, BILL + '/');
  await page.fill('input[type=email]', 'demo.cashier@vipers.demo'); await page.fill('input[type=password]', 'everton'); await page.click('button[type=submit]');
  await page.waitForURL(/admin\/dashboard/);
  await page.goto(BILL + '/admin/payments/create', { waitUntil: 'domcontentloaded' }); await page.waitForTimeout(3000);
  console.log('CRATER BUTTONS', JSON.stringify(await page.$$eval('button, [type=submit]', bs => bs.map(x => `${x.type}:${(x.innerText || x.getAttribute('aria-label') || '').trim().slice(0, 25)}:vis=${!!x.offsetParent}`))));
  await b.close();
})();
