// Exploration: Lab Entry patient page (pending orders / result entry).
const { browser, login, shot, BASE } = require('./lib');
const dump = page => page.evaluate(() => {
  const vis = e => e.offsetParent !== null && !e.closest('#vipers-root');
  const t = s => (s || '').trim().replace(/\s+/g, ' ').slice(0, 60);
  return [...document.querySelectorAll('input, select, textarea, button, a, [role=tab], h1, h2, h3, h4, label, td, th')].filter(vis)
    .map(e => `${e.tagName.toLowerCase()}${e.id ? '#' + e.id : ''}${e.type ? '(' + e.type + ')' : ''} "${t(e.innerText || e.placeholder || e.getAttribute('aria-label') || e.value)}"`).slice(0, 100);
});
(async () => {
  const { b, page, errors } = await browser({ width: 1366, height: 900 });
  page.on('response', r => { if (r.request().method() !== 'GET' && /openmrs\/ws/.test(r.url()) && !/auditlog|session|\/user\//.test(r.url())) console.log('API', r.request().method(), r.status(), r.url().replace(BASE, '').slice(0, 100)); });
  await login(page, 'demo.lab', 'chelsea');
  await page.goto(BASE + '/lab', { waitUntil: 'domcontentloaded' });
  await page.locator(`a:has-text("${process.env.LAST}")`).first().click();
  await page.waitForTimeout(5000);
  console.log('URL', page.url());
  await shot(page, 'l-patient');
  console.log('PATIENT PAGE\n' + (await dump(page)).join('\n'));
  // try opening result entry for the malaria test
  const t = page.locator('text=/Rapid test for malaria/i').first();
  if (await t.count()) {
    const row = page.locator('tr', { has: t }).first();
    const cb = row.locator('input[type=checkbox]').first();
    if (await cb.count()) { await cb.check({ force: true }).catch(() => {}); console.log('checked row'); }
    await page.waitForTimeout(800);
    const btn = page.locator('button:has-text("Upload Report"), button:has-text("Enter"), button:has-text("Report"), button:has-text("Result")').first();
    if (await btn.count()) { console.log('clicking', await btn.innerText()); await btn.click(); await page.waitForTimeout(3000); }
    await shot(page, 'l-entry');
    console.log('AFTER ENTRY CLICK\n' + (await dump(page)).join('\n'));
  }
  console.log('ERRORS', errors.slice(0, 6).join(' || '));
  await b.close();
})();
