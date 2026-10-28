// Exploration: how to log out from the 2.0 home.
const { browser, login, shot, BASE } = require('./lib');
(async () => {
  const { b, page } = await browser({ width: 1366, height: 900 });
  await login(page, 'demo.admin', 'fulham');
  await page.goto(BASE + '/bahmni-v2/home/', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(4000);
  const hdr = await page.$$eval('header button, header a, [class*=header] button', es => es.map(e => `${e.tagName} id=${e.id} vis=${!!e.offsetParent} "${(e.innerText || e.getAttribute('aria-label') || '').trim().slice(0, 30)}"`));
  console.log('HEADER', JSON.stringify(hdr));
  const btn = page.locator('header button').last();
  await btn.click({ timeout: 10000 }).catch(e => console.log('click err', e.message.split('\n')[0]));
  await page.waitForTimeout(1200);
  await shot(page, 'x-usermenu');
  const items = await page.$$eval('body *', es => es.filter(e => e.offsetParent && e.children.length === 0 && /log ?out|sign ?out/i.test(e.innerText || '')).map(e => `${e.tagName}.${e.className} "${e.innerText.trim()}"`));
  console.log('LOGOUT CANDIDATES', JSON.stringify(items));
  await b.close();
})();
