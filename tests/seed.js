// Seed the VIPERS HOSPITAL demonstration dataset through the real UI. Fictional people only.
// Idempotent: a patient that already exists (by full name) is skipped.
const { withUser, findPatient, register, consult, labResult, appointment, invoice } = require('./flows');

const AL = { q: 'Artemether', drug: 'Artemether 20 mg + Lumefantrine 120 mg (Tablet)', dose: 4, unit: 'Tablet', freq: 'Twice a day', days: 3 };
const PCM = { q: 'Paracetamol', drug: 'Paracetamol 500 mg (Tablet)', dose: 2, unit: 'Tablet', freq: 'Thrice a day', days: 3 };

const PATIENTS = [
  { first: 'Grace', last: 'Nakato', gender: 'Female', age: 29, city: 'Kampala', address: 'Kisenyi (fictional)', phone: '0700100101', visit: true,
    consult: { diagnoses: [['Falciparum', 'Falciparum malaria', 'Confirmed']], tests: [['Malaria', 'Rapid test for malaria']], meds: [AL, PCM], vitals: [104, 96, 22, 102.2, 112, 72] },
    lab: ['Rapid test for malaria', 'Positive for Plasmodium falciparum', true],
    bill: { items: ['OPD Consultation', 'Rapid test for malaria (RDT)', 'Artemether-Lumefantrine 20/120mg x24', 'Paracetamol 500mg x20'], pay: true } },
  { first: 'Sarah', last: 'Namubiru', gender: 'Female', age: 24, city: 'Wakiso', address: 'Nansana (fictional)', phone: '0700100102', visit: true,
    consult: { tests: [['Haemoglobin', 'Haemoglobin'], ['HIV', 'Rapid test for HIV']], meds: [{ q: 'Ferrous', drug: 'Ferrous salt 45mg elemental iron + Folic acid 400 mcg (Tablet)', dose: 1, unit: 'Tablet', freq: 'Once a day', days: 30 }], vitals: [84, 98, 18, 98.4, 110, 70] },
    appt: ['Antenatal Care', 28, '09:00', 'ANC follow-up visit (demo)'],
    bill: { items: ['Antenatal Care Visit', 'Complete Blood Count'], pay: false } },
  { first: 'Brian', last: 'Mugisha', gender: 'Male', age: 4, city: 'Mukono', address: 'Seeta (fictional)', phone: '0700100103', visit: true,
    consult: { diagnoses: [['Pneumonia', 'Pneumonia', 'Provisional']], tests: [['Malaria', 'Malarial smear']], meds: [{ q: 'Amoxicillin', drug: 'Amoxicillin 250 mg/5 ml (Oral solution)', dose: 5, unit: 'Milliliter', freq: 'Thrice a day', days: 5 }], vitals: [118, 95, 34, 101.5] },
    bill: { items: ['OPD Consultation'], pay: false } },
  { first: 'John', last: 'Ssempala', gender: 'Male', age: 56, city: 'Entebbe', address: 'Kitoro (fictional)', phone: '0700100104', visit: true,
    consult: { diagnoses: [['Hypertension', 'Hypertension', 'Confirmed']], tests: [['Glucose', 'Fasting blood glucose measurement (mg/dL)']], meds: [{ q: 'Amlodipine', drug: 'Amlodipine 5 mg (Tablet)', dose: 1, unit: 'Tablet', freq: 'Once a day', days: 30 }], vitals: [78, 97, 16, 98.2, 158, 96] },
    appt: ['General Medicine Follow-up Consultation', 14, '10:30', 'BP review after starting amlodipine (demo)'],
    bill: { items: ['Specialist Consultation', 'Amlodipine 5mg x30', 'Blood Sugar (RBS)'], pay: true } },
  { first: 'Peter', last: 'Okello', gender: 'Male', age: 35, city: 'Jinja', address: 'Walukuba (fictional)', phone: '0700100105', visit: true },
  { first: 'Mary', last: 'Achieng', gender: 'Female', age: 41, city: 'Kampala', address: 'Ntinda (fictional)', phone: '0700100106', visit: false,
    appt: ['General Medicine OPD Consultation', 7, '11:00', 'New patient review (demo)'] },
];

let failN = 0;
const step = async (label, fn, page) => { const t = Date.now(); try { const r = await fn(); console.log(`OK   ${label} (${Date.now() - t} ms)`); return r; } catch (e) { console.log(`FAIL ${label}: ${e.message.split('\n')[0]}`); if (page) await page.screenshot({ path: `/t/out/seed-fail-${++failN}.png` }).catch(() => {}); return null; } };
// RESUME="Grace Nakato:consult,lab;Brian Mugisha:consult,bill" re-runs steps for patients that already exist
const RESUME = Object.fromEntries((process.env.RESUME || '').split(';').filter(Boolean).map(x => { const [n, s] = x.split(':'); return [n.trim().replace(/_/g, ' '), s.split(',')]; }));

(async () => {
  for (const p of PATIENTS) {
    const name = `${p.first} ${p.last}`;
    let uuid = await withUser('demo.reception', 'liverpool', async page => {
      const ex = await findPatient(page, name);
      if (ex) { if (RESUME[name]) return ex.uuid; console.log(`SKIP ${name}: already exists`); return null; }
      return step(`register ${name}${p.visit ? ' + start visit' : ''}`, () => register(page, p), page);
    });
    if (!uuid) continue;
    const want = s => !RESUME[name] || RESUME[name].includes(s);
    if (p.consult && want('consult')) await withUser('demo.doctor', 'arsenal', page => step(`consultation for ${name}`, () => consult(page, uuid, p.consult), page));
    if (p.lab && want('lab')) await withUser('demo.lab', 'chelsea', page => step(`lab result for ${name}`, () => labResult(page, uuid, ...p.lab), page));
    if (p.appt && want('appt')) await withUser('demo.reception', 'liverpool', page => step(`appointment for ${name}`, () => appointment(page, p.last, ...p.appt), page));
    if (p.bill && want('bill')) await step(`invoice${p.bill.pay ? ' + payment' : ''} for ${name}`, () => invoice(p.last, p.bill.items, p.bill.pay));
    console.log(`PATIENT ${name} ${uuid}`);
  }
})();
