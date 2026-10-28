// Hospital trial server, end to end in a browser: hospital sign-in, TRIAL label, the "Delete hospital space"
// button and its confirmation dialog, and (DELETE=1) the deletion itself.
//   run-test.sh wf-trial-delete.js BASE=https://demo.<trial-ip>.sslip.io HUSER=<username> HPASS=<password> [DELETE=1]
const { browser, login, shot, BASE } = require('./lib');
const R = [];
const ok = (step, pass, note = '') => { R.push({ step, pass, note }); console.log(`${pass ? 'PASS' : 'FAIL'} | ${step}${note ? ' | ' + note : ''}`); };

(async () => {
  const { b, page } = await browser({ width: 1366, height: 768 });
  try {
    await page.goto(BASE + '/bahmni/home/index.html#/login', { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#vp-hnotice', { timeout: 60000 }).catch(() => {});
    ok('hospital sign-in notice shown, no demo role cards', await page.locator('#vp-hnotice').count() === 1 && await page.locator('.vp-card').count() === 0);
    await login(page, process.env.HUSER, process.env.HPASS);
    ok('hospital account signs in', /bahmni-v2\/home|dashboard/.test(page.url()), page.url());
    const del = page.locator('#vp-del');
    ok('"Delete account" is offered right after signing in', await del.waitFor({ timeout: 15000 }).then(() => true).catch(() => false));
    ok('header label says TRIAL', (await page.locator('#vp-hdr-badge').textContent().catch(() => '')) === 'TRIAL');
    await shot(page, 'trial-home-delete-button');
    await del.click();
    const go = page.locator('.vp-del-go');
    ok('confirmation dialog opens with the delete button disabled', await go.isDisabled());
    await page.fill('.vp-del-dialog input', 'wrong-name');
    ok('a wrong username keeps it disabled', await go.isDisabled());
    await page.fill('.vp-del-dialog input', process.env.HUSER);
    ok('the exact username enables it', await go.isEnabled());
    await shot(page, 'trial-delete-dialog');
    if (process.env.DELETE === '1') {
      await go.click();
      const done = await page.locator('.vp-del-dialog h2:has-text("being deleted")').waitFor({ timeout: 30000 }).then(() => true).catch(() => false);
      ok('deletion accepted and confirmed to the hospital', done, (await page.locator('.vp-del-msg').textContent().catch(() => '')) || '');
      await shot(page, 'trial-delete-done');
    } else {
      await page.click('.vp-del-dialog .vp-link');
      ok('Cancel closes the dialog', await page.locator('.vp-del-dialog').count() === 0);
    }
  } catch (e) { ok('unexpected error', false, e.message.split('\n')[0]); }
  await b.close();
  console.log('RESULTS ' + JSON.stringify(R));
})();
