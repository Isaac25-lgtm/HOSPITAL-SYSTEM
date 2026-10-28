// Exploration: Appointments > Admin > services (create service form).
const { browser, login, shot, BASE } = require('./lib');
const dump = page => page.evaluate(() => {
  const vis = e => e.offsetParent !== null && !e.closest('#vipers-root');
  const t = s => (s || '').trim().replace(/\s+/g, ' ').slice(0, 60);
  return [...document.querySelectorAll('input, select, textarea, button, a, h1, h2, h3, label')].filter(vis)
    .map(e => `${e.tagName.toLowerCase()}${e.id ? '#' + e.id : ''}${e.name ? '[' + e.name + ']' : ''}${e.type ? '(' + e.type + ')' : ''} "${t(e.innerText || e.placeholder || e.getAttribute('aria-label') || e.value)}"`).slice(0, 80);
});
(async () => {
  const { b, page, errors } = await browser({ width: 1366, height: 900 });
  await login(page, 'demo.admin', 'fulham');
  await page.goto(BASE + '/appointments/#/home/admin/service', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(4500);
  await shot(page, 'adm-services');
  console.log('SERVICES\n' + (await dump(page)).join('\n'));
  const add = page.locator('button.add-service-btn, button:has-text("Add New Service")').first();
  if (await add.count()) { await add.click(); await page.waitForTimeout(3000); await shot(page, 'adm-service-new'); console.log('NEW SERVICE ' + page.url() + '\n' + (await dump(page)).join('\n')); }
  console.log('ERRORS', errors.slice(0, 6).join(' || '));
  await b.close();
})();
