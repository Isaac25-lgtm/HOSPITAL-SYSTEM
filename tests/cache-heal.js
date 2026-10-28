// MODE=poison: plant a broken, cacheable appointment.js in a persistent profile (simulates the warm-up bug).
// MODE=heal:   same profile; open any page once (VIPERS layer clears the site cache), then Appointments must render.
const { chromium } = require('playwright');
const { passGate, BASE } = require('./lib');
(async () => {
  const ctx = await chromium.launchPersistentContext('/t/out/profile-heal', { viewport: { width: 1366, height: 768 } });
  const page = ctx.pages()[0] || await ctx.newPage(); page.setDefaultTimeout(60000);
  const login = async () => {
    await passGate(page, BASE + '/bahmni/home/');
    await page.waitForTimeout(2000);
    if (await page.locator('#username').count()) {
      await page.fill('#username', 'demo.doctor'); await page.fill('#password', 'arsenal'); await page.click('button[type=submit]');
      await page.waitForURL(/loginLocation|bahmni-v2\/home/);
      if (page.url().includes('loginLocation')) { const s = page.locator('select').last(); const v = await s.locator('option').evaluateAll(o => o.map(x => x.value).filter(x => x && !/^\?/.test(x))); await s.selectOption(v[0]); await page.click('button:has-text("Continue")'); }
      await page.waitForURL(/bahmni-v2\/home/).catch(() => {}); await page.waitForTimeout(3000);
    }
  };
  const appointmentsRender = async () => {
    await page.goto(BASE + '/appointments/#/home/manage/summary', { waitUntil: 'domcontentloaded' }).catch(() => {});
    for (let i = 0; i < 15; i++) { if (await page.locator('text=Services').count()) return true; await page.waitForTimeout(1000); }
    return false;
  };
  await login();
  if (process.env.MODE === 'poison') {
    await page.route('**/appointments/appointment.js', r => r.fulfill({ status: 200, contentType: 'text/javascript', headers: { 'Cache-Control': 'public, max-age=86400' }, body: 'this is ( broken' }));
    console.log('poisoned: Appointments renders =', await appointmentsRender());
    await page.unroute('**/appointments/appointment.js');
    await page.evaluate(() => localStorage.removeItem('vipers.cachefix-1'));
    console.log('still broken from cache without network help =', !(await appointmentsRender()));
    await page.evaluate(() => localStorage.removeItem('vipers.cachefix-1'));
  } else {
    await page.goto(BASE + '/bahmni-v2/home/', { waitUntil: 'domcontentloaded' }).catch(() => {});
    await page.waitForTimeout(5000);
    console.log('repair flag set =', await page.evaluate(() => localStorage.getItem('vipers.cachefix-1')));
    console.log('healed: Appointments renders =', await appointmentsRender());
  }
  await ctx.close();
})();
