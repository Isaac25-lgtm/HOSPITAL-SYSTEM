// Card edge cases: login page opened while still signed in; double click; Doctor card right after another role without logout.
const { browser, shot, BASE } = require('./lib');
const results = [];
const ok = (name, pass, detail = '') => { results.push({ name, pass, detail }); console.log(`${pass ? 'PASS' : 'FAIL'} | ${name} | ${detail}`); };
const who = page => page.evaluate(() => fetch('/openmrs/ws/rest/v1/session?v=custom:(user:(username))', { headers: { Accept: 'application/json' } })
  .then(r => r.json()).then(s => s.user ? s.user.username : 'none').catch(e => 'err ' + e));
const state = page => page.evaluate(() => {
  const vis = e => e && e.offsetParent !== null && getComputedStyle(e).visibility !== 'hidden';
  const sp = [...document.querySelectorAll('[id*=overlay], [class*=spinner], [class*=loader]')].filter(vis).map(e => `${e.tagName}#${e.id}.${String(e.className).slice(0, 40)}`);
  return { url: location.href, spinners: sp.slice(0, 3) };
});

async function cardClick(page, title, double) {
  await page.waitForSelector('#vp-cards .vp-card', { timeout: 60000 });
  const sel = `#vp-cards .vp-card:has(.vp-card-title:text-is("${title}"))`;
  if (double) await page.dblclick(sel); else await page.click(sel);
  await page.waitForURL(/bahmni-v2\/home|dashboard/, { timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(2500);
}

(async () => {
  const { b, page } = await browser();
  const net = [];
  page.on('request', r => { if (/openmrs\/ws/.test(r.url())) net.push(`>${r.method()} ${r.url().replace(BASE, '').slice(0, 70)}`); });
  page.on('response', r => { if (/openmrs\/ws/.test(r.url())) net.push(`<${r.status()} ${r.url().replace(BASE, '').slice(0, 70)}`); });
  page.on('requestfailed', r => net.push(`FAILED ${r.url().replace(BASE, '').slice(0, 70)} ${r.failure() && r.failure().errorText}`));
  try {
    await page.goto(BASE + '/bahmni/home/', { waitUntil: 'domcontentloaded' });
    await cardClick(page, 'Reception');
    ok('Reception signed in', (await who(page)) === 'demo.reception');

    // 1. open the login page while still signed in (no logout), then click Doctor
    await page.goto(BASE + '/bahmni/home/index.html#/login', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(5000);
    console.log('  login page while signed in:', JSON.stringify(await state(page)), 'cards=', await page.locator('#vp-cards').count());
    if (await page.locator('#vp-cards').count()) {
      net.length = 0;
      await cardClick(page, 'Doctor');
      const u = await who(page);
      ok('Doctor card while Reception still signed in', u === 'demo.doctor', `user=${u} ${JSON.stringify(await state(page))}`);
      if (u !== 'demo.doctor') { console.log('  ' + net.join(' | ')); await shot(page, 'edge-nologout'); }
    }

    // 2. double click on a card from a clean login page
    await page.evaluate(() => fetch('/openmrs/ws/rest/v1/session', { method: 'DELETE' }));
    await page.goto(BASE + '/bahmni/home/index.html#/login', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3000);
    net.length = 0;
    await cardClick(page, 'Laboratory');
    const u2 = await who(page);
    ok('Laboratory card from a clean login page', u2 === 'demo.lab', `user=${u2} ${JSON.stringify(await state(page))}`);
    if (u2 !== 'demo.lab') { console.log('  ' + net.join(' | ')); await shot(page, 'edge-dblclick'); }
  } catch (e) { ok('flow', false, e.message.split('\n')[0]); console.log('  ' + net.slice(-20).join(' | ')); }
  await b.close();
  console.log('RESULTS ' + JSON.stringify(results));
})();
