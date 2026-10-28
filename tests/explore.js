// One-off exploration: capture the real UI structure so help text matches actual screens.
const { browser, passGate, login, shot, BASE } = require('./lib');

(async () => {
  const { b, page, errors } = await browser();
  page.on('framenavigated', f => { if (f === page.mainFrame()) console.log('NAV', f.url()); });
  page.on('requestfailed', r => console.log('REQFAIL', r.url().slice(0, 150), r.failure() && r.failure().errorText));
  const ms = await login(page, 'superman', process.env.OWNER_PW);
  console.log('LOGIN ms', ms, 'URL', page.url());
  await page.waitForTimeout(3000);
  await shot(page, 'x-home');
  const tiles = await page.$$eval('a', as => as.filter(a => a.offsetParent).map(a => `${(a.innerText || '').trim().replace(/\s+/g, ' ')} => ${a.getAttribute('href')}`).filter(s => !s.startsWith(' =>')));
  console.log('HOME LINKS\n' + tiles.join('\n'));
  console.log('HOME TEXT', (await page.innerText('body').catch(() => '')).replace(/\s+/g, ' ').slice(0, 1200));
  console.log('ERRORS', errors.slice(0, 10).join('\n'));
  await b.close();
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
