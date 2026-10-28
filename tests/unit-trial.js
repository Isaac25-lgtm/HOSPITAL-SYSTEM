// Unit test for the trial provisioner (edge/addons/trial.js) against a fake metadata server and Compute API.
// Nothing is created in the cloud.
//   docker run --rm -v /opt/vipers/edge/addons:/app -v /opt/vipers/tests:/t node:22-alpine node /t/unit-trial.js
const os = require('os'), fs = require('fs'), path = require('path');
const APP = process.env.APP || '/app';
const R = [];
const ok = (step, pass, note = '') => { R.push({ step, pass, note }); console.log(`${pass ? 'PASS' : 'FAIL'} | ${step}${note ? ' | ' + note : ''}`); };

// ---- fake cloud ----
const cloud = { instances: new Map(), inserts: 0, deletes: 0, deleteStatus: 200 };
const resp = (status, body) => ({ ok: status < 400, status, json: async () => body, text: async () => (typeof body === 'string' ? body : JSON.stringify(body)) });
global.fetch = async (url, opts = {}) => {
  const m = opts.method || 'GET';
  await new Promise(r => setTimeout(r, 5));                       // every call yields, like the network
  if (url.includes('metadata.google.internal')) {
    if (url.endsWith('/project/project-id')) return resp(200, 'proj');
    if (url.endsWith('/instance/zone')) return resp(200, 'projects/1/zones/z1');
    if (url.endsWith('/instance/tags')) return resp(200, '["vipers-web"]');
    if (url.endsWith('/network')) return resp(200, 'projects/1/networks/default');
    if (url.endsWith('/email')) return resp(200, 'sa@proj.iam');
    if (url.endsWith('/token')) return resp(200, '{"access_token":"t"}');
  }
  if (url.includes('compute.googleapis.com')) {
    const op = { name: 'op1', zone: 'zones/z1', status: 'DONE' };
    if (m === 'POST' && /\/instances$/.test(url)) {
      const b = JSON.parse(opts.body); cloud.inserts++;
      cloud.instances.set(b.name, { name: b.name, labels: b.labels, metadata: { fingerprint: 'f', items: b.metadata.items }, creationTimestamp: new Date().toISOString(), networkInterfaces: [{ accessConfigs: [{ natIP: '10.1.1.1' }] }] });
      return resp(200, op);
    }
    if (m === 'GET' && url.includes('/instances?filter=')) return resp(200, { items: [...cloud.instances.values()] });
    const name = (url.match(/\/instances\/([^/?]+)/) || [])[1];
    if (m === 'DELETE') { cloud.deletes++; if (cloud.deleteStatus !== 200) return resp(cloud.deleteStatus, { error: { message: 'denied' } }); cloud.instances.delete(name); return resp(200, op); }
    if (m === 'GET' && url.includes('/operations/')) return resp(200, op);
    if (m === 'GET' && name) return cloud.instances.has(name) ? resp(200, cloud.instances.get(name)) : resp(404, { error: { message: 'not found' } });
    if (m === 'POST' && url.endsWith('/setMetadata')) return resp(200, op);
  }
  if (url.includes('sslip.io')) return resp(404, {});
  return resp(500, {});
};

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'trial-'));
process.env.TENANT_SCRIPTS = path.join(APP, 'no-such-dir');
const trial = require(path.join(APP, 'trial.js'));
const T = trial._test;
const body = (u, h = 'Test Hospital') => ({ hospital: h, username: u, password: 'password123' });

