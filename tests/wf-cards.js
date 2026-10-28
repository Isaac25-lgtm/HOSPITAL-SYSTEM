// One-click sign-in: no gate, a card per role signs in (incl. the location step), Billing card signs in to Crater.
const { browser, shot, BASE } = require('./lib');
const ROLES = [['Reception', 'demo.reception'], ['Doctor', 'demo.doctor'], ['Laboratory', 'demo.lab'], ['Cashier', 'demo.cashier'], ['Administrator', 'demo.admin']];
const results = [];
const ok = (name, pass, detail = '') => { results.push({ name, pass, detail }); console.log(`${pass ? 'PASS' : 'FAIL'} | ${name} | ${detail}`); };

(async () => {
  for (const [title, user] of ROLES) {
    const { b, page, errors } = await browser();
    try {
      await page.goto(BASE + '/bahmni/home/', { waitUntil: 'domcontentloaded' });
      ok(`${title}: no access-code gate`, !page.url().includes('/vipers-gate/'), page.url());
      await page.waitForSelector('#vp-cards .vp-card', { timeout: 60000 });
      const pwHidden = !(await page.locator('#password').isVisible());
      ok(`${title}: password form hidden, cards shown`, pwHidden, `${await page.locator('#vp-cards .vp-card').count()} cards`);
      if (title === 'Reception') await shot(page, 'cards-login');
      const t0 = Date.now();
      await page.click(`#vp-cards .vp-card:has(.vp-card-title:text-is("${title}"))`);
      await page.waitForURL(/bahmni-v2\/home|dashboard/, { timeout: 90000 }).catch(() => {});
      const s = await page.evaluate(() => fetch('/openmrs/ws/rest/v1/session?v=custom:(authenticated,user:(username),sessionLocation:(display))', { headers: { Accept: 'application/json' } }).then(r => r.json()).catch(e => ({ e: String(e) })));
      ok(`${title}: one click signs in as ${user}`, s.authenticated && s.user && s.user.username === user,
        `${Date.now() - t0} ms; url=${page.url()}; location=${s.sessionLocation && s.sessionLocation.display}`);
      await shot(page, `cards-${user}`);
    } catch (e) { ok(`${title}: flow`, false, e.message.split('\n')[0]); }
    if (errors.length) console.log(`  errors: ${errors.slice(0, 3).join(' | ')}`);
    await b.close();
  }

  const { b, page } = await browser();
  try {
    await page.goto(BASE + '/bahmni/home/', { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#vp-cards .vp-card', { timeout: 60000 });
    await page.click('#vp-cards .vp-card:has(.vp-card-title:text-is("Billing"))');
    await page.waitForSelector('#vp-bcards .vp-card', { timeout: 60000 });
    ok('Billing: no gate, card shown, password hidden', !(await page.locator('input[type=password]').isVisible()), page.url());
    await shot(page, 'cards-billing-login');
    await page.click('#vp-bcards .vp-card');
    await page.waitForURL(/\/admin/, { timeout: 60000 }).catch(() => {});
    ok('Billing: one click signs in to Crater', /\/admin/.test(page.url()), page.url());
    await shot(page, 'cards-billing-in');
  } catch (e) { ok('Billing: flow', false, e.message.split('\n')[0]); }
  await b.close();

  const m = await browser({ width: 390, height: 844 });
  try {
    await m.page.goto(BASE + '/bahmni/home/', { waitUntil: 'domcontentloaded' });
    await m.page.waitForSelector('#vp-cards .vp-card', { timeout: 60000 });
    await shot(m.page, 'cards-login-phone');
    ok('Phone width: cards visible', await m.page.locator('#vp-cards .vp-card').first().isVisible());
  } catch (e) { ok('Phone: flow', false, e.message.split('\n')[0]); }
  await m.b.close();

  console.log('RESULTS ' + JSON.stringify(results));
})();
