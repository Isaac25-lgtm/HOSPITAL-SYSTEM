// Spinner watchdog: a loading spinner that stays up for 25 s gets the "taking longer than expected" banner with
// Try again / Go to Home, and the banner disappears when loading finishes.
const { browser, login, BASE } = require('./lib');
const R = [];
const ok = (step, pass, note = '') => { R.push({ step, pass, note }); console.log(`${pass ? 'PASS' : 'FAIL'} | ${step}${note ? ' | ' + note : ''}`); };
(async () => {
  const { b, page } = await browser({ width: 1366, height: 768 });
  try {
    await login(page, 'demo.reception', 'liverpool');
    await page.goto(BASE + '/bahmni-v2/home/', { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#vipers-root', { state: 'attached' });
    const banner = () => page.locator('#vipers-root .vp-stuck').count();
    await page.evaluate(() => { const d = document.createElement('div'); d.id = 'fake-stuck'; d.className = 'cds--loading';
      d.style.cssText = 'position:fixed;left:45%;top:45%;width:60px;height:60px'; document.body.appendChild(d); });
    await page.waitForTimeout(15000);
    ok('no banner while a spinner has been up only 15 s', (await banner()) === 0);
    await page.waitForTimeout(13000);
    ok('banner shown after 25 s of spinner', (await banner()) === 1);
    ok('banner offers Try again and Go to Home', await page.locator('#vipers-root .vp-stuck button:has-text("Try again")').count() === 1 &&
      await page.locator('#vipers-root .vp-stuck button:has-text("Go to Home")').count() === 1);
    await page.evaluate(() => document.getElementById('fake-stuck').remove());
    await page.waitForTimeout(1500);
    ok('banner disappears when the spinner goes', (await banner()) === 0);
  } catch (e) { ok('unexpected error', false, e.message.split('\n')[0]); }
  await b.close();
  console.log('RESULTS ' + JSON.stringify(R));
})();
