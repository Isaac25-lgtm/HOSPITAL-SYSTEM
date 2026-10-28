// Acceptance: first-login walkthrough (3 steps, Next/Back/Skip, Don't show again) + logout/login again.
const { browser, login, shot, BASE } = require('./lib');
const R = [];
const ok = (step, pass, note = '') => { R.push({ step, pass, note }); console.log(`${pass ? 'PASS' : 'FAIL'} | ${step}${note ? ' | ' + note : ''}`); };
process.env.KEEP_TOUR = '1';
(async () => {
  const { b, page, errors } = await browser({ width: 1366, height: 900 });
  try {
    await login(page, 'demo.reception', 'liverpool');
    const tour = page.locator('#vipers-root .vp-tour');
    await tour.waitFor({ timeout: 10000 });
    ok('Walkthrough appears on first login', true, await tour.locator('h2').innerText());
    await shot(page, 'wf-tour-1');
    await tour.locator('button:has-text("Next")').click();
    const s2 = await tour.locator('.vp-step').innerText();
    await tour.locator('button:has-text("Back")').click();
    const s1 = await tour.locator('.vp-step').innerText();
    ok('Walkthrough Next and Back work', /2 of 3/.test(s2) && /1 of 3/.test(s1), `${s2} / ${s1}`);
    await tour.locator('button:has-text("Next")').click(); await tour.locator('button:has-text("Next")').click();
    ok('Step 3 points to Help and Ask Vipers AI', /Ask Vipers AI/.test(await tour.innerText()));
    await shot(page, 'wf-tour-3');
    await tour.locator('button:has-text("Skip")').click();
    ok('Walkthrough can be skipped', await page.locator('#vipers-root .vp-overlay').count() === 0);
    await page.reload({ waitUntil: 'domcontentloaded' }); await page.waitForTimeout(3500);
    ok("Walkthrough not shown again after 'Don't show again'", await page.locator('#vipers-root .vp-overlay').count() === 0);
    // logout and log in again
    await page.locator('#user-global-action-button, button:has-text("Hi,")').first().click();
    await page.waitForTimeout(800);
    const items = await page.$$eval('body *', es => es.filter(e => e.offsetParent && e.children.length === 0 && /log ?out|sign ?out/i.test(e.innerText || '')).map(e => e.innerText.trim()));
    console.log('  logout items:', JSON.stringify(items));
    await page.locator(`text=${items[0] || 'Logout'}`).first().click();
    await page.waitForURL(/login/, { timeout: 20000 });
    ok('Logout returns to login page', true, page.url().replace(BASE, ''));
    const ms = await login(page, 'demo.reception', 'liverpool');
    ok('Same account can log in again', /bahmni-v2\/home/.test(page.url()), `${ms} ms`);
  } catch (e) { ok('Unexpected error', false, e.message.split('\n')[0]); await shot(page, 'wf-tour-fail'); }
  console.log('ERRORS', errors.slice(0, 6).join(' || '));
  console.log('RESULTS', JSON.stringify(R));
  await b.close();
})();
