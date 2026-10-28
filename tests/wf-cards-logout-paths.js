// Log out from different screens, then check the login page is usable (no overlay over the cards) and the Doctor card works.
const { browser, shot, BASE } = require('./lib');
const results = [];
const ok = (name, pass, detail = '') => { results.push({ name, pass, detail }); console.log(`${pass ? 'PASS' : 'FAIL'} | ${name} | ${detail}`); };
const who = page => page.evaluate(() => fetch('/openmrs/ws/rest/v1/session?v=custom:(user:(username))', { headers: { Accept: 'application/json' } })
  .then(r => r.json()).then(s => s.user ? s.user.username : 'none').catch(e => 'err ' + e));
const PAGES = [
  ['v2 registration search', '/bahmni-v2/registration/search'],
  ['v2 new patient form', '/bahmni-v2/registration/patient/new'],
  ['appointments', '/appointments/index.html#/home/manage/summary'],
  ['legacy clinical search', '/bahmni/clinical/index.html#/default/patient/search'],
  ['v2 home', '/bahmni-v2/home/']
];

async function card(page, title) {
  await page.waitForSelector('#vp-cards .vp-card', { timeout: 60000 });
  await page.click(`#vp-cards .vp-card:has(.vp-card-title:text-is("${title}"))`);
  await page.waitForURL(/bahmni-v2\/home|dashboard/, { timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(2500);
  const skip = page.locator('#vipers-root .vp-tour button:has-text("Skip")');
  if (await skip.isVisible().catch(() => false)) await skip.click();
}
async function logoutHere(page) {
  // 2.0 screens: "Hi, ..." menu; legacy screens: user dropdown with a Logout link
  for (const sel of ['#user-global-action-button', 'button:has-text("Hi,")', '.user-name', '.navbar .dropdown-toggle', 'header [class*=user]']) {
    const l = page.locator(sel).first();
    if (await l.isVisible().catch(() => false)) { await l.click().catch(() => {}); await page.waitForTimeout(700); break; }
  }
  const out = page.locator('text=/^\\s*(Logout|Log out|Sign out)\\s*$/i').first();
  if (await out.isVisible().catch(() => false)) { await out.click(); return 'menu'; }
  const link = page.locator('a:has-text("Logout"), a:has-text("Log out")').first();
  if (await link.count()) { await link.evaluate(a => a.click()); return 'hidden link'; }
  return 'none';
}

(async () => {
  for (const [name, path] of PAGES) {
    const { b, page } = await browser();
    const net = [];
    page.on('request', r => { if (/openmrs\/ws/.test(r.url())) net.push(`${r.method()} ${r.url().replace(BASE, '').slice(0, 90)}`); });
    try {
      await page.goto(BASE + '/bahmni/home/', { waitUntil: 'domcontentloaded' });
      await card(page, 'Reception');
      await page.goto(BASE + path, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(6000);
      const how = await logoutHere(page);
      await page.waitForURL(/login/, { timeout: 30000 }).catch(() => {});
      await page.waitForTimeout(5000);
      const st = await page.evaluate(() => {
        const c = [...document.querySelectorAll('#vp-cards .vp-card')].find(e => /Doctor/.test(e.textContent));
        if (!c) return { cards: false, url: location.href };
        const r = c.getBoundingClientRect(), top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
        return { cards: true, url: location.href, blocked: !c.contains(top), topEl: top ? `${top.tagName}#${top.id}.${String(top.className).slice(0, 60)}` : 'none' };
      });
      ok(`${name}: logout (${how}) -> login page with usable cards`, st.cards && !st.blocked, JSON.stringify(st));
      if (!st.cards || st.blocked) await shot(page, `logout-path-${name.replace(/\W+/g, '-')}`);
      net.length = 0;
      await card(page, 'Doctor').catch(e => console.log('  card click:', e.message.split('\n')[0]));
      const u = await who(page);
      ok(`${name}: Doctor card works after that logout`, u === 'demo.doctor', `user=${u}; url=${page.url()}`);
      if (u !== 'demo.doctor') console.log('  requests after click: ' + net.slice(0, 12).join(' | '));
    } catch (e) { ok(`${name}: flow`, false, e.message.split('\n')[0]); }
    await b.close();
  }
  console.log('RESULTS ' + JSON.stringify(results));
})();
