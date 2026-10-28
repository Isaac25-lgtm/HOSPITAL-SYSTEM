// Exploration: Crater header logo element and item-row selector markup.
const { browser, passGate, BASE } = require('./lib');
const BILL = BASE.replace('://demo.', '://billing.');
(async () => {
  const { b, page } = await browser({ width: 1366, height: 900 });
  await passGate(page, BILL + '/');
  await page.fill('input[type=email]', 'demo.cashier@vipers.demo');
  await page.fill('input[type=password]', 'everton');
  await page.click('button[type=submit]');
  await page.waitForURL(/admin\/dashboard/);
  await page.goto(BILL + '/admin/invoices/create', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3500);
  console.log('HEADER LOGO HTML:', (await page.evaluate(() => { const h = document.querySelector('header') || document.body; const a = h.querySelector('a'); return a ? a.outerHTML.slice(0, 600) : 'none'; })));
  console.log('ITEM ROW HTML:', (await page.evaluate(() => { const r = [...document.querySelectorAll('tr, [class*=item]')].find(e => /Type Item Description/.test(e.innerText || '')); return r ? r.outerHTML.replace(/\s+/g, ' ').slice(0, 1500) : 'none'; })));
  await b.close();
})();
