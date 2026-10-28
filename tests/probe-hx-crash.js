// Probe: History and Examination form crash (React #185). Runs with and without the VIPERS layer (NOVIPERS=1).
const { browser, login, shot, BASE } = require('./lib');
const PATIENT = process.env.PATIENT || '2c1a31f6-ba69-4185-9dd4-63c517d748ca';
(async () => {
  const { b, page } = await browser({ width: 1366, height: 900 });
  const errs = [];
  page.on('pageerror', e => errs.push(e.message.slice(0, 120)));
  if (process.env.NOVIPERS === '1') await page.route(/vipers-assets\/vipers\.(js|css)/, r => r.abort());
  const step = async (name, fn) => {
    const before = errs.length;
    try { await fn(); } catch (e) { console.log(`  ${name}: action failed ${e.message.split('\n')[0]}`); }
    await page.waitForTimeout(1500);
    const blank = await page.evaluate(() => (document.getElementById('root') || document.body).innerHTML.length < 50);
    console.log(`${name}: errors+${errs.length - before} blank=${blank}`);
    return blank;
  };
  await login(page, 'demo.doctor', 'arsenal');
  await page.goto(`${BASE}/bahmni-v2/clinical/${PATIENT}`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('button:has-text("New Consultation"), button:has-text("Consultation in progress")', { timeout: 90000 });
  await page.click('button:has-text("New Consultation")').catch(() => {});
  await page.waitForTimeout(3000);
  if (process.env.VITALS === '1') {
    await step('open Vitals form', () => page.locator('text="Vitals"').last().click());
    await step('fill pulse', () => page.locator('input[type=number]').first().fill('96'));
    await step('save Vitals', () => page.locator('button:has-text("Save Form")').click());
  }
  await step('open H&E form', () => page.locator('text="History and Examination"').last().click());
  if (process.env.CC === '1') {
    await step('chief complaint: type fever', async () => { const c = page.locator('input[role=combobox], .cds--combo-box input, [class*=select] input').first(); await c.click(); await c.fill('fever'); });
    await step('chief complaint: pick Fever', () => page.locator('[role=option]:has-text("Fever"), div:text-is("Fever")').first().click());
    await step('duration 3', () => page.locator('input[type=number]').first().fill('3'));
    await step('units Days', () => page.locator('button:has-text("Days")').first().click());
  }
  const DELAY = +(process.env.DELAY || -1);
  await step(`type in history textarea (delay ${DELAY})`, async () => {
    const t = page.locator('textarea').first();
    if (DELAY < 0) return t.fill('probe note');
    await t.click();
    await page.keyboard.type('QA test note: fever, headache and chills for 3 days. No vomiting.', { delay: DELAY });
  });
  await step('click Never smoker', () => page.locator('button:has-text("Never smoker")').click());
  await step('click Save Form', () => page.locator('button:has-text("Save Form")').click());
  console.log('errors:', [...new Set(errs)].join(' || '));
  await shot(page, 'probe-hx-' + (process.env.NOVIPERS === '1' ? 'novipers' : 'vipers'));
  // leave without saving the consultation
  await b.close();
})();
