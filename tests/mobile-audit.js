// Mobile audit (390x844, touch): screenshot key screens and list elements that overflow the viewport.
const { chromium } = require('playwright');
const { passGate, BASE } = require('./lib');
const fs = require('fs');
const BILL = BASE.replace('://demo.', '://billing.');
const W = +(process.env.W || 390), H = +(process.env.H || 844);
const P = process.env.PATIENT;

async function mobile() {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'en-GB', timezoneId: 'Africa/Kampala',
    userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36' });
  const page = await ctx.newPage(); page.setDefaultTimeout(45000);
  return { b, page };
}
const overflow = page => page.evaluate(w => {
  const out = [];
  for (const e of document.querySelectorAll('body *')) {
    if (!e.offsetParent || e.closest('#vipers-root')) continue;
    const r = e.getBoundingClientRect();
    if (r.width > 0 && (r.right > w + 2 || r.left < -2)) {
      const cls = (typeof e.className === 'string' ? e.className : '').split(/\s+/).filter(Boolean).slice(0, 3).join('.');
      const parentOverflowing = e.parentElement && e.parentElement.getBoundingClientRect().right > w + 2;
      if (!parentOverflowing) out.push(`${e.tagName.toLowerCase()}${e.id ? '#' + e.id : ''}${cls ? '.' + cls : ''} [${Math.round(r.left)}..${Math.round(r.right)}] "${(e.innerText || '').trim().slice(0, 25)}"`);
    }
  }
  return { docWidth: document.documentElement.scrollWidth, items: out.slice(0, 12) };
}, W);

async function loginMobile(page, u, p) {
  await passGate(page);
  await page.waitForSelector('#username');
  await page.fill('#username', u); await page.fill('#password', p);
  await page.click('button[type=submit]');
  await page.waitForURL(/loginLocation|bahmni-v2\/home/, { timeout: 60000 });
  if (page.url().includes('loginLocation')) {
    const sel = page.locator('select').last();
    const vals = await sel.locator('option').evaluateAll(os => os.map(o => o.value).filter(v => v && !/^\?/.test(v)));
    await sel.selectOption(vals[0]); await page.click('button:has-text("Continue")');
    await page.waitForURL(/bahmni-v2\/home/, { timeout: 60000 });
  }
  const skip = page.locator('#vipers-root .vp-tour button:has-text("Skip")');
  if (await skip.waitFor({ timeout: 3000 }).then(() => true).catch(() => false)) await skip.click();
}

(async () => {
  const tag = process.env.TAG || 'before';
  const report = {};
  const visit = async (page, name, url, after) => {
    try {
      if (url) await page.goto(url, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(4000);
      if (after) await after(page);
      const o = await overflow(page);
      report[name] = o;
      await page.screenshot({ path: `/t/out/m-${tag}-${name}.png` });
      console.log(`== ${name}: docWidth=${o.docWidth}${o.docWidth > W + 2 ? ' (HORIZONTAL SCROLL)' : ''}\n   ${o.items.join('\n   ')}`);
    } catch (e) { console.log(`== ${name}: ERROR ${e.message.split('\n')[0]}`); }
  };
  let { b, page } = await mobile();
  await passGate(page); await page.waitForTimeout(3000);
  await visit(page, 'login', null);
  await loginMobile(page, 'demo.doctor', 'arsenal');
  await visit(page, 'home', BASE + '/bahmni-v2/home/');
  await visit(page, 'search', BASE + '/bahmni-v2/registration/search');
  await visit(page, 'register', BASE + '/bahmni-v2/registration/patient/new');
  await visit(page, 'dashboard', `${BASE}/bahmni-v2/clinical/${P}`);
  await visit(page, 'consult', null, async pg => { await pg.locator('button:has-text("New Consultation"), button:has-text("Continue Consultation")').first().click(); await pg.waitForSelector('#diagnoses-search'); });
  await visit(page, 'clinical-search', BASE + '/bahmni/clinical/index.html#/default/patient/search');
  await visit(page, 'appointments', BASE + '/appointments/#/home/manage/appointments/list');
  await visit(page, 'documents', `${BASE}/bahmni-v2/patient-documents/${P}?encounterType=Patient%20Document&topLevelConcept=Patient%20Document&defaultOption=Patient%20file`);
  await b.close();
  ({ b, page } = await mobile());
  await loginMobile(page, 'demo.lab', 'chelsea');
  await visit(page, 'lab-queue', BASE + '/lab');
  await visit(page, 'lab-patient', `${BASE}/lab/patient/${process.env.PATIENT2 || P}`);
  await b.close();
  ({ b, page } = await mobile());
  await passGate(page, BILL + '/');
  await page.fill('input[type=email]', 'demo.cashier@vipers.demo'); await page.fill('input[type=password]', 'everton'); await page.click('button[type=submit]');
  await page.waitForURL(/admin\/dashboard/);
  await visit(page, 'billing-dashboard', null);
  await visit(page, 'billing-invoice-new', BILL + '/admin/invoices/create');
  await b.close();
  fs.writeFileSync(`/t/out/mobile-audit-${tag}.json`, JSON.stringify(report, null, 1));
})();
