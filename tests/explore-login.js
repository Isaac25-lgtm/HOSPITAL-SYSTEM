// Debug: what does the login page show?
const { browser, passGate, shot } = require('./lib');
(async () => {
  const { b, page, errors } = await browser();
  page.on('console', m => { if (m.type() === 'error') console.log('CONSOLE', m.text().slice(0, 200)); });
  page.on('response', r => { if (r.status() >= 400) console.log('HTTP', r.status(), r.url().slice(0, 120)); });
  await passGate(page);
  await page.waitForTimeout(8000);
  console.log('URL', page.url(), 'TITLE', await page.title());
  console.log('BODY', (await page.innerText('body').catch(() => '')).replace(/\s+/g, ' ').slice(0, 400));
  await shot(page, 'x-login-debug');
  console.log('ERRORS', errors.join(' || ').slice(0, 600));
  await b.close();
})();
