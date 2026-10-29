// Recovery paths of the trial provisioner (code review 29 Oct, R07-R09), against the real module with an in-memory
// registry and a fake cloud; nothing is created anywhere.
//  - a refresh that was waiting on the cloud when the trial was deleted must not overwrite "deleted" (also for a 404);
//  - a server found again for a record that lost its slot revives that ONE record (no duplicate id, status follows it);
//  - a server found again for a confirmed deletion is deleted again, never brought back;
//  - new server names are opaque (no hospital name).
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const APP = process.env.APP || '/app';
const R = [];
const ok = (step, pass, note = '') => { R.push(pass); console.log(`${pass ? 'PASS' : 'FAIL'} | ${step}${note ? ' | ' + note : ''}`); };
const response = (status, body) => ({ ok: status < 400, status, json: async () => body, text: async () => String(body) });
let pending, hold = true, exists = true, deletes = 0, lastName = '';
const inst = { name: 'race-vm', labels: { 'vipers-trial': '1', 'vipers-trial-id': 'race-id', 'vipers-expires': String(Math.floor(Date.now() / 1000) + 86400) },
  metadata: { items: [] }, creationTimestamp: new Date().toISOString() };
const fakeFetch = async (url, opts = {}) => {
  if (url.includes('metadata.google.internal')) {
    const values = { '/project/project-id': 'proj', '/instance/zone': 'projects/1/zones/z1', '/instance/tags': '[]', '/network': 'projects/1/networks/default', '/email': 'controller@proj', '/token': '{"access_token":"fake"}' };
    for (const [suffix, value] of Object.entries(values)) if (url.endsWith(suffix)) return response(200, value);
  }
  if (url.includes('/global/images/')) return response(200, { labels: { 'vipers-boot-sealed': 'v1' } });
  if (url.includes('/instances?filter=')) return response(200, { items: exists ? [inst] : [] });
  if (opts.method === 'DELETE') { deletes++; exists = false; return response(200, { status: 'DONE' }); }
  if (opts.method === 'POST' && /\/instances$/.test(url)) { lastName = JSON.parse(opts.body).name; return response(200, { status: 'DONE' }); }
  if (url.endsWith('/instances/' + inst.name)) {
    if (hold) { hold = false; return new Promise(resolve => { pending = resolve; }); }
    return response(exists ? 200 : 404, exists ? inst : {});
  }
  return response(404, {});
};
const memoryFs = {
  readFileSync() { throw Object.assign(Error('not found'), { code: 'ENOENT' }); },
  existsSync() { return false; }, openSync() { return 1; }, writeSync() {}, fsyncSync() {}, closeSync() {}, renameSync() {}
};
const context = { require: name => name === 'fs' ? memoryFs : require(name), module: { exports: {} }, __dirname: APP,
  process: { env: { DATA_DIR: '/fake', TRIAL_PORTAL: 'true', TRIAL_ALLOW_CONTROLLER_SA: 'true' } }, fetch: fakeFetch,
  console: { log() {}, error() {}, warn() {} }, AbortSignal, URL, setInterval() {}, setTimeout() {} };
vm.runInNewContext(fs.readFileSync(path.join(APP, 'trial.js'), 'utf8'), context, { filename: 'trial.js' });
const api = context.module.exports, T = api._test;
const status = async id => { let out; await api.handle({ method: 'GET', url: '/vipers-trial/api/status?id=' + id }, {}, '/vipers-trial/api/status', (_r, code, body) => { out = { code, body }; }, () => false); return out; };

(async () => {
  // R07: deletion completes while a refresh waits; the refresh then receives a 404
  const t = { id: 'race-id', vm: 'race-vm', zone: 'z1', status: 'ready', scrubbed: true,
    created: new Date(Date.now() - 600000).toISOString(), expires: new Date(Date.now() + 86400000).toISOString() };
  T.trials().push(t);
  const refreshing = T.refresh(t);
  while (!pending) await Promise.resolve();
  await T.remove(t, 'deleted by hospital');
  pending(response(404, {}));
  await refreshing;
  ok('late 404 refresh keeps the confirmed deletion', t.status === 'deleted', t.status);

  // a confirmed deletion whose server shows up again is deleted again (never revived)
  exists = true; deletes = 0;
  await T.sweep();
  ok('server found again after deletion: deleted again, one record', deletes === 1 && t.status === 'deleted' && T.trials().filter(x => x.id === 'race-id').length === 1,
    `${t.status}, deletes ${deletes}, records ${T.trials().filter(x => x.id === 'race-id').length}`);

  // R08: a record marked failed (e.g. missing right after creation) whose server exists afterwards is revived in place
  const f = { id: 'late-id', vm: 'late-vm', zone: 'z1', status: 'failed', error: 'instance missing',
    created: new Date(Date.now() - 600000).toISOString(), expires: new Date(Date.now() + 86400000).toISOString() };
  T.trials().push(f);
  Object.assign(inst, { name: 'late-vm', labels: { 'vipers-trial': '1', 'vipers-trial-id': 'late-id', 'vipers-expires': inst.labels['vipers-expires'] } });
  exists = true;
  await T.sweep();
  const s = await status('late-id');
  ok('server found for a failed record: one record, revived', T.trials().filter(x => x.id === 'late-id').length === 1 && f.status === 'creating' && !f.error,
    `${f.status}, records ${T.trials().filter(x => x.id === 'late-id').length}`);
  ok('status endpoint follows the live server', s && s.body && s.body.status === 'creating', JSON.stringify(s && s.body));

  // R09: opaque server names
  await T.signup({ hospital: 'Very Distinctive Hospital Name', username: 'distinct', password: 'Strong-pass-123', confirm: 'Strong-pass-123' }).catch(() => {});
  const made = T.trials().find(x => x.username === 'distinct');
  ok('new server name carries no hospital name', !!made && /^vh-trial-[a-f0-9]{12}$/.test(made.vm) && !/distinct/i.test(made.vm + lastName), made ? made.vm : 'not created');

  console.log(`\n${R.filter(Boolean).length}/${R.length} passed`);
  process.exitCode = R.every(Boolean) ? 0 : 1;
})().catch(e => { console.error(e); process.exitCode = 1; });
