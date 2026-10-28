// Probe: does the VIPERS layer run on the legacy clinical screen and the 2.0 patient dashboard? (page errors, root, ready)
const { browser, login, BASE } = require('./lib');
(async () => {
  const { b, page } = await browser({ width: 1366, height: 900 });
  const errs = []; page.on('pageerror', e => errs.push(e.message.slice(0, 160)));
  page.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text().slice(0, 160)); });
  await login(page, 'demo.doctor', 'arsenal');
  for (const path of ['/bahmni/clinical/index.html#/default/patient/search', `/bahmni-v2/clinical/${process.env.PATIENT || ''}`]) {
    errs.length = 0;
    await page.goto(BASE + path, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(12000);
    console.log(path, JSON.stringify(await page.evaluate(() => ({
      root: !!document.getElementById('vipers-root'), ready: document.documentElement.classList.contains('vp-ready'),
      scripts: [...document.scripts].map(s => s.src).filter(s => /vipers/.test(s)), css: [...document.querySelectorAll('link[rel=stylesheet]')].map(l => l.href).filter(h => /vipers/.test(h)),
      text: document.body.innerText.slice(0, 60).replace(/\s+/g, ' ') }))));
    console.log('service workers:', JSON.stringify(await page.evaluate(async () => (navigator.serviceWorker ? (await navigator.serviceWorker.getRegistrations()).map(r => r.scope) : []))));
    console.log('nav entry:', JSON.stringify(await page.evaluate(() => { const n = performance.getEntriesByType('navigation')[0]; return n && { type: n.type, transfer: n.transferSize, enc: n.encodedBodySize }; })));
    console.log('errors:', errs.slice(0, 5).join(' || '));
  }
  await b.close();
})();
