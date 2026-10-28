// Probe: what covers "Start OPD visit" on a phone, and which element scrolls.
const { browser, login, BASE } = require('./lib');
(async () => {
  const { b, page } = await browser();
  await login(page, 'demo.reception', 'liverpool');
  await page.goto(`${BASE}/bahmni-v2/registration/patient/${process.env.PATIENT}`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('button:has-text("Start OPD visit"), button:has-text("Patient Dashboard")');
  await page.waitForTimeout(2000);
  const info = await page.evaluate(() => {
    const btn = [...document.querySelectorAll('button')].find(x => /Start OPD visit|Patient Dashboard/.test(x.innerText));
    btn.scrollIntoView({ block: 'center' });
    const r = btn.getBoundingClientRect();
    const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    const scrollers = [...document.querySelectorAll('*')].filter(e => e.scrollHeight > e.clientHeight + 10 && /auto|scroll/.test(getComputedStyle(e).overflowY)).map(e => `${e.tagName}.${String(e.className).slice(0, 50)}`);
    return { rect: [Math.round(r.top), Math.round(r.bottom), innerHeight], topEl: `${top.tagName}.${String(top.className).slice(0, 60)} in-vipers=${!!top.closest('#vipers-root')}`, scrollers, bodyScroll: document.scrollingElement.scrollHeight + '/' + innerHeight };
  });
  console.log(JSON.stringify(info, null, 1));
  await b.close();
})();
