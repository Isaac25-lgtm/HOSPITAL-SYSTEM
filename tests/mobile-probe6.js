// Probe: which unlabelled button sits under the floating VIPERS buttons on the phone dashboard?
const { browser, login, BASE } = require('./lib');
(async () => {
  const { b, page } = await browser();
  await login(page, 'demo.doctor', 'arsenal');
  await page.goto(`${BASE}/bahmni-v2/clinical/${process.env.PATIENT}`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(5000);
  await page.evaluate(() => { window.scrollTo(0, document.body.scrollHeight); document.querySelectorAll('*').forEach(e => { if (e.scrollHeight > e.clientHeight + 20 && /auto|scroll/.test(getComputedStyle(e).overflowY)) e.scrollTop = e.scrollHeight; }); });
  await page.waitForTimeout(800);
  console.log(JSON.stringify(await page.evaluate(() => {
    const ours = [...document.querySelectorAll('#vipers-root .vp-fabs button')].map(e => e.getBoundingClientRect());
    return [...document.querySelectorAll('button')].filter(e => e.offsetParent && !e.closest('#vipers-root')).filter(e => {
      const r = e.getBoundingClientRect(); return ours.some(o => Math.min(o.right, r.right) > Math.max(o.left, r.left) && Math.min(o.bottom, r.bottom) > Math.max(o.top, r.top));
    }).map(e => { const r = e.getBoundingClientRect(); const cs = getComputedStyle(e.parentElement); return { html: e.outerHTML.slice(0, 220), rect: [Math.round(r.left), Math.round(r.top), Math.round(r.right), Math.round(r.bottom)], parent: e.parentElement.className.toString().slice(0, 60), parentPos: cs.position }; });
  }), null, 1));
  await page.screenshot({ path: '/t/out/m-dash-bottom.png' });
  await b.close();
})();
