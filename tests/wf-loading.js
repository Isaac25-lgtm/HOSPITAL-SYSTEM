// Cold cache: "Loading VIPERS HOSPITAL..." shows from first paint (vipers.css) and is cleared once the module renders (html.vp-ready).
const { browser, login, BASE } = require('./lib');
const results = [];
const ok = (name, pass, detail = '') => { results.push({ name, pass, detail }); console.log(`${pass ? 'PASS' : 'FAIL'} | ${name} | ${detail}`); };
const hint = page => page.evaluate(() => document.documentElement.classList.contains('vp-ready') ? 'ready'
  : getComputedStyle(document.documentElement, '::after').content).catch(() => 'n/a');
(async () => {
  const { b, ctx, page, errors } = await browser();
  await login(page, 'demo.doctor', 'arsenal');
  for (const [name, path, ready] of [['Clinical (legacy)', '/bahmni/clinical/index.html#/default/patient/search', 'text=Active'],
                                     ['Appointments (legacy)', '/appointments/#/home/manage/summary', 'text=Specialities'],
                                     ['Patient dashboard (2.0)', '/bahmni-v2/home/', 'text=Clinical']]) {
    const t0 = Date.now();
    await page.goto(BASE + path, { waitUntil: 'commit' });
    await page.waitForSelector('body', { timeout: 30000 });
    const early = await hint(page);
    await page.waitForSelector(ready, { timeout: 90000 }).catch(() => {});
    const done = await page.waitForFunction(() => document.documentElement.classList.contains('vp-ready'), null, { timeout: 10000 }).then(() => true).catch(() => false);
    ok(`${name}: hint at first paint = ${early}; cleared after render`, /Loading/.test(early) || early === 'ready', `cleared=${done}, ready after ${Date.now() - t0} ms`);
    if (!done) results[results.length - 1].pass = false;
  }
  if (errors.length) console.log('errors: ' + errors.slice(0, 3).join(' | '));
  await b.close();
  console.log('RESULTS ' + JSON.stringify(results));
})();
