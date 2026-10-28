// Performance: single-user timings + a modest concurrent session test (several staff at once).
const { browser, passGate, login, BASE } = require('./lib');
const R = [];
const ok = (step, pass, note = '') => { R.push({ step, pass, note }); console.log(`${pass ? 'PASS' : 'FAIL'} | ${step}${note ? ' | ' + note : ''}`); };
const P = process.env.PATIENT;

async function timings() {
  const { b, page } = await browser();
  const t = {};
  let s = Date.now(); await passGate(page); await page.waitForSelector('#username'); t.loginPage = Date.now() - s;
  t.login = await login(page, 'demo.doctor', 'arsenal');
  s = Date.now(); await page.goto(BASE + '/bahmni-v2/home/', { waitUntil: 'domcontentloaded' }); await page.waitForSelector('text=Clinical'); t.home = Date.now() - s;
  s = Date.now(); await page.goto(BASE + '/bahmni-v2/registration/search', { waitUntil: 'domcontentloaded' });
  await page.fill('input[placeholder="Search by Name or Patient ID"]', 'Nakato'); await page.keyboard.press('Enter');
  await page.locator('text=Grace').first().waitFor(); t.search = Date.now() - s;
  s = Date.now(); await page.goto(`${BASE}/bahmni-v2/clinical/${P}`, { waitUntil: 'domcontentloaded' });
  await page.locator('button:has-text("New Consultation"), button:has-text("Continue Consultation")').first().waitFor(); t.dashboard = Date.now() - s;
  await b.close();
  const { b: b2, page: p2 } = await browser();
  await login(p2, 'demo.lab', 'chelsea');
  s = Date.now(); await p2.goto(BASE + '/lab', { waitUntil: 'domcontentloaded' }); await p2.waitForSelector('text=Active Patient List'); t.labQueue = Date.now() - s;
  await b2.close();
  return t;
}

async function session(i) {
  const users = [['demo.reception', 'liverpool'], ['demo.doctor', 'arsenal'], ['demo.lab', 'chelsea'], ['demo.admin', 'fulham'], ['demo.doctor', 'arsenal'], ['demo.reception', 'liverpool']];
  const [u, pw] = users[i % users.length];
  const { b, page, errors } = await browser();
  const s = Date.now();
  try {
    await login(page, u, pw);
    await page.goto(BASE + '/bahmni-v2/registration/search', { waitUntil: 'domcontentloaded' });
    await page.fill('input[placeholder="Search by Name or Patient ID"]', 'a'); await page.keyboard.press('Enter');
    await page.waitForTimeout(1500);
    if (u !== 'demo.reception') { await page.goto(`${BASE}/bahmni-v2/clinical/${P}`, { waitUntil: 'domcontentloaded' }); await page.locator('text=Basic Details').first().waitFor({ timeout: 60000 }); }
    return { u, ms: Date.now() - s, errors: errors.filter(e => /^5\d\d/.test(e)).length };
  } catch (e) { return { u, ms: Date.now() - s, fail: e.message.split('\n')[0] }; } finally { await b.close(); }
}

(async () => {
  const t = await timings();
  console.log('TIMINGS_MS', JSON.stringify(t));
  ok('Login page loads < 5 s', t.loginPage < 5000, `${t.loginPage} ms`);
  ok('Login (credentials -> home) < 8 s', t.login < 8000, `${t.login} ms`);
  ok('Home dashboard < 5 s', t.home < 5000, `${t.home} ms`);
  ok('Patient search < 5 s', t.search < 5000, `${t.search} ms`);
  ok('Clinical record opens < 8 s', t.dashboard < 8000, `${t.dashboard} ms`);
  ok('Lab work queue loads < 5 s', t.labQueue < 5000, `${t.labQueue} ms`);
  const N = +(process.env.USERS || 6);
  const s = Date.now();
  const res = await Promise.all([...Array(N).keys()].map(session));
  const fails = res.filter(r => r.fail), slow = Math.max(...res.map(r => r.ms));
  console.log('CONCURRENT', JSON.stringify(res));
  ok(`${N} concurrent staff sessions (login + search + record) complete without errors`, fails.length === 0 && res.every(r => !r.errors), `wall ${Date.now() - s} ms; slowest session ${slow} ms`);
  console.log('RESULTS', JSON.stringify(R));
})();
