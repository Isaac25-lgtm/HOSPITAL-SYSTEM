// MODE=poison: with a persistent profile, sit on Home (warm-up runs) and confirm Appointments is broken.
// MODE=heal:   same profile after the fix; open Home once, then confirm Appointments renders.
const { chromium } = require('playwright');
const { passGate, BASE } = require('./lib');
(async () => {
  const ctx = await chromium.launchPersistentContext('/t/out/profile-cachetest', { viewport: { width: 1366, height: 768 } });
  const page = ctx.pages()[0] || await ctx.newPage(); page.setDefaultTimeout(60000);
  await passGate(page);
  if (await page.locator('#username').count()) {
    await page.fill('#username', 'demo.doctor'); await page.fill('#password', 'arsenal'); await page.click('button[type=submit]');
    await page.waitForURL(/loginLocation|bahmni-v2\/home/);
    if (page.url().includes('loginLocation')) { const s = page.locator('select').last(); const v = await s.locator('option').evaluateAll(o => o.map(x => x.value).filter(x => x && !/^\?/.test(x))); await s.selectOption(v[0]); await page.click('button:has-text("Continue")'); }
    await page.waitForURL(/bahmni-v2\/home/, { timeout: 60000 }).catch(() => {}); await page.waitForTimeout(2000);
  }
  if (!/bahmni-v2\/home/.test(page.url())) await page.goto(BASE + '/bahmni-v2/home/', { waitUntil: 'domcontentloaded' }).catch(e => console.log('home goto:', e.message.split('\n')[0]));
  console.log('on', page.url());
  await page.waitForTimeout(process.env.MODE === 'poison' ? 30000 : 6000);
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.goto(BASE + '/appointments/#/home/manage/summary', { waitUntil: 'domcontentloaded' });
  let ok = false; for (let i = 0; i < 20 && !ok; i++) { ok = (await page.locator('text=Services').count()) > 0; if (!ok) await page.waitForTimeout(1000); }
  console.log(`${process.env.MODE}: Appointments renders = ${ok}; errors = ${JSON.stringify(errs.slice(0, 2))}`);
  await ctx.close();
})();
