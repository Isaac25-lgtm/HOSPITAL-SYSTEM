// Role switching with the cards in one tab: card -> home -> logout -> another card (what testers actually do).
const { browser, shot, BASE } = require('./lib');
const results = [];
const ok = (name, pass, detail = '') => { results.push({ name, pass, detail }); console.log(`${pass ? 'PASS' : 'FAIL'} | ${name} | ${detail}`); };
const who = page => page.evaluate(() => fetch('/openmrs/ws/rest/v1/session?v=custom:(authenticated,user:(username))', { headers: { Accept: 'application/json' } })
  .then(r => r.json()).then(s => s.user ? s.user.username : 'none').catch(e => 'err ' + e));

async function clickCard(page, title) {
  await page.waitForSelector('#vp-cards .vp-card', { timeout: 60000 });
  await page.click(`#vp-cards .vp-card:has(.vp-card-title:text-is("${title}"))`);
  await page.waitForURL(/bahmni-v2\/home|dashboard/, { timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(3000);
  const skip = page.locator('#vipers-root .vp-tour button:has-text("Skip")');
  if (await skip.isVisible().catch(() => false)) await skip.click();
}
async function logout(page) {
  await page.goto(BASE + '/bahmni-v2/home/', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3000);
  const skip = page.locator('#vipers-root .vp-tour button:has-text("Skip")');
  if (await skip.isVisible().catch(() => false)) await skip.click();
  await page.locator('#user-global-action-button, button:has-text("Hi,")').first().click({ timeout: 10000 });
  await page.waitForTimeout(800);
  await page.locator('text=/^\\s*(Logout|Log out|Sign out)\\s*$/i').first().click({ timeout: 10000 });
  await page.waitForURL(/login/, { timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(2000);
}

(async () => {
  const { b, page, errors } = await browser();
  const log = [];
  page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') log.push(`console.${m.type()}: ${m.text().slice(0, 200)}`); });
  page.on('request', r => { if (/openmrs|session|login/.test(r.url())) log.push(`REQ ${r.method()} ${r.url().replace(BASE, '')}`); });
  page.on('response', r => { if (/openmrs|session|login/.test(r.url())) log.push(`RES ${r.status()} ${r.url().replace(BASE, '')}`); });
  try {
    await page.goto(BASE + '/bahmni/home/', { waitUntil: 'domcontentloaded' });
    for (const [title, user] of [['Reception', 'demo.reception'], ['Doctor', 'demo.doctor'], ['Laboratory', 'demo.lab'], ['Cashier', 'demo.cashier'], ['Administrator', 'demo.admin']]) {
      log.length = 0;
      const t0 = Date.now();
      await clickCard(page, title);
      const u = await who(page);
      ok(`${title} after switching`, u === user, `${Date.now() - t0} ms; user=${u}; url=${page.url()}`);
      if (u !== user) {
        await shot(page, `switch-fail-${user}`);
        console.log('  login page state:', await page.evaluate(() => JSON.stringify({ hash: location.hash, user: (document.getElementById('username') || {}).value,
          spinner: !!document.querySelector('#overlay, .spinner, [class*=spinner]'), autoloc: sessionStorage.getItem('vipers.autoloc') })));
        console.log('  ' + log.slice(-25).join('\n  '));
        await page.goto(BASE + '/bahmni/home/', { waitUntil: 'domcontentloaded' });
        continue;
      }
      await logout(page);
      ok(`${title} logout returns to cards`, /login/.test(page.url()), page.url());
    }
  } catch (e) { ok('flow', false, e.message.split('\n')[0]); console.log('  ' + log.slice(-25).join('\n  ')); }
  if (errors.length) console.log('errors: ' + errors.slice(0, 5).join(' | '));
  await b.close();
  console.log('RESULTS ' + JSON.stringify(results));
})();
