// VIPERS HOSPITAL trial portal: each hospital opens an account and gets its own server (a copy of the finished
// system, made from the VIPERS image), deleted automatically after TRIAL_DAYS. At most TRIAL_MAX run at once.
// Servers are created and deleted through the Compute Engine API with this VM's own service account.
//
// Lifecycle of a trial record: creating -> ready -> deleting -> deleted, or creating -> failed. "creating", "ready"
// and "deleting" hold a slot: a slot is only released once the cloud confirms the server is gone. The registry is
// reconciled with the labelled servers that really exist on every sweep, so a lost or damaged registry cannot leave
// a server running past its expiry, and readiness is checked by the sweep itself (not only while a browser polls).
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const env = (k, d) => (process.env[k] === undefined || process.env[k] === '' ? d : process.env[k]);
const TRIAL_MAX = +env('TRIAL_MAX', 3);
const TRIAL_DAYS = +env('TRIAL_DAYS', 5);
const TRIAL_IMAGE = env('TRIAL_IMAGE', 'vipers-hospital-golden');
const TRIAL_MACHINE = env('TRIAL_MACHINE', 'e2-standard-4');
const TRIAL_DISK_GB = env('TRIAL_DISK_GB', '80');
// optional low-privilege identity for trial servers (default: this VM's own service account)
const TRIAL_SA = env('TRIAL_SA', '');
// optional ISO date after which this controller will not be running: no trial may outlive it
const CONTROLLER_UNTIL = env('TRIAL_CONTROLLER_UNTIL', '');
// first-boot scripts sent to each new server in its metadata, so servers made from an older image still get the
// current setup logic (mounted read-only from /opt/vipers/scripts; the copy inside the image is the fallback)
const TENANT_DIR = env('TENANT_SCRIPTS', '/app/tenant');
const STORE = path.join(env('DATA_DIR', '/data'), 'trials.json');
// this (main) server's public address: new servers fetch the current web layer from it at first boot
const CONTROLLER_URL = (h => h ? 'https://' + h : '')((env('DEMO_HOSTS', '').split(',').pop() || '').trim());
const MD = 'http://metadata.google.internal/computeMetadata/v1';
const HOLDS_SLOT = ['creating', 'ready', 'deleting'];
const READY_TIMEOUT = 40 * 60e3;
// Only the main demo server runs the portal. Hospital trial servers are copies of it and have public/site.json
// (written at the very start of their first boot): there the portal, provisioning and the sweep are off.
const SITE_FILE = path.join(__dirname, 'public', 'site.json');
const enabled = () => env('TRIAL_PORTAL', 'true') !== 'false' && !fs.existsSync(SITE_FILE);

// ---------- registry (atomic replace; a damaged file is kept aside and rebuilt from the cloud) ----------
let trials = [];
try {
  const j = JSON.parse(fs.readFileSync(STORE, 'utf8'));
  if (!Array.isArray(j)) throw new Error('not a list');
  trials = j.filter(t => t && typeof t.id === 'string' && typeof t.vm === 'string');
} catch (e) {
  if (e.code !== 'ENOENT') {
    console.error('trial store unreadable, rebuilding from the cloud:', e.message);
    try { fs.renameSync(STORE, STORE + '.corrupt-' + Date.now()); } catch {}
  }
}
function save() {
  try {
    const tmp = STORE + '.tmp', fd = fs.openSync(tmp, 'w');
    fs.writeSync(fd, JSON.stringify(trials, null, 1)); fs.fsyncSync(fd); fs.closeSync(fd);
    fs.renameSync(tmp, STORE);
    return true;
  } catch (e) { console.error('trial store write failed:', e.message); return false; }
}
const holding = () => trials.filter(t => HOLDS_SLOT.includes(t.status));
let reconciliation = null;
async function admissionCheck() {
  // Share one cloud check among simultaneous callers, then reserve synchronously below.
  if (!reconciliation) reconciliation = reconcile().finally(() => { reconciliation = null; });
  await reconciliation;
}

