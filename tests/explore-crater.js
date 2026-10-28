// Exploration: Crater billing UI as demo.cashier.
const { browser, passGate, shot, BASE } = require('./lib');
const BILL = BASE.replace('://demo.', '://billing.');
const dump = page => page.evaluate(() => {
  const vis = e => e.offsetParent !== null && !e.closest('#vipers-root');
  const t = s => (s || '').trim().replace(/\s+/g, ' ').slice(0, 60);
  return [...document.querySelectorAll('input, select, textarea, button, a, h1, h2, h3, label')].filter(vis)
    .map(e => `${e.tagName.toLowerCase()}${e.id ? '#' + e.id : ''}${e.name ? '[' + e.name + ']' : ''} "${t(e.innerText || e.placeholder || e.getAttribute('aria-label') || e.value)}"${e.getAttribute('href') ? ' ->' + e.getAttribute('href') : ''}`).slice(0, 80);
});
(async () => {
  const { b, page, errors } = await browser({ width: 1366, height: 900 });
  await passGate(page, BILL + '/');
  await page.waitForTimeout(4000);
  console.log('URL', page.url(), 'TITLE', await page.title());
  await shot(page, 'b-login');
  console.log('LOGIN\n' + (await dump(page)).join('\n'));
  await page.fill('input[type=email], input[name=email]', 'demo.cashier@vipers.demo');
  await page.fill('input[type=password]', 'everton');
  await page.click('button[type=submit]');
  await page.waitForTimeout(6000);
  console.log('AFTER LOGIN URL', page.url(), 'TITLE', await page.title());
  await shot(page, 'b-dashboard');
  console.log('DASH\n' + (await dump(page)).join('\n'));
  console.log('ERRORS', errors.slice(0, 6).join(' || '));
  await b.close();
})();
