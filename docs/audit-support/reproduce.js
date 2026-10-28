// Read-only audit of application sources. Uses local mock services and temporary files only.
// Run: node docs/audit-support/reproduce.js
'use strict';
const fs = require('fs'), path = require('path'), os = require('os');
const { spawnSync } = require('child_process');
const root = path.resolve(__dirname, '../..');
const app = path.join(root, 'edge/addons');
const results = [];
function record(name, reproduced, detail) {
  results.push({ name, reproduced, detail });
  console.log(JSON.stringify(results.at(-1)));
}

// Extend the existing real-proxy/fake-provider test with an unrecognised fictional name.
let ai = fs.readFileSync(path.join(root, 'tests/unit-ai.js'), 'utf8');
ai = ai.replace('  // cache:', `
  const privacyBefore = sent.length;
  const privacyResult = await call('POST', '/vipers-ai/api/chat', {
    question: 'For Alice Nalongo, explain the workspace sequence for arranging a future outpatient slot.',
    page: 'home', role: 'Staff', history: []
  });
  console.log('AUDIT_PRIVACY ' + JSON.stringify({ forwarded: sent.length > privacyBefore && JSON.stringify(sent.slice(privacyBefore)).includes('Alice Nalongo'), source: privacyResult.json && privacyResult.json.source }));
  // cache:`);
const aiRun = spawnSync(process.execPath, ['-e', ai], { env: { ...process.env, APP: app }, encoding: 'utf8', timeout: 30000 });
const privacy = aiRun.stdout.match(/^AUDIT_PRIVACY (.*)$/m);
record('Unrecognised patient name forwarded to AI', !!privacy && JSON.parse(privacy[1]).forwarded, privacy ? JSON.parse(privacy[1]) : { stderr: aiRun.stderr, exit: aiRun.status });

// Reuse the existing fake Compute API with a missing registry and already-running servers.
let trial = fs.readFileSync(path.join(root, 'tests/unit-trial.js'), 'utf8').split('(async () => {')[0];
trial += `(async () => {
  for (let i = 0; i < 3; i++) cloud.instances.set('existing-' + i, {
    name: 'existing-' + i,
    labels: { 'vipers-trial': '1', 'vipers-trial-id': 'existing-id-' + i, 'vipers-expires': String(Math.floor(Date.now()/1000) + 86400) },
    metadata: { items: [{ key: 'vipers-username', value: 'olduser' + i }] },
    creationTimestamp: new Date().toISOString(), networkInterfaces: [{ accessConfigs: [{ natIP: '10.1.1.9' }] }]
  });
  await Promise.all(['newone', 'newtwo', 'newthree'].map(u => T.signup(body(u))));
  console.log('AUDIT_CAP ' + JSON.stringify({ servers: cloud.instances.size, limit: trial.TRIAL_MAX }));
  await T.sweep();
  const adopted = T.trials().find(t => t.adopted);
  console.log('AUDIT_ADOPTION ' + JSON.stringify({ hasDeleteHash: !!adopted.deleteHash, deletionStatus: T.deleteRequest({ id: adopted.id, token: 'original-token' }).status }));
  process.exit(0);
})();`;
const trialRun = spawnSync(process.execPath, ['-e', trial], { env: { ...process.env, APP: app }, encoding: 'utf8', timeout: 30000 });
const cap = trialRun.stdout.match(/^AUDIT_CAP (.*)$/m), adoption = trialRun.stdout.match(/^AUDIT_ADOPTION (.*)$/m);
record('Registry loss permits more servers than cap before reconciliation', !!cap && JSON.parse(cap[1]).servers > JSON.parse(cap[1]).limit, cap ? JSON.parse(cap[1]) : trialRun.stderr);
record('Adopted server loses self-delete verification hash', !!adoption && !JSON.parse(adoption[1]).hasDeleteHash, adoption ? JSON.parse(adoption[1]) : trialRun.stderr);

const bash = process.platform === 'win32' ? 'C:/Program Files/Git/bin/bash.exe' : 'bash';
const guard = spawnSync(bash, ['-c', 'set -u; fail() { exit 1; }; need() { local c; c=$(cat); [ "${c:0:1}" = 2 ] || fail denied; }; printf 403 | need; echo CONTINUED_AFTER_FAILED_CHECK'], { encoding: 'utf8' });
record('First-boot piped need() failure does not abort parent', guard.stdout.includes('CONTINUED_AFTER_FAILED_CHECK'), { exit: guard.status, stdout: guard.stdout.trim() });
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vipers-audit-'));
const gz = path.join(tmp, 'sample.sql.gz');
fs.writeFileSync(gz, require('zlib').gzipSync(Buffer.alloc(1024 * 1024, 65)));
// Negative control: the actual backup expression is a test command, whose successful status masks SIGPIPE.
// Do not report the short-read pipeline as a backup failure: test the enclosing expression, not just its pipeline.
const pipe = spawnSync(bash, ['-c', 'set -euo pipefail; [ "$(gunzip -c "$1" | head -c 100 | wc -c)" -gt 0 ]; echo VALIDATION_CONTINUES', 'audit', gz.replace(/\\/g, '/')], { encoding: 'utf8' });
console.log('NEGATIVE_CONTROL ' + JSON.stringify({ name: 'Short-read backup validation continues', passed: pipe.status === 0, stdout: pipe.stdout.trim() }));
console.log('AUDIT_RESULTS ' + JSON.stringify(results));
process.exit(results.every(r => r.reproduced) ? 0 : 1);
