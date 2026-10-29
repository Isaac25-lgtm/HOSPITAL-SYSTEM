// Defect reproducer for the 29 October review, NOT a release gate.
// Executes the real trial module with an in-memory registry and fake cloud.
// Exit zero means both documented defects were reproduced. No network or disk writes.
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm'), assert = require('assert/strict');
const app = path.resolve(__dirname, '../../edge/addons');
const response = (status, body) => ({ ok: status < 400, status, json: async () => body, text: async () => String(body) });
let pending, hold = true, exists = true;
const inst = { name: 'race-vm', labels: { 'vipers-trial-id': 'race-id', 'vipers-expires': String(Math.floor(Date.now()/1000)+86400) }, metadata: { items: [] }, creationTimestamp: new Date().toISOString() };
const fakeFetch = async (url, opts = {}) => {
  if (url.includes('metadata.google.internal')) {
    const values = { '/project/project-id': 'proj', '/instance/zone': 'projects/1/zones/z1', '/instance/tags': '[]', '/network': 'projects/1/networks/default', '/email': 'controller@proj', '/token': '{"access_token":"fake"}' };
    for (const [suffix, value] of Object.entries(values)) if (url.endsWith(suffix)) return response(200, value);
  }
  if (url.includes('/instances?filter=')) return response(200, { items: exists ? [inst] : [] });
  if (opts.method === 'DELETE') { exists = false; return response(200, { status: 'DONE' }); }
  if (url.endsWith('/instances/race-vm')) {
    if (hold) { hold = false; return new Promise(resolve => { pending = resolve; }); }
    return response(exists ? 200 : 404, exists ? inst : {});
  }
  throw Error('Unexpected fake request: ' + url);
};
const memoryFs = {
  readFileSync() { throw Object.assign(Error('not found'), { code: 'ENOENT' }); },
  existsSync() { return false; }, openSync() { return 1; }, writeSync() {}, fsyncSync() {}, closeSync() {}, renameSync() {}
};
const context = { require: name => name === 'fs' ? memoryFs : require(name), module: { exports: {} }, __dirname: app,
  process: { env: { DATA_DIR: '/fake' } }, fetch: fakeFetch, console, AbortSignal, URL,
  setInterval() {}, setTimeout() {} };
vm.runInNewContext(fs.readFileSync(path.join(app, 'trial.js'), 'utf8'), context, { filename: 'trial.js' });
const api = context.module.exports, T = api._test;
(async () => {
  const t = { id: 'race-id', vm: 'race-vm', zone: 'z1', status: 'ready', scrubbed: true,
    created: new Date(Date.now()-600000).toISOString(), expires: new Date(Date.now()+86400000).toISOString() };
  T.trials().push(t);
  const refreshing = T.refresh(t);
  while (!pending) await Promise.resolve();
  await T.remove(t, 'deleted by hospital');
  assert.equal(t.status, 'deleted');
  pending(response(404, {}));
  await refreshing;
  assert.equal(t.status, 'failed');
  console.log('REPRODUCED: late missing-instance refresh overwrites confirmed deletion with failed');

  // If an instance appears again after a missing/uncertain response, reconciliation appends rather than repairs.
  exists = true;
  await T.sweep();
  assert.equal(T.trials().filter(x => x.id === 'race-id').length, 2);
  let result;
  await api.handle({ method: 'GET', url: '/vipers-trial/api/status?id=race-id' }, {}, '/vipers-trial/api/status', (_res, code, body) => { result = { code, body }; }, () => false);
  assert.equal(result.body.status, 'failed');
  assert.equal(T.trials()[1].status, 'creating');
  console.log('REPRODUCED: recovery appends duplicate id; status endpoint keeps returning obsolete failed record');
})().catch(e => { console.error(e); process.exitCode = 1; });
