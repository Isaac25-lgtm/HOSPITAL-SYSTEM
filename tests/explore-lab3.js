// Exploration: Lab Entry -> Enter Test Results form.
const { browser, login, shot, BASE } = require('./lib');
const dump = page => page.evaluate(() => {
  const vis = e => e.offsetParent !== null && !e.closest('#vipers-root');
  const t = s => (s || '').trim().replace(/\s+/g, ' ').slice(0, 60);
  return [...document.querySelectorAll('input, select, textarea, button, [role=combobox], [role=option], h1, h2, h3, h4, label, td, th')].filter(vis)
    .map(e => `${e.tagName.toLowerCase()}${e.id ? '#' + e.id : ''}${e.type ? '(' + e.type + ')' : ''} "${t(e.innerText || e.placeholder || e.getAttribute('aria-label') || e.value)}"`).slice(0, 100);
});
(async () => {
  const { b, page, errors } = await browser({ width: 1366, height: 900 });
  await login(page, 'demo.lab', 'chelsea');
  await page.goto(`${BASE}/lab/patient/${process.env.PATIENT}`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('text=Pending Lab Orders');
  await page.waitForTimeout(2000);
  await page.locator('tr', { hasText: 'RDT malaria' }).locator('label').first().click();
  await page.waitForTimeout(600);
  await page.click('button:has-text("Enter Test Results")');
  await page.waitForTimeout(3000);
  await shot(page, 'l-entry');
  console.log('ENTRY FORM\n' + (await dump(page)).join('\n'));
  console.log('ERRORS', errors.slice(0, 6).join(' || '));
  await b.close();
})();