// ---------- Compute Engine API (service account token from the metadata server) ----------
const mdGet = async p => {
  const r = await fetch(MD + p, { headers: { 'Metadata-Flavor': 'Google' }, signal: AbortSignal.timeout(5000) });
  if (!r.ok) throw new Error('metadata ' + p + ' ' + r.status);
  return r.text();
};
let self = null;
async function whoami() {
  if (self) return self;
  const [project, zoneFull, tags, network, sa] = await Promise.all([
    mdGet('/project/project-id'), mdGet('/instance/zone'), mdGet('/instance/tags'),
    mdGet('/instance/network-interfaces/0/network'), mdGet('/instance/service-accounts/default/email')]);
  self = { project, zone: zoneFull.split('/').pop(), tags: JSON.parse(tags || '[]'), network: 'global/networks/' + network.split('/').pop(), sa };
  return self;
}
async function token() { return JSON.parse(await mdGet('/instance/service-accounts/default/token')).access_token; }
async function gce(method, p, body) {
  const s = await whoami();
  const r = await fetch(`https://compute.googleapis.com/compute/v1/projects/${s.project}${p}`, {
    method, headers: { Authorization: 'Bearer ' + await token(), 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(20000) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) { const e = new Error(`compute ${method} ${p}: ${r.status} ${(j.error && j.error.message) || ''}`.slice(0, 300)); e.status = r.status; throw e; }
  return j;
}
// a successful API response only means the operation was accepted: wait for it to finish and check its errors
async function waitOp(op, maxMs = 90e3) {
  const end = Date.now() + maxMs;
  while (op && op.status !== 'DONE' && Date.now() < end) {
    await new Promise(r => setTimeout(r, 3000));
    op = await gce('GET', `/zones/${op.zone.split('/').pop()}/operations/${op.name}`);
  }
  if (!op || op.status !== 'DONE') throw new Error('operation still running');
  if (op.error) throw new Error('operation failed: ' + JSON.stringify(op.error).slice(0, 200));
  return op;
}
async function instance(t) {
  try { return await gce('GET', `/zones/${t.zone}/instances/${t.vm}`); }
  catch (e) { if (e.status === 404) return null; throw e; }
}

// ---------- validation ----------
const slugify = s => s.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 20) || 'hospital';
function validate(b) {
  const hospital = String(b.hospital || '').replace(/\s+/g, ' ').trim();
  const username = String(b.username || '').trim().toLowerCase();
  const password = String(b.password || '');
  if (hospital.length < 3 || hospital.length > 60 || !/^[\p{L}\p{N} .,'&()-]+$/u.test(hospital)) return { error: 'Please enter the hospital name (3-60 letters).' };
  if (!/^[a-z][a-z0-9._-]{2,29}$/.test(username) || /^demo\./.test(username) || ['admin', 'superman', 'daemon'].includes(username))
    return { error: 'Username: 3-30 characters, starting with a letter (letters, numbers, dot, dash or underscore).' };
  if (password.length < 8 || password.length > 64 || !/[A-Za-z]/.test(password) || password.toLowerCase() === username)
    return { error: 'Password: at least 8 characters including a letter, and different from the username.' };
  return { hospital, username, password };
}
function readOwnFile(name) { try { return fs.readFileSync(path.join(__dirname, name), 'utf8'); } catch { return ''; } }
function readTenantFile(name) { try { return fs.readFileSync(path.join(TENANT_DIR, name), 'utf8'); } catch { return ''; } }
// small bootstrap: run the first-boot script sent in metadata (current version), or the image's copy
const STARTUP = `#!/bin/bash
M=http://metadata.google.internal/computeMetadata/v1/instance/attributes
F=/opt/vipers/tenant-firstboot.sh
curl -sf -H 'Metadata-Flavor: Google' "$M/vipers-firstboot" -o $F.new && [ -s $F.new ] && mv $F.new $F || cp /opt/vipers/scripts/tenant-firstboot.sh $F
curl -sf -H 'Metadata-Flavor: Google' "$M/vipers-crater-php" -o /opt/vipers/scripts/crater-hospital-user.php.new && [ -s /opt/vipers/scripts/crater-hospital-user.php.new ] && mv /opt/vipers/scripts/crater-hospital-user.php.new /opt/vipers/scripts/crater-hospital-user.php
VIPERS_EXPECTED_HOST="$(hostname)" bash $F
`;

// ---------- operations ----------
async function signup(body) {
  const v = validate(body);
  if (v.error) return { status: 400, body: { error: v.error } };
  let placement;
  try {
    await admissionCheck();
    placement = await whoami();
    const image = await gce('GET', `/global/images/${TRIAL_IMAGE}`);
    if (image.labels?.['vipers-boot-sealed'] !== 'v1') throw new Error('trial image is not boot-sealed v1');
  } catch (e) {
    console.error('trial admission unavailable:', e.message);
    return { status: 503, body: { error: 'Trial setup is temporarily unavailable. Please try again later.' } };
  }
  const now = Date.now(), expires = new Date(now + TRIAL_DAYS * 86400e3).toISOString();
  if (CONTROLLER_UNTIL && Date.parse(expires) > Date.parse(CONTROLLER_UNTIL))
    return { status: 503, body: { error: 'New trial spaces are paused at the moment. Please contact Motion Imprints Technologies.' } };
  // checks and reservation happen together, before any await, so simultaneous requests cannot all pass
  if (holding().some(t => t.username === v.username)) return { status: 409, body: { error: 'That username is already in use. Please choose another, or use "Log in to an existing account".' } };
  if (holding().length >= TRIAL_MAX) return { status: 503, body: { error: `All ${TRIAL_MAX} trial spaces are in use right now. Please try again in a day or two.` } };
  const id = crypto.randomBytes(6).toString('hex'), slug = slugify(v.hospital);
  // lets the hospital delete its own space later; only the hash is kept here
  const deleteToken = crypto.randomBytes(24).toString('hex');
  const t = { id, hospital: v.hospital, username: v.username, slug, vm: `vh-${slug}-${id.slice(0, 4)}`.slice(0, 60), zone: placement.zone, submitted: false,
    created: new Date(now).toISOString(), expires, billingEmail: `${v.username}@vipers.trial`, status: 'creating',
    deleteHash: crypto.createHash('sha256').update(deleteToken).digest('hex') };
  trials.push(t);
  if (!save()) { trials.splice(trials.indexOf(t), 1); return { status: 503, body: { error: 'The trial service is not available right now. Please try again later.' } }; }
  let s;
  try {
    s = await whoami(); t.zone = s.zone; save();
    const items = [
      { key: 'startup-script', value: STARTUP },
      { key: 'vipers-firstboot', value: readTenantFile('tenant-firstboot.sh') },
      { key: 'vipers-crater-php', value: readTenantFile('crater-hospital-user.php') },
      { key: 'vipers-hospital', value: v.hospital }, { key: 'vipers-username', value: v.username },
      { key: 'vipers-password', value: v.password }, { key: 'vipers-expires', value: expires },
      { key: 'vipers-billing-email', value: t.billingEmail }, { key: 'vipers-controller', value: CONTROLLER_URL },
      { key: 'vipers-ai-free-text', value: env('AI_ALLOW_FREE_TEXT', 'false') === 'true' ? 'true' : 'false' },
      { key: 'vipers-trial-id', value: id }, { key: 'vipers-delete-token', value: deleteToken },
      { key: 'vipers-delete-hash', value: t.deleteHash },
      // current add-on code, so servers made from an older image run the same portal/AI/self-delete logic
      { key: 'vipers-addons-server', value: readOwnFile('server.js') }, { key: 'vipers-addons-help', value: readOwnFile('help.js') },
      { key: 'vipers-addons-trial', value: readOwnFile('trial.js') }].filter(i => i.value);
    // Persist intent before dispatch: a timeout/crash after dispatch must retain the slot.
    t.submitted = true;
    if (!save()) { t.submitted = false; throw new Error('cannot persist create intent'); }
    await waitOp(await gce('POST', `/zones/${s.zone}/instances`, {
      name: t.vm, machineType: `zones/${s.zone}/machineTypes/${TRIAL_MACHINE}`,
      labels: { 'vipers-trial': '1', 'vipers-trial-id': id, 'vipers-expires': String(Math.floor(Date.parse(expires) / 1000)) },
      tags: { items: s.tags },
      disks: [{ boot: true, autoDelete: true, initializeParams: {
        sourceImage: `projects/${s.project}/global/images/${TRIAL_IMAGE}`,
        diskType: `zones/${s.zone}/diskTypes/pd-standard`, diskSizeGb: TRIAL_DISK_GB } }],
      networkInterfaces: [{ network: s.network, accessConfigs: [{ type: 'ONE_TO_ONE_NAT', name: 'External NAT', networkTier: 'PREMIUM' }] }],
      serviceAccounts: [{ email: TRIAL_SA || s.sa, scopes: ['https://www.googleapis.com/auth/cloud-platform'] }],
      metadata: { items },
    }));
  } catch (e) {
    console.error('trial create', e.message);
    // only a definite rejection frees the slot; after a timeout the server may exist, so the sweep decides
    if (!t.submitted || (e.status >= 400 && e.status < 500 && !(t.zone && await instance(t).catch(() => true)))) { t.status = 'failed'; t.error = e.message; }
    else t.uncertain = true;
    save();
    return { status: 500, body: { error: 'Could not create the trial space right now. Please try again later.' } };
  }
  console.log(`trial created ${t.vm} for "${v.hospital}" (${v.username}), expires ${expires}`);
  return { status: 200, body: { id, expires } };
}

const urlFor = t => t.ip ? `https://demo.${t.ip.replace(/\./g, '-')}.sslip.io/bahmni/home/index.html#/login` : null;
const natIp = inst => ((((inst.networkInterfaces || [])[0] || {}).accessConfigs || [])[0] || {}).natIP;

// remove the first-boot password from the instance metadata; retried on every refresh/sweep until confirmed
const SECRET_KEYS = ['vipers-password', 'vipers-delete-token'];
async function scrubPassword(t, inst) {
  const md = inst.metadata || {};
  if (!(md.items || []).some(i => SECRET_KEYS.includes(i.key))) { t.scrubbed = true; return; }
  try {
    const items = (md.items || []).filter(i => !SECRET_KEYS.includes(i.key));
    if (t.deleteHash && !items.some(i => i.key === 'vipers-delete-hash')) items.push({ key: 'vipers-delete-hash', value: t.deleteHash });
    await waitOp(await gce('POST', `/zones/${t.zone}/instances/${t.vm}/setMetadata`, { fingerprint: md.fingerprint, items }));
    const verified = await instance(t);
    if (!verified || (verified.metadata?.items || []).some(i => SECRET_KEYS.includes(i.key))) throw new Error('bootstrap secrets still present');
    t.scrubbed = true;
  } catch (e) { console.error('trial metadata scrub (will retry)', t.vm, e.message); }
}

async function refresh(t) {
  if (!['creating', 'ready'].includes(t.status) || !t.zone) return t;
  // Old registry versions could publish ready before scrubbing; fail closed on upgrade.
  if (t.status === 'ready' && !t.scrubbed) t.status = 'creating';
  try {
    const inst = await instance(t);
    if (!inst) {
      // just after creation the server may not be listed yet
      if (Date.now() - Date.parse(t.created) > 5 * 60e3) { t.status = 'failed'; t.error = 'instance missing'; save(); }
      return t;
    }
    t.uncertain = false;
    t.ip = natIp(inst) || t.ip;          // follows a new address after a stop/start
    let hospitalReady = t.status === 'ready';
    if (t.status === 'creating' && t.ip) {
      const r = await fetch(`https://demo.${t.ip.replace(/\./g, '-')}.sslip.io/vipers-assets/site.json`, { redirect: 'error', signal: AbortSignal.timeout(8000) }).catch(() => null);
      const site = r && r.ok ? await r.json().catch(() => null) : null;
      if (site && site.mode === 'hospital') hospitalReady = true;
      if (site && site.mode === 'hospital-failed') { t.setupFailed = true; }
    }
    if (hospitalReady) {
      // Recheck even a previously ready record: do not trust a cached scrub flag.
      t.scrubbed = false;
      await scrubPassword(t, inst);
      t.status = t.scrubbed ? 'ready' : 'creating';
      if (t.scrubbed) t.ready ||= new Date().toISOString();
    }
  } catch (e) { console.error('trial refresh', t.vm, e.message); }
  save();
  return t;
}

// delete and confirm; the record keeps its slot (status deleting) until the server is really gone
async function remove(t, reason) {
  if (!t.zone) {
    const s = await whoami();
    t.zone = s.zone;
    if (!(await instance(t))) { t.status = 'failed'; t.error = 'unsubmitted reservation recovered'; save(); return; }
  }
  try {
    if (t.status !== 'deleting' || Date.now() - Date.parse(t.deleteRequested || 0) > 10 * 60e3) {
      t.status = 'deleting'; t.reason = t.reason || reason; t.deleteRequested = new Date().toISOString(); save();
      await waitOp(await gce('DELETE', `/zones/${t.zone}/instances/${t.vm}`), 120e3);
    }
  } catch (e) { if (e.status !== 404) { t.lastError = e.message; console.error('trial delete (will retry)', t.vm, e.message); } }
  try {
    if (!(await instance(t))) { t.status = 'deleted'; t.deleted = new Date().toISOString(); console.log(`trial deleted ${t.vm} (${t.hospital}): ${t.reason}`); }
  } catch (e) { t.lastError = e.message; }
  save();
}

// adopt labelled servers missing from the registry (lost or damaged registry), so they are still deleted on time
async function reconcile() {
  const s = await whoami();
  const list = await gce('GET', `/zones/${s.zone}/instances?filter=${encodeURIComponent('labels.vipers-trial=1')}`);
  for (const inst of list.items || []) {
    if (trials.some(t => t.vm === inst.name && HOLDS_SLOT.includes(t.status))) continue;
    const l = inst.labels || {}, md = (inst.metadata && inst.metadata.items) || [];
    const mdv = k => (md.find(i => i.key === k) || {}).value || '';
    const created = inst.creationTimestamp || new Date().toISOString();
    const expires = l['vipers-expires'] ? new Date(+l['vipers-expires'] * 1000).toISOString()
      : (mdv('vipers-expires') || new Date(Date.parse(created) + TRIAL_DAYS * 86400e3).toISOString());
    trials.push({ id: l['vipers-trial-id'] || crypto.randomBytes(6).toString('hex'), hospital: mdv('vipers-hospital') || inst.name, username: mdv('vipers-username'),
      vm: inst.name, zone: s.zone, created, expires, status: 'creating', adopted: true,
      deleteHash: /^[a-f0-9]{64}$/.test(mdv('vipers-delete-hash')) ? mdv('vipers-delete-hash') :
        (mdv('vipers-delete-token') ? crypto.createHash('sha256').update(mdv('vipers-delete-token')).digest('hex') : undefined) });
    console.error('trial adopted from the cloud (not in registry):', inst.name);
  }
  save();
}

let sweeping = false;
async function sweep() {
  if (!enabled() || sweeping) return;
  sweeping = true;
  try {
    await reconcile().catch(e => console.error('trial reconcile', e.message));
    for (const t of trials.filter(x => ['creating', 'ready'].includes(x.status))) await refresh(t);
    for (const t of trials.filter(x => HOLDS_SLOT.includes(x.status))) {
      if (t.status === 'deleting') await remove(t);
      else if (Date.parse(t.expires) < Date.now()) await remove(t, 'expired');
      else if (t.status === 'creating' && Date.now() - Date.parse(t.created) > READY_TIMEOUT) await remove(t, 'not ready after 40 minutes');
    }
  } finally { sweeping = false; }
}
setInterval(() => sweep().catch(e => console.error('trial sweep', e.message)), 5 * 60e3);
setTimeout(() => sweep().catch(e => console.error('trial sweep', e.message)), 30e3);

// ---------- HTTP ----------
function portalPage() {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>VIPERS HOSPITAL - Hospital trial</title><link rel="icon" href="/vipers-assets/favicon.svg"><link rel="stylesheet" href="/vipers-assets/trial.css"></head>
<body><main class="tp">
<img class="tp-logo" src="/vipers-assets/logo.svg" alt="VIPERS HOSPITAL">
<h1>Try VIPERS HOSPITAL in your own hospital space</h1>
<p class="tp-sub">Each hospital gets its own private copy of the system - every module, one login. Example patients are included so you can start straight away.</p>
<p class="tp-note">Trial spaces are deleted automatically after ${TRIAL_DAYS} days, together with all data entered. Use fictional patient information only.</p>
<div class="tp-tabs" role="tablist"><button type="button" role="tab" aria-selected="true" data-tab="open">Open an account</button><button type="button" role="tab" aria-selected="false" data-tab="login">Log in to an existing account</button></div>
<form id="tp-open" class="tp-card" autocomplete="off">
<label>Hospital name<input name="hospital" required maxlength="60" placeholder="e.g. St. Mary's Health Centre"></label>
<label>Username<input name="username" required maxlength="30" autocapitalize="none" placeholder="e.g. stmarys"></label>
<label>Password<input name="password" type="password" required minlength="8" maxlength="64" placeholder="At least 8 characters"></label>
<button type="submit">Create my hospital space</button><p class="tp-msg" role="status"></p></form>
<form id="tp-login" class="tp-card" hidden autocomplete="off">
<label>Username<input name="username" required maxlength="30" autocapitalize="none"></label>
<button type="submit">Continue to my hospital space</button><p class="tp-msg" role="status"></p></form>
<p class="tp-foot">VIPERS HOSPITAL by Motion Imprints Technologies - <a href="/vipers-assets/about.html">About &amp; licences</a></p>
</main><script src="/vipers-assets/trial.js"></script></body></html>`;
}

async function readJson(req) {
  return new Promise((ok, bad) => { let s = ''; req.on('data', c => { s += c; if (s.length > 4096) { bad(new Error('too large')); req.destroy(); } });
    req.on('end', () => { try { const j = JSON.parse(s || '{}'); ok(j && typeof j === 'object' && !Array.isArray(j) ? j : {}); } catch (e) { bad(e); } }); req.on('error', bad); });
}

// ---------- deleting a hospital space ----------
// On the hospital's own server: the signed-in hospital asks for its account (and space) to be deleted, confirming
// with the account password, which is checked directly against OpenMRS. (Bahmni's session cookie is scoped to
// /openmrs, so it never reaches this endpoint; re-entering the password is also the safer confirmation.)
const siteInfo = () => { try { return JSON.parse(fs.readFileSync(SITE_FILE, 'utf8')); } catch { return {}; } };
async function passwordOk(username, password) {
  if (!password || password.length > 128) return false;
  const r = await fetch('http://openmrs:8080/openmrs/ws/rest/v1/session?v=custom:(authenticated,user:(username))',
    { headers: { Authorization: 'Basic ' + Buffer.from(username + ':' + password).toString('base64'), Accept: 'application/json' },
      signal: AbortSignal.timeout(8000) }).catch(() => null);
  const j = r && r.ok ? await r.json().catch(() => null) : null;
  return !!(j && j.authenticated && j.user && j.user.username === username);
}
async function selfDelete(req, body) {
  const site = siteInfo(), id = env('TRIAL_ID', ''), tok = env('TRIAL_DELETE_TOKEN', ''), ctl = env('TRIAL_CONTROLLER', '');
  if (site.mode !== 'hospital' || !id || !tok || !ctl) return { status: 404, body: { error: 'Deleting is not available on this server.' } };
  if (!(await passwordOk(site.username, String(body.password || '')))) return { status: 403, body: { error: 'That password is not correct.' } };
  const r = await fetch(ctl + '/vipers-trial/api/delete', { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id, token: tok }), signal: AbortSignal.timeout(20000) }).catch(() => null);
  if (!r || r.status !== 202) return { status: 502, body: { error: 'The deletion could not be started. Please try again in a few minutes.' } };
  console.log('hospital asked for its space to be deleted');
  return { status: 202, body: { ok: true } };
}
// On the main server: delete the trial whose secret token matches (sent only to that trial's server)
function deleteRequest(body) {
  const t = trials.find(x => x.id === String(body.id || '') && x.deleteHash);
  const h = crypto.createHash('sha256').update(String(body.token || '')).digest('hex');
  if (!t || !crypto.timingSafeEqual(Buffer.from(h), Buffer.from(t.deleteHash))) return { status: 403, body: { error: 'not allowed' } };
  if (t.status === 'creating' || t.status === 'ready') {
    console.log(`trial ${t.vm} deletion requested by the hospital`);
    remove(t, 'deleted by the hospital').catch(e => console.error('trial delete', e.message));
  }
  return { status: 202, body: { ok: true } };
}

// returns true when the request was handled
async function handle(req, res, p, send, limited) {
  if (p === '/vipers-trial/api/self-delete' && req.method === 'POST') {
    if (limited('selfdel', 5, 3600e3)) return send(res, 429, { error: 'Too many attempts. Please try again later.' }), true;
    const r = await selfDelete(req, await readJson(req).catch(() => ({})));
    return send(res, r.status, r.body), true;
  }
  if (!enabled()) { res.writeHead(302, { Location: '/bahmni/home/', 'Cache-Control': 'no-store' }); res.end(); return true; }
  if (p === '/vipers-trial' || p === '/vipers-trial/') return send(res, 200, portalPage(), 'text/html; charset=utf-8'), true;
  if (p === '/vipers-trial/api/signup' && req.method === 'POST') {
    if (limited('signup', 5, 3600e3)) return send(res, 429, { error: 'Too many attempts from this connection. Please try again later.' }), true;
    const body = await readJson(req).catch(() => ({}));
    const r = await signup(body);
    return send(res, r.status, r.body), true;
  }
  if (p === '/vipers-trial/api/status') {
    const id = new URL(req.url, 'http://x').searchParams.get('id');
    const t = trials.find(x => x.id === id);
    if (!t) return send(res, 404, { error: 'unknown' }), true;
    await refresh(t);
    const status = t.status === 'deleting' || t.status === 'deleted' ? 'deleted' : t.status;
    return send(res, 200, { status, hospital: t.hospital, expires: t.expires, url: t.status === 'ready' ? urlFor(t) : null }), true;
  }
  if (p === '/vipers-trial/api/delete' && req.method === 'POST') {
    if (limited('delete', 10, 3600e3)) return send(res, 429, { error: 'too many attempts' }), true;
    const r = deleteRequest(await readJson(req).catch(() => ({})));
    return send(res, r.status, r.body), true;
  }
  if (p === '/vipers-trial/api/find' && req.method === 'POST') {
    if (limited('find', 30, 3600e3)) return send(res, 429, { error: 'Too many attempts. Please try again later.' }), true;
    const body = await readJson(req).catch(() => ({}));
    const u = String(body.username || '').trim().toLowerCase();
    const t = trials.find(x => x.username === u && (x.status === 'creating' || x.status === 'ready'));
    if (!t) return send(res, 404, { error: 'No active hospital space with that username. Trial spaces are deleted after ' + TRIAL_DAYS + ' days.' }), true;
    await refresh(t);
    if (t.status !== 'ready') return send(res, 202, { status: t.status, id: t.id, error: 'Your hospital space is still being prepared.' }), true;
    return send(res, 200, { url: urlFor(t), hospital: t.hospital, expires: t.expires }), true;
  }
  return false;
}

module.exports = { handle, TRIAL_MAX, TRIAL_DAYS, _test: { signup, sweep, refresh, deleteRequest, trials: () => trials } };
