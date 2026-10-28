// Exploration pass 7: consultation pad sections, Vitals form, diagnosis entry point.
const { browser, login, shot, BASE } = require('./lib');
const dump = (page, scope = 'body') => page.evaluate(sc => {
  const root = document.querySelector(sc) || document.body;
  const vis = e => e.offsetParent !== null && !e.closest('#vipers-root');
  const t = s => (s || '').trim().replace(/\s+/g, ' ').slice(0, 60);
  return [...root.querySelectorAll('input, select, textarea, button, [role=tab], [role=combobox], h1, h2, h3, h4, h5, legend, label')].filter(vis)
    .map(e => `${e.tagName.toLowerCase()}${e.id ? '#' + e.id : ''} "${t(e.innerText || e.placeholder || e.getAttribute('aria-label') || e.value)}"`).slice(0, 150);
}, scope);
(async () => {
  const P = process.env.PATIENT || '37ecfa82-1755-44c3-9c50-60638f39a53c';
  const { b, page, errors } = await browser({ width: 1366, height: 900 });
  await login(page, 'demo.doctor', 'arsenal');
  await page.goto(`${BASE}/bahmni-v2/clinical/${P}`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('button:has-text("New Consultation"), button:has-text("Consultation in progress")', { timeout: 60000 });
  await page.waitForTimeout(1500);
  const nc = page.locator('button:has-text("New Consultation")');
  if (await nc.count()) await nc.click();
  await page.waitForSelector('text=Order Investigations/Procedures');
  await page.waitForTimeout(1500);
  await shot(page, 'c-consult-lift');
  // scroll the pad to the bottom and list everything in it
  await page.mouse.move(950, 500); for (let i = 0; i < 8; i++) { await page.mouse.wheel(0, 600); await page.waitForTimeout(200); }
  await shot(page, 'c-consult-bottom');
  console.log('PAD (all visible after scroll)\n' + (await dump(page)).filter(l => !/ccs-|Order Name|Ordered|Status/.test(l)).join('\n'));
  // open the pinned Vitals form
  const vit = page.locator('text=/^Vitals$/').last();
  if (await vit.count()) { await vit.click(); await page.waitForTimeout(3000); await shot(page, 'c-vitals'); console.log('AFTER VITALS CLICK\n' + (await dump(page)).filter(l => !/ccs-|Order Name|Ordered|Status/.test(l)).slice(-60).join('\n')); }
  console.log('ERRORS', errors.slice(0, 6).join(' || '));
  await b.close();
})();
