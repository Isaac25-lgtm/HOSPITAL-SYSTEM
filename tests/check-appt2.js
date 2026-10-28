// Which script throws on Appointments after warm-up, and what did the browser get for it?
const { browser, login, BASE } = require('./lib');
(async () => {
  const { b, page } = await browser({ width: 1366, height: 768 });
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Runtime.enable'); await cdp.send('Network.enable');
  const resp = {};
  cdp.on('Network.responseReceived', e => { resp[e.response.url] = `${e.response.status} ${e.response.mimeType} cache=${e.response.fromDiskCache || e.response.fromPrefetchCache}`; });
  cdp.on('Runtime.exceptionThrown', e => { const d = e.exceptionDetails; console.log('EXCEPTION', d.text, d.exception && d.exception.description && d.exception.description.slice(0, 120), 'url=', d.url, 'line', d.lineNumber, '->', resp[d.url]); });
  await login(page, 'demo.doctor', 'arsenal');
  await page.waitForTimeout(process.env.NOWARM ? 1000 : 30000);
  await page.goto(BASE + '/appointments/#/home/manage/summary', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(8000);
  console.log('rendered Services:', await page.locator('text=Services').count());
  const scripts = await page.$$eval('script[src]', s => s.map(x => x.getAttribute('src')));
  console.log('page scripts:', JSON.stringify(scripts.slice(0, 15)));
  for (const s of scripts.slice(0, 15)) { const u = new URL(s, page.url()).href; console.log('  ', s, '->', resp[u] || '(not seen)'); }
  await b.close();
})();
