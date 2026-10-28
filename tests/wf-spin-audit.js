// Endless-spinner audit: every role opens every Home tile and the main inner screens; a screen that still shows a
// loading spinner (or "Loading... Please Wait") after 40 s is reported with the server errors behind it.
//   run-test.sh wf-spin-audit.js PATIENT=<uuid with an active visit>
const { browser, login, showPasswordForm, BASE, BILLING } = require('./lib');
const R = [];
const ok = (step, pass, note = '') => { R.push({ step, pass, note }); console.log(`${pass ? 'PASS' : 'FAIL'} | ${step}${note ? ' | ' + note : ''}`); };
const P = process.env.PATIENT || '';
const ROLES = [['demo.reception', 'liverpool'], ['demo.doctor', 'arsenal'], ['demo.lab', 'chelsea'], ['demo.cashier', 'everton'], ['demo.admin', 'fulham'], ['demo.nurse', 'brighton']];
// inner screens that are not Home tiles (visited by every role that can open them)
const EXTRA = [
  '/bahmni-v2/registration/search', P && `/bahmni-v2/clinical/${P}`, '/bahmni/clinical/index.html#/default/patient/search',
  '/bahmni/adt/#/home', '/bahmni/adt/#/patient/search', '/bahmni/adt/#/home/careViewDashboard',
  '/appointments/#/home/manage/summary', '/appointments/#/home/manage/appointments/list',
  '/bahmni/admin/#/dashboard', '/bahmni/reports/#/dashboard', '/bahmni/home/index.html#/dashboard'].filter(Boolean);
const BILLING_PAGES = ['/admin/dashboard', '/admin/customers', '/admin/items', '/admin/invoices', '/admin/payments', '/admin/expenses', '/admin/reports/sales', '/admin/settings/account-settings'];

const SPIN = '#overlay, .loader, .spinner, .cds--loading, .bx--loading, .cds--loading-overlay, .bx--loading-overlay, .animate-spin';
const spinning = page => page.evaluate(sel => {
  const vis = e => { const r = e.getBoundingClientRect(), cs = getComputedStyle(e); return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none' && +cs.opacity !== 0; };
  return [...document.querySelectorAll(sel)].filter(e => !e.closest('#vipers-root')).some(vis) || /Loading\.{3}\s*Please Wait/i.test(document.body ? document.body.innerText : '');
}, SPIN).catch(() => false);

async function check(page, errors, label, url) {
  errors.length = 0;
  const t0 = Date.now();
  await page.goto(url, { waitUntil: 'domcontentloaded' }).catch(e => errors.push('goto: ' + e.message.split('\n')[0]));
  await page.waitForTimeout(3000);
  let spin = true;
  while (Date.now() - t0 < 40000) { if (!(await spinning(page))) { spin = false; break; } await page.waitForTimeout(1000); }
  // an upstream screen may keep spinning, but the user must be given a way out by the VIPERS banner
  const banner = spin ? await page.locator('#vipers-root .vp-stuck strong').textContent({ timeout: 2000 }).catch(() => '') : '';
  const where = page.url().replace(/^https:\/\/[^/]+/, '');
  const errs = [...new Set(errors)].filter(e => !/favicon/.test(e)).slice(0, 3).map(e => e.replace(/^https:\/\/[^/]+/, '').slice(0, 140));
  ok(`${label} ${url.replace(/^https:\/\/[^/]+/, '')}`, !spin || !!banner, (spin ? (banner ? `upstream spinner, VIPERS banner shown: "${banner}"` : 'STILL SPINNING after 40 s, no way out') : `${((Date.now() - t0) / 1000).toFixed(1)} s`) + (where !== url.replace(/^https:\/\/[^/]+/, '') ? ` -> ${where}` : '') + (errs.length ? ' | errors: ' + errs.join(' ; ') : ''));
}

(async () => {
  for (const [user, pass] of ROLES) {
    const { b, page, errors } = await browser({ width: 1366, height: 768 });
    try {
      await login(page, user, pass);
      await page.goto(BASE + '/bahmni-v2/home/', { waitUntil: 'domcontentloaded' });
      await page.waitForSelector('a[class*="AppTile_tile"]', { timeout: 30000 }).catch(() => {});
      const tiles = await page.$$eval('a[class*="AppTile_tile"]', as => as.map(a => a.href)).catch(() => []);
      const urls = [...new Set([...tiles, ...EXTRA.map(u => BASE + u)])];
      for (const u of urls) await check(page, errors, user, u);
    } catch (e) { ok(`${user}: unexpected error`, false, e.message.split('\n')[0]); }
    await b.close();
  }
  // billing (Crater) as the demo cashier
  const { b, page, errors } = await browser({ width: 1366, height: 768 });
  try {
    await page.goto(BILLING + '/', { waitUntil: 'domcontentloaded' });
    await showPasswordForm(page);
    await page.fill('input[type=email]', 'demo.cashier@vipers.demo');
    await page.fill('input[type=password]', 'everton');
    await Promise.all([page.waitForURL(/admin/, { timeout: 60000 }).catch(() => {}), page.click('button[type=submit]')]);
    for (const p of BILLING_PAGES) await check(page, errors, 'billing', BILLING + p);
  } catch (e) { ok('billing: unexpected error', false, e.message.split('\n')[0]); }
  await b.close();
  const failed = R.filter(r => !r.pass);
  console.log(`SUMMARY ${R.length - failed.length}/${R.length} screens either load or give the user a clear way out`);
  console.log('RESULTS ' + JSON.stringify(R));
})();
