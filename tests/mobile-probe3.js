// Probe: geometry of the registration action buttons on a phone.
const { browser, login, BASE } = require('./lib');
(async () => {
  const { b, page } = await browser();
  await login(page, 'demo.reception', 'liverpool');
  await page.goto(`${BASE}/bahmni-v2/registration/patient/${process.env.PATIENT}`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('[data-testid="print-registration-card"]'); await page.waitForTimeout(1500);
  console.log(JSON.stringify(await page.evaluate(() => {
    const box = document.querySelector('[class*="styles_actionButtons__"]');
    const walk = (e, d) => [`${'  '.repeat(d)}${e.tagName}.${String(e.className).slice(0, 50)} pos=${getComputedStyle(e).position} disp=${getComputedStyle(e).display} y=${Math.round(e.getBoundingClientRect().top)}..${Math.round(e.getBoundingClientRect().bottom)} x=${Math.round(e.getBoundingClientRect().left)}..${Math.round(e.getBoundingClientRect().right)} "${(e.innerText || '').trim().slice(0, 20)}"`].concat(d < 3 ? [...e.children].flatMap(c => walk(c, d + 1)) : []);
    return walk(box.parentElement, 0);
  }), null, 1));
  await b.close();
})();
