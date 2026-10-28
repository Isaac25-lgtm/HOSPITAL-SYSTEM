// Exploration pass 2: each role's home tiles + a look at every module screen.
const { browser, login, shot, BASE } = require('./lib');

const ROLES = [
  ['demo.reception', 'liverpool', ['/bahmni-v2/registration/search', '/appointments/', '/bahmni/document-upload/']],
  ['demo.doctor', 'arsenal', ['/bahmni/clinical/index.html#/default/patient/search']],
  ['demo.lab', 'chelsea', ['/lab']],
  ['demo.cashier', 'everton', []],
  ['demo.admin', 'fulham', ['/bahmni/admin/#/dashboard/home', '/implementer-interface/#', '/bahmni/reports/#/dashboard']],
];
const visible = page => page.evaluate(() => {
  const vis = e => e.offsetParent !== null;
  const t = s => (s || '').trim().replace(/\s+/g, ' ').slice(0, 60);
  return {
    title: document.title,
    buttons: [...document.querySelectorAll('button, [role=button], input[type=submit]')].filter(vis).filter(b => !b.closest('#vipers-root')).map(b => t(b.innerText || b.value || b.getAttribute('aria-label'))).filter(Boolean).slice(0, 40),
    inputs: [...document.querySelectorAll('input, select, textarea')].filter(vis).filter(b => !b.closest('#vipers-root')).map(i => t(i.getAttribute('placeholder') || i.getAttribute('aria-label') || i.name || i.id)).filter(Boolean).slice(0, 30),
    headings: [...document.querySelectorAll('h1,h2,h3,h4,.cds--tabs__nav-item,[role=tab],legend,label')].filter(vis).filter(b => !b.closest('#vipers-root')).map(h => t(h.innerText)).filter(Boolean).slice(0, 40),
  };
});

(async () => {
  for (const [u, p, urls] of ROLES) {
    const { b, page, errors } = await browser();
    try {
      const ms = await login(page, u, p);
      await page.waitForTimeout(2500);
      const tiles = await page.$$eval('a', as => as.filter(a => a.offsetParent && !a.closest('#vipers-root')).map(a => `${(a.innerText || '').trim().replace(/\s+/g, ' ')}=>${a.getAttribute('href')}`));
      console.log(`\n##### ${u} login ${ms}ms url=${page.url()}\nTILES ${tiles.join(' | ')}`);
      await shot(page, `e-${u}-home`);
      for (const url of urls) {
        await page.goto(BASE + url, { waitUntil: 'domcontentloaded' });
        await page.waitForLoadState('networkidle').catch(() => {});
        await page.waitForTimeout(3500);
        const name = `e-${u}-${url.replace(/[^a-z0-9]+/gi, '_').slice(0, 40)}`;
        await shot(page, name);
        console.log(`--- ${url} -> ${page.url()}\n${JSON.stringify(await visible(page))}`);
      }
      if (errors.length) console.log('ERRORS', errors.slice(0, 6).join(' || '));
    } catch (e) { console.log(`!!! ${u}: ${e.message}`); await shot(page, `e-${u}-fail`).catch(() => {}); }
    await b.close();
  }
})();
