// Regression checks for the fixes from the 28 Oct 2026 end-to-end QA run.
const { browser, login, showPasswordForm, BASE, BILLING } = require('./lib');
const PATIENT = process.env.PATIENT || '2c1a31f6-ba69-4185-9dd4-63c517d748ca';
const results = [];
const ok = (name, pass, detail = '') => { results.push({ name, pass: !!pass, detail }); console.log(`${pass ? 'PASS' : 'FAIL'} | ${name} | ${detail}`); };
const step = async (name, fn) => { try { await fn(); } catch (e) { ok(name, false, e.message.split('\n')[0]); } };

// a long option inside a narrow Carbon menu must wrap instead of being cut to "An..."
const optionWraps = (page, prefix) => page.evaluate(p => {
  const box = document.createElement('div'); box.style.cssText = 'position:absolute;left:0;top:0;width:120px';
  box.innerHTML = `<div class="${p}--list-box ${p}--list-box--expanded ${p}--dropdown--open"><div class="${p}--list-box__menu"><div class="${p}--list-box__menu-item"><div class="${p}--list-box__menu-item__option">Test not performed due to lack of materials</div></div></div></div>`;
  document.body.appendChild(box);
  const o = box.querySelector(`.${p}--list-box__menu-item__option`), cs = getComputedStyle(o);
  const r = { ws: cs.whiteSpace, overflow: cs.textOverflow, h: o.offsetHeight }; box.remove(); return r;
}, prefix);

