// First visits after the home-page warm-up: how much do Clinical / Appointments / Lab still download?
const { browser, login, BASE } = require('./lib');
(async () => {
  const P = process.env.PATIENT;
  for (const [u, pw, list] of [['demo.doctor', 'arsenal', [['Clinical patient list', '/bahmni/clinical/index.html#/default/patient/search', 'text=/Active/'], ['Appointments', '/appointments/#/home/manage/summary', 'text=Services'], ['Patient dashboard', `/bahmni-v2/clinical/${P}`, 'text=Basic Details']]],
                              ['demo.lab', 'chelsea', [['Lab queue', '/lab', 'text=Active Patient List']]]]) {
    const { b, page } = await browser({ width: 1366, height: 768 });
    const cdp = await page.context().newCDPSession(page); await cdp.send('Network.enable');
    let bytes = 0, prefetched = 0; const cached = new Set();
    cdp.on('Network.requestServedFromCache', e => cached.add(e.requestId));
    cdp.on('Network.responseReceived', e => { if (e.response.fromDiskCache || e.response.fromPrefetchCache || e.response.fromMemoryCache) cached.add(e.requestId); });
    cdp.on('Network.requestWillBeSent', e => { if (e.type === 'Other' && /\.(js|css)$/.test(e.request.url)) prefetched++; });
    cdp.on('Network.loadingFinished', e => { if (!cached.has(e.requestId)) bytes += e.encodedDataLength; });
    await login(page, u, pw);
    bytes = 0;
    await page.waitForTimeout(30000); // user looks at the home page for ~30 s
    console.log(`${u}: background warm-up downloaded ${Math.round(bytes / 1024)} KB (${prefetched} prefetches) while on home`);
    for (const [n, url, sel] of list) {
      bytes = 0; const t = Date.now();
      await page.goto(BASE + url, { waitUntil: 'domcontentloaded' });
      await page.waitForSelector(sel, { timeout: 60000 }).catch(() => {});
      await page.waitForLoadState('networkidle').catch(() => {});
      console.log(`  FIRST visit ${n}: ${Math.round(bytes / 1024)} KB from network, ${Date.now() - t} ms`);
    }
    await b.close();
  }
})();
