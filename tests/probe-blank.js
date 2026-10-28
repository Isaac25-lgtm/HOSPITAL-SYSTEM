// Probe: what is in <body> while a legacy module is still blank (for the loading hint's content check).
const { browser, login, BASE } = require('./lib');
(async () => {
  const { b, page } = await browser();
  await login(page, 'demo.doctor', 'arsenal');
  await page.goto(BASE + '/bahmni/clinical/index.html#/default/patient/search', { waitUntil: 'commit' });
  for (const ms of [800, 1500, 3000]) {
    await page.waitForTimeout(ms === 800 ? 800 : ms - 800);
    console.log(ms, JSON.stringify(await page.evaluate(() => [...document.body.children].map(k =>
      `${k.tagName}#${k.id}.${String(k.className).slice(0, 30)} h=${k.offsetHeight} txt=${(k.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 50)}`))));
  }
  await b.close();
})();