(async () => {
  const { b, page, errors } = await browser({ width: 1366, height: 900 });
  await login(page, 'demo.doctor', 'arsenal');

  await step('Doctor dashboard', async () => {
    await page.goto(`${BASE}/bahmni-v2/clinical/${PATIENT}`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('text=Observations', { timeout: 90000 });
    await page.waitForTimeout(4000);
    const t = await page.evaluate(() => (document.querySelector('main') || document.body).innerText);
    const basic = t.slice(t.indexOf('Observations'), t.indexOf('Allergies', t.indexOf('Observations')));
    // vitals recorded by the Doctor test are on screen; Smoking status only shows once a value is recorded, so it is
    // checked in the dashboard configuration that the browser actually receives
    const cfg = await page.evaluate(() => fetch('/bahmni_config/openmrs/apps/clinical/v2/dashboards/general.json', { cache: 'reload' }).then(r => r.text()).catch(() => ''));
    const want = ['Temperature', 'Blood Pressure', 'Respiratory rate', 'oxygen saturation'];
    const missing = want.filter(w => !t.includes(w)).concat(cfg.includes('Smoking status') ? [] : ['Smoking status (config)']);
    ok('Dashboard shows all vitals + smoking status', missing.length === 0, missing.length ? 'missing: ' + missing.join(', ') : 'all present');
    ok('Radiology tab removed', !/Radiology Investigations/.test(t));
    const w = await optionWraps(page, 'cds');
    ok('2.0 dropdown options wrap (not "An...")', w.ws === 'normal' && w.overflow !== 'ellipsis' && w.h > 30, JSON.stringify(w));
  });

  await step('Config caching', async () => {
    const cc = await page.evaluate(() => fetch('/bahmni_config/openmrs/apps/clinical/v2/dashboards/general.json').then(r => r.headers.get('cache-control')));
    ok('Config files revalidate (Cache-Control: no-cache)', cc === 'no-cache', String(cc));
  });

  await step('Lab Entry dropdowns', async () => {
    const w = await optionWraps(page, 'bx');
    ok('Lab Entry dropdown options readable (widened or wrapped, never cut)', w.ws === 'normal' && w.overflow !== 'ellipsis' && w.h > 0, JSON.stringify(w));
    const c = await page.evaluate(() => fetch('/openmrs/ws/rest/v1/concept/1643AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA?v=custom:(names:(name,conceptNameType))').then(r => r.json()));
    ok('Malaria test has no "RDT malaria" short name (Lab shows full name)', !c.names.some(n => n.conceptNameType === 'SHORT'), JSON.stringify(c.names));
  });

  await step('Appointments wording', async () => {
    await page.goto(`${BASE}/appointments/#/home/manage/summary`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('text=Specialities', { timeout: 60000 });
    await page.waitForTimeout(1500);
    const t = await page.evaluate(() => document.body.innerText);
    ok('Appointments: misleading "no appointments ... Providers" text replaced', !/any of the Providers/.test(t));
  });

  await step('Ask Vipers AI', async () => {
    const a = await page.evaluate(() => fetch('/vipers-ai/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question: 'How do I make an invoice for a patient?', page: 'home', role: 'Cashier' }) }).then(r => r.json()));
    ok('AI answers the invoice question with steps', /New Invoice/.test(a.answer || ''), String(a.answer || a.error).slice(0, 80));
  });

  // Admin home: "Implementer Interface" tile renamed
  await step('Admin tiles', async () => {
    await page.evaluate(() => fetch('/openmrs/ws/rest/v1/session', { method: 'DELETE' }));
    await login(page, 'demo.admin', 'fulham');
    await page.goto(`${BASE}/bahmni-v2/home/`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('text=Registration', { timeout: 60000 });
    await page.waitForTimeout(1500);
    const t = await page.evaluate(() => document.body.innerText);
    ok('Admin home: "Form Builder" tile (was "Implementer Interface")', t.includes('Form Builder') && !t.includes('Implementer Interface'));
  });

  // Billing
  await step('Billing', async () => {
    await page.goto(BILLING + '/', { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#vp-bcards', { timeout: 60000 });
    const lp = await page.evaluate(() => ({ logo: !!document.querySelector('img.vp-billing-login-logo'), crater: !!document.querySelector('svg.w-48.mb-32'), t: document.body.innerText }));
    ok('Billing login: VIPERS logo instead of "crater"', lp.logo && !lp.crater);
    ok('Billing login: hospital slogan', /Hospital billing for VIPERS HOSPITAL/.test(lp.t) && !/Small Businesses/.test(lp.t));
    await page.click('#vp-bcards .vp-card');
    await page.waitForURL(/\/admin/, { timeout: 60000 });
    await page.waitForTimeout(2000);
    const fab = await page.evaluate(() => { const f = document.querySelector('#vipers-root .vp-fabs').getBoundingClientRect(); return { top: Math.round(f.top), left: Math.round(f.left) }; });
    ok('Billing: VIPERS buttons in the header (not over totals)', fab.top < 40, JSON.stringify(fab));
    const pm = await page.evaluate(async () => {
      const x = decodeURIComponent((document.cookie.match(/XSRF-TOKEN=([^;]+)/) || [])[1] || '');
      const j = await fetch('/api/v1/payment-methods?limit=all', { headers: { Accept: 'application/json', company: '1', 'X-XSRF-TOKEN': x } }).then(r => r.json());
      const it = await fetch('/api/v1/items?search=malaria&limit=all', { headers: { Accept: 'application/json', company: '1', 'X-XSRF-TOKEN': x } }).then(r => r.json());
      return { methods: j.data.map(m => m.name), items: it.data.map(i => i.name) };
    });
    ok('Billing: Mobile Money and Cheque payment modes', pm.methods.includes('Mobile Money') && pm.methods.includes('Cheque') && !pm.methods.includes('Check'), pm.methods.join(', '));
    ok('Billing: malaria test item named consistently', pm.items.includes('Rapid test for malaria (RDT)') && !pm.items.includes('Malaria RDT'), pm.items.join(', '));
  });

  if (errors.length) console.log('page errors: ' + [...new Set(errors)].slice(0, 4).join(' | '));
  await b.close();
  console.log('RESULTS ' + JSON.stringify(results));
})();
