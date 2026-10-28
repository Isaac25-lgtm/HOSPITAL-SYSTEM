// Unit test for the Ask Vipers AI proxy (edge/addons/server.js), run against a fake AI provider that records
// exactly what would be sent to the real one. No network, no real key, no patient data.
//   docker run --rm -v /opt/vipers/edge/addons:/app -v /opt/vipers/tests:/t node:22-alpine node /t/unit-ai.js
const http = require('http');
const { spawn } = require('child_process');
const os = require('os'), fs = require('fs'), path = require('path');

const R = [];
const ok = (step, pass, note = '') => { R.push({ step, pass, note }); console.log(`${pass ? 'PASS' : 'FAIL'} | ${step}${note ? ' | ' + note : ''}`); };
const APP = process.env.APP || '/app';
const sent = [];
const provider = http.createServer((req, res) => {
  let b = ''; req.on('data', c => b += c); req.on('end', () => {
    sent.push(JSON.parse(b));
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ choices: [{ message: { content: 'Open the Registration tile and click Create New.' } }], usage: { prompt_tokens: 10, completion_tokens: 5 } }));
  });
});
const call = (method, p, body, raw) => new Promise(done => {
  const data = raw !== undefined ? raw : body === undefined ? undefined : JSON.stringify(body);
  const req = http.request({ host: '127.0.0.1', port: 18080, path: p, method, headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': '10.0.0.' + (1 + Math.floor(Math.random() * 200)) } }, res => {
    let s = ''; res.on('data', c => s += c); res.on('end', () => { let j = null; try { j = JSON.parse(s); } catch {} done({ status: res.statusCode, body: s, json: j }); });
  });
  req.on('error', e => done({ status: 0, error: e.message }));
  if (data !== undefined) req.write(data); req.end();
});
const wait = ms => new Promise(r => setTimeout(r, ms));
const alive = async () => (await call('GET', '/healthz')).status === 200;
const everything = () => JSON.stringify(sent);

(async () => {
  await new Promise(r => provider.listen(19999, r));
  const data = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-'));
  const srv = spawn('node', [path.join(APP, 'server.js')], { env: { ...process.env, PORT: '18080', DATA_DIR: data, AI_URL: 'http://127.0.0.1:19999/v1', AI_API_KEY: 'test-key',
    GATE_ENABLED: 'false', GATE_CODE: 'kampala-1234', TRIAL_PORTAL: 'false', AI_IP_PER_MINUTE: '100', AI_IP_PER_DAY: '1000' }, stdio: ['ignore', 'pipe', 'pipe'] });
  let exited = null; srv.on('exit', c => { exited = c; });
  for (let i = 0; i < 50 && !(await alive()); i++) await wait(100);

  // malformed bodies: 400, process keeps running
  for (const [name, raw] of [['JSON null', 'null'], ['JSON array', '[]'], ['JSON string', '"x"'], ['number question', '{"question":5}'], ['broken JSON', '{"question":']]) {
    const r = await call('POST', '/vipers-ai/api/chat', undefined, raw);
    ok(`chat rejects ${name} with 400`, r.status === 400, 'status ' + r.status);
  }
  ok('process still alive after malformed requests', await alive() && exited === null);

  // gate: a non-ASCII wrong code of the same character length must not crash (byte-length comparison)
  const g = await call('POST', '/vipers-gate/login', undefined, 'code=' + encodeURIComponent('Ã©'.repeat(12)));
  ok('gate: unicode wrong code is refused without crashing', g.status === 401 && await alive(), 'status ' + g.status);

  // privacy: a refused question never reaches the provider, now or later as history
  const pii = 'patient John Okello 0772123456 how do I edit his phone';
  const r1 = await call('POST', '/vipers-ai/api/chat', { question: pii, page: 'registration', role: 'Receptionist', history: [] });
  ok('question with name and phone is refused locally', r1.json && r1.json.source === 'privacy');
  const before = sent.length;
  await call('POST', '/vipers-ai/api/chat', { question: 'Where do I find the list of appointments booked for tomorrow afternoon?', page: 'home', role: 'Receptionist',
    history: [{ role: 'user', content: pii }, { role: 'assistant', content: 'ok' }],
    screen: ['Search', 'Alice Nalongo', 'Create New', 'Registration'], title: 'Alice Nalongo - Dashboard' });
  ok('follow-up question was sent to the provider', sent.length === before + 1);
  ok('rejected history (name/phone) is not forwarded', !/Okello|0772123456/.test(everything()));
  ok('patient name in screen labels/title is not forwarded', !/Nalongo/.test(everything()));
  ok('known interface labels are still forwarded', /Create New/.test(JSON.stringify(sent[sent.length - 1])));
  const sys = sent[sent.length - 1].messages.filter(m => m.role === 'system').map(m => m.content).join(' ');
  ok('screen labels are not placed in the system instructions', !/Create New \| Registration/.test(sys));

  // cache: a follow-up (with history) never gets a shared cached answer
  const q = { question: 'How do I print the visit summary after the consultation?', page: 'home', role: 'Doctor', screen: [] };
  await call('POST', '/vipers-ai/api/chat', { ...q, history: [] });
  const c2 = await call('POST', '/vipers-ai/api/chat', { ...q, history: [] });
  ok('identical first question is served from cache', c2.json && c2.json.source === 'cache');
  const c3 = await call('POST', '/vipers-ai/api/chat', { ...q, history: [{ role: 'user', content: 'I am on the patient dashboard' }, { role: 'assistant', content: 'ok' }] });
  ok('same question with history is not served from cache', c3.json && c3.json.source === 'ai', c3.json && c3.json.source);
  const c4 = await call('POST', '/vipers-ai/api/chat', { ...q, history: [], role: 'Cashier' });
  ok('same question from another role is not served from cache', c4.json && c4.json.source === 'ai', c4.json && c4.json.source);

  // unknown page / role values are replaced by server-owned values
  await call('POST', '/vipers-ai/api/chat', { question: 'What can I do on this screen today please?', page: 'x<script>', role: 'Dr Alice Nalongo', history: [] });
  ok('client-supplied page/role text is not forwarded', !/Nalongo|x<script>|Dr Alice/.test(JSON.stringify(sent[sent.length - 1])));

  srv.kill(); provider.close();
  const failed = R.filter(r => !r.pass).length;
  console.log('RESULTS ' + JSON.stringify(R));
  console.log(failed ? `${failed} FAILED` : 'ALL PASSED');
  process.exit(failed ? 1 : 0);
})();
