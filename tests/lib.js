// Shared Playwright helpers for VIPERS HOSPITAL acceptance tests (run on the VM in the Playwright container).
const { chromium } = require('playwright');
const fs = require('fs');

const BASE = process.env.BASE || 'https://demo.34-35-115-102.sslip.io';
const BILLING = process.env.BILLING || BASE.replace('://demo.', '://billing.');
const OUT = process.env.OUT || '/t/out';
fs.mkdirSync(OUT, { recursive: true });

async function browser(viewport = { width: 1366, height: 768 }) {
  const b = await chromium.launch();
  // MOBILE=1 runs any test as a phone (390x844, touch, mobile user agent)
  const mobile = process.env.MOBILE === '1';
  const ctx = await b.newContext(mobile
    ? { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2, locale: 'en-GB', timezoneId: 'Africa/Kampala',
        userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36' }
    : { viewport, ignoreHTTPSErrors: false, locale: 'en-GB', timezoneId: 'Africa/Kampala' });
  const page = await ctx.newPage();
  page.setDefaultTimeout(45000);
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('response', r => { if (r.status() >= 500) errors.push(`${r.status()} ${r.url()}`); });
  return { b, ctx, page, errors };
}

async function passGate(page, next = BASE + '/bahmni/home/') {
  await page.goto(next, { waitUntil: 'domcontentloaded' });
  if (page.url().includes('/vipers-gate/')) {
    await page.fill('#code', process.env.GATE_CODE);
    await Promise.all([page.waitForNavigation({ waitUntil: 'domcontentloaded' }), page.click('button[type=submit]')]);
  }
}

// Login pages show one-click role cards and hide the stock form; reveal it (as the
// "Sign in with a username and password instead" link does) so tests can type credentials.
async function showPasswordForm(page) {
  await page.waitForSelector('#username, input[type=email]', { state: 'attached', timeout: 90000 });
  await page.waitForTimeout(800); // cards are added by vipers.js shortly after the form renders
  await page.evaluate(() => document.querySelectorAll('form.vp-cards-mode').forEach(f => f.classList.add('vp-manual')));
}

async function login(page, user, pass) {
  await passGate(page);
  await showPasswordForm(page);
  await page.waitForSelector('#username, input[name=username], input[type=text]', { timeout: 90000 });
  await page.fill('#username, input[name=username]', user);
  await page.fill('#password, input[name=password], input[type=password]', pass);
  const loc = page.locator('select#location, select[name=location]');
  if (await loc.count()) { const opts = await loc.locator('option').allTextContents(); const o = opts.find(t => t.trim() && !/select/i.test(t)); if (o) await loc.selectOption({ label: o.trim() }); }
  const t0 = Date.now();
  await page.click('button[type=submit], button:has-text("Login"), input[type=submit]');
  await page.waitForURL(/dashboard|loginLocation|bahmni-v2\/home/, { timeout: 90000 }).catch(() => {});
  if (page.url().includes('loginLocation')) {
    const sel = page.locator('select').last();
    await sel.waitFor();
    const vals = await sel.locator('option').evaluateAll(os => os.map(o => o.value).filter(v => v && !/^\?|^$/.test(v)));
    if (vals.length) await sel.selectOption(vals[0]);
    await page.click('button:has-text("Continue")');
    await page.waitForURL(/dashboard|bahmni-v2\/home/, { timeout: 90000 }).catch(() => {});
  }
  await page.waitForLoadState('networkidle').catch(() => {});
  const ms = Date.now() - t0;
  // first-login walkthrough: skip it unless the test wants to see it
  if (!process.env.KEEP_TOUR) {
    const skip = page.locator('#vipers-root .vp-tour button:has-text("Skip")');
    if (await skip.waitFor({ timeout: 3000 }).then(() => true).catch(() => false)) await skip.click();
  }
  return ms;
}

async function shot(page, name) { await page.screenshot({ path: `${OUT}/${name}.png` }); return `${name}.png`; }

module.exports = { browser, passGate, showPasswordForm, login, shot, BASE, BILLING, OUT };
