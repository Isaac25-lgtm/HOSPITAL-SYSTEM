// Acceptance: cashier - synced patient is a Crater customer; create invoice in UGX; record payment; open receipt.
const { browser, passGate, showPasswordForm, shot, BASE } = require('./lib');
const BILL = BASE.replace('://demo.', '://billing.');
const R = [];
const ok = (step, pass, note = '') => { R.push({ step, pass, note }); console.log(`${pass ? 'PASS' : 'FAIL'} | ${step}${note ? ' | ' + note : ''}`); };
const dump = (page, re) => page.evaluate(src => {
  const rx = new RegExp(src, 'i'); const t = s => (s || '').trim().replace(/\s+/g, ' ').slice(0, 60);
  return [...document.querySelectorAll('input,button,a,li,label,[role=option],span')].filter(e => e.offsetParent && !e.closest('#vipers-root'))
    .map(e => `${e.tagName.toLowerCase()}${e.id ? '#' + e.id : ''} "${t(e.innerText || e.placeholder || e.value)}"`).filter(s => rx.test(s)).slice(0, 30);
}, re.source);

(async () => {
  const LAST = process.env.LAST;
  const { b, page, errors } = await browser({ width: 1366, height: 900 });
  page.on('response', r => { if (r.request().method() !== 'GET' && /\/api\/v1\//.test(r.url())) console.log('  API', r.request().method(), r.status(), r.url().replace(BILL, '').slice(0, 80)); });
  try {
    await passGate(page, BILL + '/');
    await showPasswordForm(page);
    await page.fill('input[type=email]', 'demo.cashier@vipers.demo');
    await page.fill('input[type=password]', 'everton');
    const tl = Date.now();
    await page.click('button[type=submit]');
    await page.waitForURL(/admin\/dashboard/, { timeout: 30000 });
    ok('Cashier login to billing (Crater)', true, `${Date.now() - tl} ms`);
    await shot(page, 'wf-bill-1-dashboard');

    await page.goto(BILL + '/admin/customers', { waitUntil: 'domcontentloaded' });
    await page.locator(`text=${LAST}`).first().waitFor({ timeout: 20000 });
    ok('Patient registered in VIPERS HOSPITAL appears as billing customer (auto-sync)', true, LAST);

    await page.goto(BILL + '/admin/invoices/create', { waitUntil: 'domcontentloaded' });
    await page.locator('button:has-text("New Customer")').first().click();
    await page.waitForTimeout(800);
    const search = page.locator('input[placeholder*="Search" i]:visible').last();
    await search.fill(LAST); await page.waitForTimeout(1500);
    console.log('  customer popover:', JSON.stringify(await dump(page, new RegExp(LAST))));
    await page.locator(`text=${LAST}`).last().click();
    await page.waitForTimeout(1200);

    const items = ['OPD Consultation', 'Rapid test for malaria (RDT)', 'Artemether-Lumefantrine 20/120mg x24'];
    for (let i = 0; i < items.length; i++) {
      if (i > 0) { await page.locator('text=/Add New Item|Add Item/i').first().click(); await page.waitForTimeout(800); }
      // the item selector of the last row sits just above that row's "Type Item Description" field
      const desc = page.locator('textarea[placeholder*="Item Description" i], [placeholder*="Item Description" i]').last();
      const box = await desc.boundingBox();
      await page.mouse.click(box.x + 150, box.y - 32);
      await page.waitForTimeout(400);
      await page.keyboard.type(items[i].split(' ')[0], { delay: 30 }); await page.waitForTimeout(1500);
      if (i === 0) console.log('  item options:', JSON.stringify(await dump(page, /Consultation|RDT|Artemether|Paracetamol/)));
      await page.locator(`li:has-text("${items[i]}"), [role=option]:has-text("${items[i]}"), span:has-text("${items[i]}")`).first().click();
      await page.waitForTimeout(800);
    }
    await shot(page, 'wf-bill-2-invoice-form');
    const total = (await page.innerText('body')).match(/TOTAL AMOUNT:\s*([^\n]+)/i);
    console.log('  total:', total && total[1]);
    await page.click('button:has-text("Save Invoice")');
    await page.waitForURL(/invoices\/\d+\/view/, { timeout: 30000 });
    const invUrl = page.url();
    const getInv = id => page.evaluate(i => fetch(`/api/v1/invoices/${i}`, { headers: { Accept: 'application/json', company: '1' }, credentials: 'same-origin' }).then(r => r.json()).then(j => j.data), id);
    let inv = await getInv(invUrl.match(/invoices\/(\d+)/)[1]);
    ok('Create invoice (consultation + malaria RDT + AL) in UGX',
      inv && inv.currency && inv.currency.code === 'UGX' && inv.total === 4200000 && inv.items.length === 3,
      `${inv.invoice_number}; ${inv.items.map(x => x.name).join(' + ')}; total ${inv.currency.code} ${(inv.total / 100).toLocaleString('en')}`);
    await page.waitForTimeout(3000);
    await shot(page, 'wf-bill-3-invoice');

    // record payment
    const id = invUrl.match(/invoices\/(\d+)/)[1];
    await page.goto(`${BILL}/admin/payments/${id}/create`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3000);
    console.log('  payment form:', JSON.stringify(await dump(page, /Payment|Amount|Mode|Cash|Invoice|Save/)));
    const mode = page.locator('text=/Select Payment Mode|Payment Mode/i').first();
    if (await mode.count()) { await mode.click().catch(() => {}); await page.locator('text=/^Cash$/').first().click().catch(() => {}); }
    await shot(page, 'wf-bill-4-payment-form');
    await page.click('button:has-text("Save Payment")');
    await page.waitForURL(/payments\/\d+\/view/, { timeout: 30000 });
    ok('Record demonstration payment against the invoice', true, page.url().replace(BILL, ''));
    await page.waitForTimeout(3000);
    const pdf = await page.$eval('iframe', f => f.src).catch(() => '');
    let pdfOk = false;
    if (pdf) { const r = await page.request.get(pdf); pdfOk = r.ok() && /pdf/i.test(r.headers()['content-type'] || ''); }
    ok('Generate/view payment receipt (PDF)', pdfOk, pdf ? pdf.replace(BILL, '').slice(0, 60) : 'no receipt iframe');
    await shot(page, 'wf-bill-5-receipt');
    inv = await getInv(id);
    ok('Invoice status updated after payment', inv.paid_status === 'PAID' && inv.due_amount === 0, `paid_status=${inv.paid_status}; due=${inv.due_amount / 100}`);
    await page.goto(`${BILL}/admin/invoices/${id}/view`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(3000);
    await shot(page, 'wf-bill-6-invoice-paid');
  } catch (e) {
    ok('Unexpected error', false, e.message.split('\n')[0]);
    await shot(page, 'wf-bill-fail');
  }
  console.log('ERRORS', errors.slice(0, 6).join(' || '));
  console.log('RESULTS', JSON.stringify(R));
  await b.close();
})();
