'use strict';
const http = require('http'), fs = require('fs'), os = require('os'), path = require('path');
const { spawn } = require('child_process');
const assert = require('assert/strict');
let outbound = 0, server;
const provider = http.createServer((req, res) => { outbound++; res.end('{}'); });
const call = async body => {
  const r = await fetch('http://127.0.0.1:18081/vipers-ai/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  assert.equal(r.status, 200); return r.json();
};
(async () => {
  await new Promise(r => provider.listen(19998, '127.0.0.1', r));
  const env = { ...process.env, PORT: '18081', DATA_DIR: fs.mkdtempSync(path.join(os.tmpdir(), 'vipers-private-')), GATE_ENABLED: 'false', TRIAL_PORTAL: 'false', AI_ENABLED: 'true', AI_URL: 'http://127.0.0.1:19998', AI_API_KEY: 'fake-key' };
  delete env.AI_ALLOW_FREE_TEXT;
  server = spawn(process.execPath, [path.join(__dirname, '../edge/addons/server.js')], { env, stdio: 'ignore' });
  let healthy = false;
  for (let i = 0; i < 100; i++) { try { healthy = (await fetch('http://127.0.0.1:18081/healthz')).ok; } catch {} if (healthy) break; await new Promise(r => setTimeout(r, 50)); }
  assert.ok(healthy);
  for (const q of ['For Alice Nalongo, explain the workspace sequence for arranging a future outpatient slot.', 'alice nalongo needs help with an unfamiliar screen', 'unusual workspace question']) {
    const r = await call({ question: q, page: 'home', history: [{ role: 'user', content: 'Alice Nalongo' }] });
    assert.ok(['privacy', 'help'].includes(r.source));
  }
  assert.equal((await call({ question: 'How do I register a patient?', page: 'home' })).source, 'help');
  assert.equal(outbound, 0);
  console.log('PASS | default privacy boundary never forwards free text/history; static help works');
})().catch(e => { console.error(e); process.exitCode = 1; }).finally(() => { if (server) server.kill(); provider.close(); });
