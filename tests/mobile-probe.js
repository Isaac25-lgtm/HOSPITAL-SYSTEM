// Probe layout ancestors on mobile for registration + dashboard header.
const { chromium } = require('playwright');
const { passGate, BASE } = require('./lib');
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const page = await ctx.newPage(); page.setDefaultTimeout(45000);
  await passGate(page); await page.waitForSelector('#username');
  await page.fill('#username', 'demo.doctor'); await page.fill('#password', 'arsenal'); await page.click('button[type=submit]');
  await page.waitForURL(/loginLocation|bahmni-v2\/home/);
  if (page.url().includes('loginLocation')) { const s = page.locator('select').last(); const v = await s.locator('option').evaluateAll(o => o.map(x => x.value).filter(x => x && !/^\?/.test(x))); await s.selectOption(v[0]); await page.click('button:has-text("Continue")'); await page.waitForURL(/bahmni-v2\/home/); }
  const chain = sel => page.evaluate(s => { const out = []; let e = document.querySelector(s); while (e && e !== document.body) { const cs = getComputedStyle(e); const r = e.getBoundingClientRect(); out.push(`${e.tagName.toLowerCase()}.${(typeof e.className === 'string' ? e.className : '').trim().split(/\s+/).join('.')} w=${Math.round(r.width)} x=${Math.round(r.left)} disp=${cs.display} wrap=${cs.flexWrap} ml=${cs.marginLeft} pl=${cs.paddingLeft} maxw=${cs.maxWidth}`); e = e.parentElement; } return out; }, sel);
  await page.goto(BASE + '/bahmni-v2/registration/patient/new', { waitUntil: 'domcontentloaded' }); await page.waitForSelector('#first-name'); await page.waitForTimeout(1500);
  console.log('REGISTRATION #first-name ancestors:\n  ' + (await chain('#first-name')).join('\n  '));
  console.log('ACTION BUTTONS:\n  ' + (await chain('[class*="actionButtons"] button')).slice(0, 3).join('\n  '));
  console.log('HEADER GLOBAL children:\n  ' + (await page.evaluate(() => [...document.querySelector('.cds--header__global').children].map(c => `${c.tagName}.${(c.className || '').toString().slice(0, 60)} w=${Math.round(c.getBoundingClientRect().width)}`))).join('\n  '));
  console.log('HEADER children:\n  ' + (await page.evaluate(() => [...document.querySelector('.cds--header').children].map(c => `${c.tagName}#${c.id}.${(c.className || '').toString().slice(0, 60)} w=${Math.round(c.getBoundingClientRect().width)}`))).join('\n  '));
  await b.close();
})();
