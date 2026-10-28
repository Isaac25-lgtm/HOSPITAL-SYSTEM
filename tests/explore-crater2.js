// Exploration: Crater create-invoice form.
const { browser, passGate, shot, BASE } = require('./lib');
const BILL = BASE.replace('://demo.', '://billing.');
const dump = page => page.evaluate(() => {
  const vis = e => e.offsetParent !== null && !e.closest('#vipers-root');
  const t = s => (s || '').trim().replace(/\s+/g, ' ').slice(0, 60);
  return [...document.querySelectorAll('input, select, textarea, button, a, h1, h2, h3, label, [role=option], li')].filter(vis)
    .map(e => `${e.tagName.toLowerCase()}${e.id ? '#' + e.id : ''}${e.name ? '[' + e.name + ']' : ''} "${t(e.innerText || e.placeholder || e.getAttribute('aria-label') || e.value)}"`).slice(0, 90);
});
(async () => {
  const { b, page, errors } = await browser({ width: 1366, height: 900 });
  await passGate(page, BILL + '/');
  await page.fill('input[type=email]', 'demo.cashier@vipers.demo');
  await page.fill('input[type=password]', 'everton');
  await page.click('button[type=submit]');
  await page.waitForURL(/admin\/dashboard/);
  await page.goto(BILL + '/admin/invoices/create', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(4000);
  await shot(page, 'b-inv-create');
  console.log('CREATE\n' + (await dump(page)).filter(l => !/^li ""/.test(l)).join('\n'));
  // open customer selector
  await page.locator('text=/New Customer|Select Customer|Customer/i').first().click().catch(e => console.log('cust click', e.message));
  await page.waitForTimeout(1500);
  await shot(page, 'b-inv-customer');
  console.log('CUSTOMER PICKER\n' + (await dump(page)).filter(l => /Agnes|Explore|search|Search|Customer/i.test(l)).join('\n'));
  console.log('ERRORS', errors.slice(0, 6).join(' || '));
  await b.close();
})();
