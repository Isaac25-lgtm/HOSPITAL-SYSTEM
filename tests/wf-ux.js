// UX checks at 4 viewports: screenshots, VIPERS controls must not cover page controls, no horizontal page scroll.
const { browser, login, shot, BASE } = require('./lib');
const R = [];
const ok = (step, pass, note = '') => { R.push({ step, pass, note }); console.log(`${pass ? 'PASS' : 'FAIL'} | ${step}${note ? ' | ' + note : ''}`); };
const VIEWPORTS = [['desktop-1920', 1920, 1080], ['laptop-1366', 1366, 768], ['tablet-820', 820, 1180], ['mobile-390', 390, 844]];

const check = page => page.evaluate(() => {
  const ours = [...document.querySelectorAll('#vipers-root .vp-fabs button, #vipers-root .vp-badge, #vipers-root .vp-topswitch')].map(e => e.getBoundingClientRect()).filter(r => r.width);
  const theirs = [...document.querySelectorAll('button, input, select, textarea, a')].filter(e => e.offsetParent && !e.closest('#vipers-root') && e.getBoundingClientRect().width > 0 && getComputedStyle(e).visibility !== 'hidden' && !(e.closest('.cds--modal') && !e.closest('.cds--modal.is-visible')))
    .map(e => ({ r: e.getBoundingClientRect(), t: (e.innerText || e.placeholder || e.getAttribute('aria-label') || e.tagName).trim().slice(0, 30) }));
  const hit = [];
  for (const o of ours) for (const t of theirs) {
    const x = Math.max(0, Math.min(o.right, t.r.right) - Math.max(o.left, t.r.left)), y = Math.max(0, Math.min(o.bottom, t.r.bottom) - Math.max(o.top, t.r.top));
    if (x * y > 40 && t.r.top < innerHeight && t.r.bottom > 0) hit.push(t.t);
  }
  return { hscroll: document.documentElement.scrollWidth > innerWidth + 2, overlaps: [...new Set(hit)], minFont: Math.min(...[...document.querySelectorAll('#vipers-root *')].filter(e => e.offsetParent && e.childNodes.length && e.innerText).map(e => parseFloat(getComputedStyle(e).fontSize))) };
});

(async () => {
  const P = process.env.PATIENT;
  for (const [name, w, h] of VIEWPORTS) {
    const { b, page } = await browser({ width: w, height: h });
    try {
      await login(page, 'demo.doctor', 'arsenal');
      const pages = [['home', BASE + '/bahmni-v2/home/'], ['search', BASE + '/bahmni-v2/registration/search'], ['dashboard', `${BASE}/bahmni-v2/clinical/${P}`]];
      for (const [pn, url] of pages) {
        await page.goto(url, { waitUntil: 'domcontentloaded' }); await page.waitForTimeout(4500);
        let c = await check(page);
        await shot(page, `ux-${name}-${pn}`);
        let note = c.overlaps.length ? `at top of page: ${c.overlaps.join(', ')}` : 'no overlap';
        if (c.overlaps.length) {
          // content passing under floating buttons is fine if it can be scrolled clear
          await page.evaluate(() => { window.scrollTo(0, document.body.scrollHeight); document.querySelectorAll('*').forEach(e => { if (e.scrollHeight > e.clientHeight + 20 && /auto|scroll/.test(getComputedStyle(e).overflowY)) e.scrollTop = e.scrollHeight; }); });
          await page.waitForTimeout(600);
          const after = await check(page);
          note += after.overlaps.length ? `; still covered after scrolling: ${after.overlaps.join(', ')}` : '; clear after scrolling to the end';
          c = after;
        }
        ok(`${name} ${pn}: VIPERS controls never permanently cover page controls`, c.overlaps.length === 0, note);
        ok(`${name} ${pn}: no horizontal scrolling introduced`, !c.hscroll);
      }
      // consultation pad with the AI panel open: Done must stay clickable
      await page.locator('button:has-text("New Consultation"), button:has-text("Continue Consultation")').first().click();
      await page.waitForSelector('#diagnoses-search', { timeout: 30000 }); await page.waitForTimeout(1500);
      await page.click('#vipers-root .vp-ai-btn');
      const done = page.locator('button:has-text("Done")').last();
      const box = await done.boundingBox();
      const top = box && await page.evaluate(([x, y]) => { const e = document.elementFromPoint(x, y); return e && (e.closest('#vipers-root') ? 'VIPERS' : (e.innerText || '').trim().slice(0, 20)); }, [box.x + box.width / 2, box.y + box.height / 2]);
      ok(`${name} consultation: Done button remains reachable with Ask Vipers AI open`, top === 'Done', `element at Done centre: ${top}`);
      await shot(page, `ux-${name}-consult-ai-open`);
      await page.click('#vipers-root .vp-ai .vp-x');
      await page.locator('button:has-text("Cancel")').last().click().catch(() => {});
    } catch (e) { ok(`${name}: unexpected error`, false, e.message.split('\n')[0]); await shot(page, `ux-${name}-fail`); }
    await b.close();
  }
  console.log('RESULTS', JSON.stringify(R));
})();
