// Admission rules of the trial provisioner that depend on settings: a trial server is never run as the controller's
// own cloud identity unless that is explicitly accepted, and at most TRIAL_DAILY_MAX spaces are created per 24 hours.
// Fake metadata server and Compute API; nothing is created in the cloud.
const os = require('os'), fs = require('fs'), path = require('path');
const APP = process.env.APP || '/app';
const R = [];
const ok = (step, pass, note = '') => { R.push({ step, pass, note }); console.log(`${pass ? 'PASS' : 'FAIL'} | ${step}${note ? ' | ' + note : ''}`); };
let inserts = 0, saUsed = '';
const resp = (status, body) => ({ ok: status < 400, status, json: async () => body, text: async () => (typeof body === 'string' ? body : JSON.stringify(body)) });
global.fetch = async (url, opts = {}) => {
  if (url.includes('metadata.google.internal')) {
    const v = { '/project/project-id': 'proj', '/instance/zone': 'projects/1/zones/z1', '/instance/tags': '[]', '/network': 'projects/1/networks/default',
      '/email': 'controller@proj.iam', '/token': '{"access_token":"t"}' };
    for (const k in v) if (url.endsWith(k)) return resp(200, v[k]);
  }
  if (url.includes('/global/images/')) return resp(200, { labels: { 'vipers-boot-sealed': 'v1' } });
  if (url.includes('/instances?filter=')) return resp(200, { items: [] });
  if ((opts.method || 'GET') === 'POST' && /\/instances$/.test(url)) { inserts++; saUsed = JSON.parse(opts.body).serviceAccounts[0].email; return resp(200, { name: 'op', zone: 'zones/z1', status: 'DONE' }); }
  return resp(404, {});
};
function load(envs) {
  for (const k of ['TRIAL_SA', 'TRIAL_ALLOW_CONTROLLER_SA', 'TRIAL_DAILY_MAX']) delete process.env[k];
  Object.assign(process.env, envs, { DATA_DIR: fs.mkdtempSync(path.join(os.tmpdir(), 'adm-')), TENANT_SCRIPTS: '/nonexistent' });
  delete require.cache[require.resolve(path.join(APP, 'trial.js'))];
  return require(path.join(APP, 'trial.js'))._test;
}
const body = u => ({ hospital: 'Test Hospital', username: u, password: 'password123' });
(async () => {
  let T = load({});
  let r = await T.signup(body('noidentity'));
  ok('without TRIAL_SA, trials are refused (no controller identity by default)', r.status === 503 && inserts === 0);
  T = load({ TRIAL_ALLOW_CONTROLLER_SA: 'true' });
  r = await T.signup(body('explicitok'));
  ok('controller identity only with explicit TRIAL_ALLOW_CONTROLLER_SA=true', r.status === 200 && saUsed === 'controller@proj.iam');
  T = load({ TRIAL_SA: 'trial-runtime@proj.iam' });
  r = await T.signup(body('separatesa'));
  ok('a configured TRIAL_SA is the identity given to the trial server', r.status === 200 && saUsed === 'trial-runtime@proj.iam');
  T = load({ TRIAL_ALLOW_CONTROLLER_SA: 'true', TRIAL_DAILY_MAX: '2' });
  const a = await T.signup(body('day1')), b = await T.signup(body('day2'));
  T.trials().forEach(t => { t.status = 'deleted'; });             // free the capacity: only the daily cap may refuse now
  const c = await T.signup(body('day3'));
  ok('daily cap: the third space within 24 hours is refused even with free capacity', a.status === 200 && b.status === 200 && c.status === 503);
  const failed = R.filter(x => !x.pass).length;
  console.log(failed ? `${failed} FAILED` : 'ALL PASSED');
  process.exit(failed ? 1 : 0);
})();
