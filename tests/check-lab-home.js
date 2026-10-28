// Lab Entry: logo element, history behaviour of /lab -> /lab/home, and whether /lab/home loads directly.
const { browser, login, BASE } = require('./lib');
(async () => {
  const { b, page } = await browser({ width: 1366, height: 768 });
  await login(page, 'demo.lab', 'chelsea');
  await page.goto(BASE + '/bahmni-v2/home/', { waitUntil: 'domcontentloaded' }); await page.waitForTimeout(2000);
  await page.goto(BASE + '/lab', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('text=Active Patient List', { timeout: 60000 });
  console.log('after /lab: url', page.url(), 'history.length', await page.evaluate(() => history.length));
  console.log('LOGO candidates:', JSON.stringify(await page.evaluate(() => [...document.querySelectorAll('img, svg, [style*="background"]')].filter(e => { const r = e.getBoundingClientRect(); return r.width > 150 && r.top < 450; }).map(e => `${e.tagName} src=${(e.getAttribute('src') || '').slice(0, 80)} class=${String(e.className && e.className.baseVal !== undefined ? e.className.baseVal : e.className).slice(0, 50)} w=${Math.round(e.getBoundingClientRect().width)} aria=${e.getAttribute('aria-label') || e.getAttribute('alt') || ''}`))));
  await page.goBack(); await page.waitForTimeout(4000);
  console.log('after Back: url', page.url(), '| content text length', (await page.innerText('body')).trim().length);
  const r = await page.goto(BASE + '/lab/home', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('text=Active Patient List', { timeout: 30000 }).then(() => console.log('direct /lab/home: HTTP', r.status(), 'renders OK')).catch(() => console.log('direct /lab/home: HTTP', r.status(), 'does NOT render'));
  await b.close();
})();