(async () => {
  // 1. same username four times at once: one reservation, one server
  let r = await Promise.all([1, 2, 3, 4].map(() => T.signup(body('samename'))));
  ok('concurrent signups with one username create exactly one server', cloud.inserts === 1 && r.filter(x => x.status === 200).length === 1,
    `inserts=${cloud.inserts} statuses=${r.map(x => x.status)}`);

  // 2. different usernames at once: never more than TRIAL_MAX servers
  r = await Promise.all(['a1x', 'a2x', 'a3x', 'a4x'].map(u => T.signup(body(u))));
  ok(`never more than ${trial.TRIAL_MAX} servers at once`, cloud.instances.size === trial.TRIAL_MAX, `servers=${cloud.instances.size}`);

  // 3. instance labels carry id and expiry so the cloud can be reconciled
  const any = [...cloud.instances.values()][0];
  ok('servers are labelled with trial id and expiry', any.labels['vipers-trial-id'] && /^\d+$/.test(any.labels['vipers-expires']));
  ok('new servers receive the current add-on code and their delete token', ['vipers-addons-server', 'vipers-addons-trial', 'vipers-delete-token'].every(k => any.metadata.items.some(i => i.key === k && i.value)));

  // 4. expired server whose delete is refused keeps its slot and is retried
  const t0 = T.trials().find(t => t.status === 'creating');
  t0.expires = new Date(Date.now() - 1000).toISOString();
  cloud.deleteStatus = 403;
  await T.sweep();
  ok('refused delete keeps the record (slot held, not "failed")', t0.status === 'deleting', t0.status);
  const d1 = cloud.deletes;
  t0.deleteRequested = new Date(Date.now() - 11 * 60e3).toISOString();
  await T.sweep();
  ok('refused delete is retried on a later sweep', cloud.deletes > d1);
  cloud.deleteStatus = 200;
  t0.deleteRequested = new Date(Date.now() - 11 * 60e3).toISOString();
  await T.sweep();
  ok('delete confirmed only when the server is gone', t0.status === 'deleted' && !cloud.instances.has(t0.vm), t0.status);

  // 5. a server missing from the registry (lost registry) is adopted and will be deleted at its expiry
  cloud.instances.set('vh-orphan-1234', { name: 'vh-orphan-1234', labels: { 'vipers-trial': '1', 'vipers-trial-id': 'abc123abc123', 'vipers-expires': String(Math.floor(Date.now() / 1000) - 60) },
    metadata: { items: [] }, creationTimestamp: new Date().toISOString(), networkInterfaces: [{ accessConfigs: [{ natIP: '10.1.1.9' }] }] });
  await T.sweep();
  const orphan = T.trials().find(t => t.vm === 'vh-orphan-1234');
  ok('unknown labelled server is adopted from the cloud', !!orphan && orphan.adopted);
  ok('adopted server past its expiry is deleted', orphan && orphan.status === 'deleted' && !cloud.instances.has('vh-orphan-1234'), orphan && orphan.status);

  // 6. hospital deletes its own space: wrong token refused, right token deletes, token never stored
  const live = T.trials().find(t => t.status === 'creating');
  const tok = cloud.instances.get(live.vm).metadata.items.find(i => i.key === 'vipers-delete-token').value;
  ok('delete with a wrong token is refused', T.deleteRequest({ id: live.id, token: 'x'.repeat(48) }).status === 403 && live.status === 'creating');
  ok('delete with the right token is accepted', T.deleteRequest({ id: live.id, token: tok }).status === 202);
  for (let i = 0; i < 20 && live.status !== 'deleted'; i++) await new Promise(r => setTimeout(r, 50));
  ok('self-deleted space is removed from the cloud', live.status === 'deleted' && !cloud.instances.has(live.vm), live.status);
  ok('delete token is not stored in the registry', !JSON.stringify(T.trials()).includes(tok));

  // 7. registry is a valid JSON file after all of this
  let parsed = null; try { parsed = JSON.parse(fs.readFileSync(path.join(process.env.DATA_DIR, 'trials.json'), 'utf8')); } catch {}
  ok('registry on disk is valid and complete', Array.isArray(parsed) && parsed.length === T.trials().length);

  const failed = R.filter(x => !x.pass).length;
  console.log('RESULTS ' + JSON.stringify(R));
  console.log(failed ? `${failed} FAILED` : 'ALL PASSED');
  process.exit(failed ? 1 : 0);
})();
