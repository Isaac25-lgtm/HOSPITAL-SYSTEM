// Acceptance on a phone (run with MOBILE=1): the core workflows via the same UI flows as desktop.
const { browser, shot } = require('./lib');
const { withUser, register, consult, labResult, appointment, invoice } = require('./flows');
const R = [];
const ok = (step, pass, note = '') => { R.push({ step, pass, note }); console.log(`${pass ? 'PASS' : 'FAIL'} | ${step}${note ? ' | ' + note : ''}`); };
const letters = n => [...String(n)].map(d => 'abcdefghij'[d]).join('');
let fails = 0;
const run = async (label, fn, page) => { const t = Date.now(); try { const r = await fn(); ok(label, true, `${Date.now() - t} ms`); return r; } catch (e) { console.log('   CALLLOG ' + e.message.split('\n').filter(l => /intercept|visible|stable|viewport|enabled|retrying/.test(l)).slice(-4).join(' / ')); ok(label, false, e.message.split('\n')[0] + ' | ' + (e.message.match(/waiting for (.*)/) || ['', ''])[1].slice(0, 120)); if (page) await page.screenshot({ path: `/t/out/mob-fail-${++fails}.png` }).catch(() => {}); return null; } };

(async () => {
  const last = 'Mobtest' + letters(Date.now() % 100000);
  const p = { first: 'Ruth', last, gender: 'Female', age: 31, city: 'Gulu', address: 'Layibi (fictional)', phone: '0700100' + String(Date.now()).slice(-3), visit: true };
  let uuid = await withUser('demo.reception', 'liverpool', page => run('Phone: register patient + start OPD visit', async () => { const u = await register(page, p); await shot(page, 'mob-1-registered'); return u; }, page));
  if (uuid) {
    await withUser('demo.doctor', 'arsenal', page => run('Phone: consultation (diagnosis, lab order, prescription, vitals) saved', async () => {
      await consult(page, uuid, { diagnoses: [['Malaria', 'Falciparum malaria', 'Confirmed']], tests: [['Malaria', 'Rapid test for malaria']],
        meds: [{ q: 'Artemether', drug: 'Artemether 20 mg + Lumefantrine 120 mg (Tablet)', dose: 4, unit: 'Tablet', freq: 'Twice a day', days: 3 }], vitals: [100, 97, 20, 101.0, 114, 74] });
      await shot(page, 'mob-2-consult-saved');
    }));
    await withUser('demo.lab', 'chelsea', page => run('Phone: lab result entry', async () => { await labResult(page, uuid, 'Rapid test for malaria', 'Negative', false); await shot(page, 'mob-3-lab'); }));
    await withUser('demo.reception', 'liverpool', page => run('Phone: book appointment (legacy desktop layout, zoomed)', async () => { await appointment(page, last, 'General Medicine Follow-up Consultation', 3, '09:30', 'Phone test'); await shot(page, 'mob-4-appt'); }));
    await run('Phone: billing invoice + payment', () => invoice(last, ['OPD Consultation', 'Rapid test for malaria (RDT)'], true));
  }
  // help + AI on the phone
  await withUser('demo.doctor', 'arsenal', async page => {
    await run('Phone: Help panel and Ask Vipers AI open and close', async () => {
      await page.click('#vipers-root .vp-help-btn'); await page.locator('#vipers-root .vp-help h2').waitFor();
      await shot(page, 'mob-5-help'); await page.click('#vipers-root .vp-help .vp-x');
      await page.click('#vipers-root .vp-ai-btn'); await page.locator('#vipers-root .vp-chip').first().click();
      await page.locator('#vipers-root .vp-msg.vp-bot').nth(1).waitFor({ timeout: 30000 });
      await shot(page, 'mob-6-ai'); await page.click('#vipers-root .vp-ai .vp-x');
    });
  });
  console.log(`MOBILE_PATIENT ${last} ${uuid}`);
  console.log('RESULTS', JSON.stringify(R));
})();
