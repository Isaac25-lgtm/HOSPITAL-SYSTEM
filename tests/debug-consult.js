// Debug a consultation save: log API calls and any error/notification text after Done.
const { browser, login, shot, BASE } = require('./lib');
const { consult } = require('./flows');
(async () => {
  const { b, page } = await browser({ width: 1366, height: 900 });
  page.on('response', async r => { if (r.request().method() !== 'GET' && /openmrs\/ws/.test(r.url()) && !/auditlog|session|\/user\//.test(r.url())) { let body = ''; if (r.status() >= 400) body = (await r.text().catch(() => '')).slice(0, 400); console.log('API', r.request().method(), r.status(), r.url().replace(BASE, '').slice(0, 80), body); } });
  await login(page, 'demo.doctor', 'arsenal');
  const AL = { q: 'Artemether', drug: 'Artemether 20 mg + Lumefantrine 120 mg (Tablet)', dose: 4, unit: 'Tablet', freq: 'Twice a day', days: 3 };
  const PCM = { q: 'Paracetamol', drug: 'Paracetamol 500 mg (Tablet)', dose: 2, unit: 'Tablet', freq: 'Thrice a day', days: 3 };
  try {
    const spec = process.env.CASE === 'brian' ? { diagnoses: [['Pneumonia', 'Pneumonia', 'Provisional']], tests: [['Malaria', 'Malarial smear']], meds: [{ q: 'Amoxicillin', drug: 'Amoxicillin 250 mg/5 ml (Oral solution)', dose: 5, unit: 'Milliliter', freq: 'Thrice a day', days: 5 }], vitals: [118, 95, 34, 101.5] } : { diagnoses: [['Falciparum', 'Falciparum malaria', 'Confirmed']], tests: [['Malaria', 'Rapid test for malaria']], meds: [AL, PCM], vitals: [104, 96, 22, 102.2, 112, 72] };
    await consult(page, process.env.PATIENT, spec);
    console.log('SAVED OK');
  } catch (e) {
    console.log('ERR', e.message.split('\n')[0]);
    const notes = await page.$$eval('.cds--toast-notification, .cds--inline-notification, [role=alert], .cds--form-requirement, [data-invalid=true]', es => es.map(e => (e.innerText || e.id).trim().replace(/\s+/g, ' ').slice(0, 150)));
    console.log('NOTIFICATIONS', JSON.stringify(notes));
    console.log('TOGGLES', JSON.stringify(await page.$$eval('button[id$="-toggle-button"], [role=combobox]', es => es.filter(e => e.offsetParent).map(e => e.tagName + ':' + (e.innerText || e.value || e.placeholder || '').trim() + ':' + (e.getAttribute('aria-labelledby') || '')))));
    console.log('ROUTE HTML', await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find(x => x.innerText.trim() === 'Route'); return b ? b.outerHTML.slice(0, 500) + ' || PARENT ' + b.parentElement.outerHTML.slice(0, 300) : 'none'; }));
    const rb = page.locator('button[role=combobox]', { hasText: /^Route$/ }).first(); console.log('route count', await rb.count()); await rb.click(); await page.waitForTimeout(800); console.log('ROUTE OPTIONS', JSON.stringify(await page.$$eval('[role=option]', os => os.filter(o => o.offsetParent).map(o => o.innerText.trim()))));
    await page.screenshot({ path: '/t/out/debug-consult.png', fullPage: false });
    await page.mouse.move(950, 400); for (let i = 0; i < 20; i++) await page.mouse.wheel(0, -500);
    await page.screenshot({ path: '/t/out/debug-consult-top.png' });
  }
  await b.close();
})();
