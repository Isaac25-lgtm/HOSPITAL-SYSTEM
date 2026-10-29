// Probe: why does sign-in take ~46 s? Replays tests/lib.js login() step by step with timings.
const { browser, BASE, showPasswordForm, passGate } = require('./lib');
(async () => {
  const { b, page } = await browser({ width: 1366, height: 768 });
  const T = Date.now(), mark = s => console.log(`${String(Date.now() - T).padStart(6)} ms  ${s}`);
  const errs = []; page.on('console', m => { if (m.type() === 'error') errs.push(m.text().slice(0, 120)); });
  const open = new Map();
  page.on('request', r => open.set(r, Date.now()));
  page.on('requestfinished', r => open.delete(r)); page.on('requestfailed', r => open.delete(r));
  await passGate(page); mark('passGate (goto /bahmni/home/)');
  await showPasswordForm(page); mark('showPasswordForm');
  await page.waitForSelector('#username, input[name=username], input[type=text]', { timeout: 90000 }); mark('username field');
  await page.fill('#username, input[name=username]', 'demo.doctor'); await page.fill('#password, input[name=password], input[type=password]', 'arsenal'); mark('filled');
  const loc = page.locator('select#location, select[name=location]');
  if (await loc.count()) mark('login-page location select present');
  await page.click('button[type=submit], button:has-text("Login"), input[type=submit]'); mark('clicked submit');
  await page.waitForURL(/dashboard|loginLocation|bahmni-v2\/home/, { timeout: 90000 }).catch(() => {}); mark('url -> ' + page.url().replace(BASE, ''));
  if (page.url().includes('loginLocation')) {
    const sel = page.locator('select').last(); await sel.waitFor(); mark('location select visible');
    const vals = await sel.locator('option').evaluateAll(os => os.map(o => o.value).filter(v => v && !/^\?|^$/.test(v)));
    if (vals.length) await sel.selectOption(vals[0]); mark('selected ' + vals[0]);
    await page.click('button:has-text("Continue")'); mark('clicked Continue');
    await page.waitForURL(/dashboard|bahmni-v2\/home/, { timeout: 90000 }).catch(() => {}); mark('url -> ' + page.url().replace(BASE, ''));
  }
  await page.waitForTimeout(10000);
  console.log('still open 10 s after Home:', JSON.stringify([...open.entries()].map(([r, t]) => `${r.method()} ${r.url().replace(BASE, '')} (${Math.round((Date.now() - t) / 1000)} s)`)));
  console.log('in-page timing:', JSON.stringify(await page.evaluate(async () => {
    const t = async u => { const a = performance.now(); try { const r = await fetch(u, { cache: 'no-store', signal: AbortSignal.timeout(20000) }); return u + ' ' + r.status + ' ' + Math.round(performance.now() - a) + 'ms'; } catch (e) { return u + ' ' + e.name + ' ' + Math.round(performance.now() - a) + 'ms'; } };
    const out = [await t('/vipers-assets/site.json'), await t('/vipers-assets/nope.json'), await t('/vipers-assets/favicon.svg')];
    const protos = performance.getEntriesByType('resource').filter(e => /vipers-assets/.test(e.name)).map(e => e.name.split('/').pop() + ':' + e.nextHopProtocol + ':' + Math.round(e.duration) + 'ms');
    return { out, protos: protos.slice(-6) };
  })));
  const seen = {}; const onReq = r => { const u = r.url().replace(BASE, '').split('?')[0]; seen[u] = (seen[u] || 0) + 1; };
  page.on('request', onReq);
  await page.waitForTimeout(15000);
  page.off('request', onReq);
  console.log('requests in the 15 s after Home loaded:', JSON.stringify(Object.entries(seen).sort((a, b) => b[1] - a[1]).slice(0, 10)));
  const fails = []; page.on('response', r => { if (r.status() >= 400) fails.push(r.status() + ' ' + r.url().replace(BASE, '')); });
  await page.reload({ waitUntil: 'domcontentloaded' }); await page.waitForTimeout(6000);
  console.log('4xx/5xx on Home load:', [...new Set(fails)].slice(0, 6).join(' || ') || 'none');
  const skip = page.locator('#vipers-root .vp-tour button:has-text("Skip")');
  if (await skip.waitFor({ timeout: 3000 }).then(() => true).catch(() => false)) { await skip.click(); mark('tour skipped'); } else mark('no tour');
  console.log('errors:', errs.slice(0, 4).join(' || ') || 'none');
  await b.close();
})();
