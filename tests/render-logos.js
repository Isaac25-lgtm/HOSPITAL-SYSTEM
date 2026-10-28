// Render the SVG brand marks to PNG (for Crater PDFs and Bahmni white-label) inside the Playwright container.
const { chromium } = require('playwright');
const fs = require('fs');
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ deviceScaleFactor: 4 });
  const jobs = [
    ['/assets/logo.svg', '/t/out/vipers-logo.png', 152, 48],
    ['/assets/favicon.svg', '/t/out/vipers-mark.png', 40, 40],
  ];
  for (const [src, out, w, h] of jobs) {
    const svg = fs.readFileSync(src, 'utf8');
    await p.setContent(`<html><body style="margin:0;background:transparent"><div id="x" style="width:${w}px;height:${h}px">${svg}</div></body></html>`);
    await p.locator('#x').screenshot({ path: out, omitBackground: true });
    console.log('rendered', out);
  }
  await b.close();
})();
