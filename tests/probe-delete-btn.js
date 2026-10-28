// Probe: is the "Delete account" button in the DOM on a hospital trial server, and is it visible?
const { browser, login, BASE } = require('./lib');
(async () => {
  const { b, page } = await browser({ width: 1366, height: 768 });
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.goto(BASE + '/bahmni/home/index.html#/login', { waitUntil: 'domcontentloaded' });
  await login(page, process.env.HUSER, process.env.HPASS);
  await page.waitForTimeout(4000);
  console.log(JSON.stringify(await page.evaluate(() => {
    const d = document.getElementById('vp-del'), t = document.getElementById('vp-hdr-badge');
    const r = d && d.getBoundingClientRect();
    return { url: location.href, hash: location.hash, hasBtn: !!d, rect: r && [r.x, r.y, r.width, r.height], display: d && getComputedStyle(d).display,
      parent: d && d.parentNode && (d.parentNode.id || d.parentNode.className), badgeParent: t && t.parentNode && t.parentNode.className,
      hdrChildren: t && [...t.parentNode.children].map(c => c.id || c.tagName + '.' + String(c.className).slice(0, 30)) };
  })));
  console.log('page errors:', errs.slice(0, 3).join(' || '));
  await b.close();
})();
