// Per-section load cost: network bytes and requests on the first visit vs a repeat visit (browser cache).
const { browser, login, passGate, BASE } = require('./lib');
const BILL = BASE.replace('://demo.', '://billing.');

async function meter(page) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Network.enable');
  const st = { bytes: 0, net: 0, cached: 0 };
  const cachedIds = new Set();
  cdp.on('Network.requestServedFromCache', e => cachedIds.add(e.requestId));
  cdp.on('Network.responseReceived', e => { if (e.response.fromDiskCache || e.response.fromMemoryCache || e.response.fromPrefetchCache) cachedIds.add(e.requestId); });
  cdp.on('Network.loadingFinished', e => { if (cachedIds.has(e.requestId)) st.cached++; else { st.net++; st.bytes += e.encodedDataLength; } });
  return { reset: () => { st.bytes = 0; st.net = 0; st.cached = 0; }, get: () => ({ ...st }) };
}

async function visit(page, m, url, ready) {
  m.reset();
  const t = Date.now();
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector(ready, { timeout: 60000 }).catch(() => {});
  await page.waitForLoadState('networkidle').catch(() => {});
  const r = m.get();
  return { ms: Date.now() - t, kb: Math.round(r.bytes / 1024), net: r.net, cached: r.cached };
}

(async () => {
  const P = process.env.PATIENT;
  const sections = [
    ['Home', '/bahmni-v2/home/', 'text=Registration'],
    ['Registration search', '/bahmni-v2/registration/search', 'text=Create New Patient'],
    ['New patient form', '/bahmni-v2/registration/patient/new', '#first-name'],
    ['Clinical patient list', '/bahmni/clinical/index.html#/default/patient/search', 'text=/Active/'],
    ['Patient dashboard', `/bahmni-v2/clinical/${P}`, 'text=Basic Details'],
    ['Appointments', '/appointments/#/home/manage/summary', 'text=Services'],
    ['Patient documents', `/bahmni-v2/patient-documents/${P}?encounterType=Patient%20Document&topLevelConcept=Patient%20Document&defaultOption=Patient%20file`, 'text=Documents'],
    ['Admin', '/bahmni/admin/#/dashboard', 'text=Audit Log'],
    ['Form builder', '/implementer-interface/#/form-builder', 'text=/Vitals|Create a Form/'],
    ['Reports', '/bahmni/reports/#/dashboard/reports', 'text=Reports'],
  ];
  const rows = [];
  let { b, page } = await browser({ width: 1366, height: 768 });
  let m = await meter(page);
  await login(page, 'demo.admin', 'fulham');
  for (const [n, u, sel] of sections) {
    const first = await visit(page, m, BASE + u, sel);
    await page.goto(BASE + '/vipers-assets/about.html');
    const again = await visit(page, m, BASE + u, sel);
    rows.push({ section: n, first, again });
  }
  await b.close();
  ({ b, page } = await browser({ width: 1366, height: 768 }));
  m = await meter(page);
  await login(page, 'demo.lab', 'chelsea');
  for (const [n, u, sel] of [['Lab queue', '/lab', 'text=Active Patient List'], ['Lab patient', `/lab/patient/${P}`, 'text=Reports table']]) {
    const first = await visit(page, m, BASE + u, sel);
    await page.goto(BASE + '/vipers-assets/about.html');
    rows.push({ section: n, first, again: await visit(page, m, BASE + u, sel) });
  }
  await b.close();
  ({ b, page } = await browser({ width: 1366, height: 768 }));
  m = await meter(page);
  await passGate(page, BILL + '/');
  await page.fill('input[type=email]', 'demo.cashier@vipers.demo'); await page.fill('input[type=password]', 'everton'); await page.click('button[type=submit]');
  await page.waitForURL(/admin\/dashboard/);
  for (const [n, u, sel] of [['Billing dashboard', '/admin/dashboard', 'text=Amount Due'], ['Billing new invoice', '/admin/invoices/create', 'text=New Invoice']]) {
    const first = await visit(page, m, BILL + u, sel);
    await page.goto(BILL + '/vipers-assets/about.html');
    rows.push({ section: n, first, again: await visit(page, m, BILL + u, sel) });
  }
  await b.close();
  console.log('SECTION | first: KB / requests / ms | repeat: KB / network requests / from cache / ms');
  for (const r of rows) console.log(`${r.section} | ${r.first.kb} KB / ${r.first.net} / ${r.first.ms} ms | ${r.again.kb} KB / ${r.again.net} / ${r.again.cached} cached / ${r.again.ms} ms`);
  console.log('JSON ' + JSON.stringify(rows));
})();
