// VIPERS HOSPITAL trial portal: each hospital opens an account and gets its own server (a copy of the finished
// system, made from the VIPERS image), deleted automatically after TRIAL_DAYS. At most TRIAL_MAX run at once.
// Servers are created and deleted through the Compute Engine API with this VM's own service account.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const env = (k, d) => (process.env[k] === undefined || process.env[k] === '' ? d : process.env[k]);
const TRIAL_MAX = +env('TRIAL_MAX', 3);
const TRIAL_DAYS = +env('TRIAL_DAYS', 5);
const TRIAL_IMAGE = env('TRIAL_IMAGE', 'vipers-hospital-golden');
const TRIAL_MACHINE = env('TRIAL_MACHINE', 'e2-standard-4');
const TRIAL_DISK_GB = env('TRIAL_DISK_GB', '80');
const STORE = path.join(env('DATA_DIR', '/data'), 'trials.json');
const MD = 'http://metadata.google.internal/computeMetadata/v1';
// Only the main demo server runs the portal. Hospital trial servers are copies of it and have public/site.json
// (written at the very start of their first boot): there the portal, provisioning and the sweep are off.
const SITE_FILE = path.join(__dirname, 'public', 'site.json');
const enabled = () => env('TRIAL_PORTAL', 'true') !== 'false' && !fs.existsSync(SITE_FILE);

let trials = [];
try { trials = JSON.parse(fs.readFileSync(STORE, 'utf8')); } catch {}
const save = () => { try { fs.writeFileSync(STORE, JSON.stringify(trials, null, 1)); } catch (e) { console.error('trial store', e.message); } };
const active = () => trials.filter(t => t.status === 'creating' || t.status === 'ready');

// ---------- Compute Engine API (service account token from the metadata server) ----------
const mdGet = async p => { const r = await fetch(MD + p, { headers: { 'Metadata-Flavor': 'Google' } }); if (!r.ok) throw new Error('metadata ' + p + ' ' + r.status); return r.text(); };
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
    method, headers: { Authorization: 'Bearer ' + await token(), 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`compute ${method} ${p}: ${r.status} ${(j.error && j.error.message) || ''}`.slice(0, 300));
  return j;
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

// ---------- operations ----------
async function signup(body) {
  const v = validate(body);
  if (v.error) return { status: 400, body: { error: v.error } };
  if (active().some(t => t.username === v.username)) return { status: 409, body: { error: 'That username is already in use. Please choose another, or use "Log in to an existing account".' } };
  if (active().length >= TRIAL_MAX) return { status: 503, body: { error: `All ${TRIAL_MAX} trial spaces are in use right now. Please try again in a day or two.` } };
  const s = await whoami();
  const id = crypto.randomBytes(6).toString('hex');
  const slug = slugify(v.hospital);
  const vm = `vh-${slug}-${id.slice(0, 4)}`.slice(0, 60);
  const now = Date.now(), expires = new Date(now + TRIAL_DAYS * 86400e3).toISOString();
  const billingEmail = `${v.username}@vipers.trial`;
  const t = { id, hospital: v.hospital, username: v.username, slug, vm, zone: s.zone, created: new Date(now).toISOString(), expires, billingEmail, status: 'creating' };
  trials.push(t); save();
  try {
    await gce('POST', `/zones/${s.zone}/instances`, {
      name: vm, machineType: `zones/${s.zone}/machineTypes/${TRIAL_MACHINE}`,
      labels: { 'vipers-trial': '1' }, tags: { items: s.tags },
      disks: [{ boot: true, autoDelete: true, initializeParams: {
        sourceImage: `projects/${s.project}/global/images/${TRIAL_IMAGE}`,
        diskType: `zones/${s.zone}/diskTypes/pd-standard`, diskSizeGb: TRIAL_DISK_GB } }],
      networkInterfaces: [{ network: s.network, accessConfigs: [{ type: 'ONE_TO_ONE_NAT', name: 'External NAT', networkTier: 'PREMIUM' }] }],
      serviceAccounts: [{ email: s.sa, scopes: ['https://www.googleapis.com/auth/cloud-platform'] }],
      metadata: { items: [
        { key: 'startup-script', value: '#!/bin/bash\nbash /opt/vipers/scripts/tenant-firstboot.sh' },
        { key: 'vipers-hospital', value: v.hospital }, { key: 'vipers-username', value: v.username },
        { key: 'vipers-password', value: v.password }, { key: 'vipers-expires', value: expires },
        { key: 'vipers-billing-email', value: billingEmail }] },
    });
  } catch (e) {
    t.status = 'failed'; t.error = e.message; save();
    console.error('trial create', e.message);
    return { status: 500, body: { error: 'Could not create the trial space right now. Please try again later.' } };
  }
  console.log(`trial created ${vm} for "${v.hospital}" (${v.username}), expires ${expires}`);
  return { status: 200, body: { id, expires } };
}

const urlFor = t => t.ip ? `https://demo.${t.ip.replace(/\./g, '-')}.sslip.io/bahmni/home/index.html#/login` : null;

async function refresh(t) {
  if (t.status !== 'creating') return t;
  try {
    const inst = await gce('GET', `/zones/${t.zone}/instances/${t.vm}`);
    t.ip = (((inst.networkInterfaces || [])[0] || {}).accessConfigs || [{}])[0].natIP || t.ip;
    if (t.ip) {
      const r = await fetch(`https://demo.${t.ip.replace(/\./g, '-')}.sslip.io/vipers-assets/site.json`, { signal: AbortSignal.timeout(8000) }).catch(() => null);
      const site = r && r.ok ? await r.json().catch(() => null) : null;
      if (site && site.mode === 'hospital') {
        t.status = 'ready'; t.ready = new Date().toISOString();
        // the password was only needed for first boot: remove it from the instance metadata
        const md = inst.metadata || {};
        await gce('POST', `/zones/${t.zone}/instances/${t.vm}/setMetadata`, { fingerprint: md.fingerprint, items: (md.items || []).filter(i => i.key !== 'vipers-password') }).catch(e => console.error('trial metadata', e.message));
        console.log(`trial ready ${t.vm} ${t.ip}`);
      }
    }
  } catch (e) { if (/404/.test(e.message)) { t.status = 'failed'; t.error = 'instance missing'; } }
  save();
  return t;
}

async function sweep() {
  if (!enabled()) return;
  for (const t of trials.filter(x => (x.status === 'creating' || x.status === 'ready') && Date.parse(x.expires) < Date.now())) {
    try { await gce('DELETE', `/zones/${t.zone}/instances/${t.vm}`); } catch (e) { if (!/404/.test(e.message)) { console.error('trial delete', e.message); continue; } }
    t.status = 'deleted'; t.deleted = new Date().toISOString(); save();
    console.log(`trial expired and deleted ${t.vm} (${t.hospital})`);
  }
  // a server that never became ready within 40 minutes is removed so it does not hold a slot
  for (const t of trials.filter(x => x.status === 'creating' && Date.now() - Date.parse(x.created) > 40 * 60e3)) {
    try { await gce('DELETE', `/zones/${t.zone}/instances/${t.vm}`); } catch {}
    t.status = 'failed'; t.error = 'not ready after 40 minutes'; save();
  }
}
setInterval(() => sweep().catch(e => console.error('trial sweep', e.message)), 10 * 60e3);
setTimeout(() => sweep().catch(() => {}), 30e3);

// ---------- HTTP ----------
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
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
    req.on('end', () => { try { ok(JSON.parse(s || '{}')); } catch (e) { bad(e); } }); req.on('error', bad); });
}

// returns true when the request was handled
async function handle(req, res, p, send, limited) {
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
    return send(res, 200, { status: t.status, hospital: t.hospital, expires: t.expires, url: t.status === 'ready' ? urlFor(t) : null }), true;
  }
  if (p === '/vipers-trial/api/find' && req.method === 'POST') {
    if (limited('find', 30, 3600e3)) return send(res, 429, { error: 'Too many attempts. Please try again later.' }), true;
    const body = await readJson(req).catch(() => ({}));
    const u = String(body.username || '').trim().toLowerCase();
    const t = active().find(x => x.username === u);
    if (!t) return send(res, 404, { error: 'No active hospital space with that username. Trial spaces are deleted after ' + TRIAL_DAYS + ' days.' }), true;
    await refresh(t);
    if (t.status !== 'ready') return send(res, 202, { status: t.status, id: t.id, error: 'Your hospital space is still being prepared.' }), true;
    return send(res, 200, { url: urlFor(t), hospital: t.hospital, expires: t.expires }), true;
  }
  return false;
}

module.exports = { handle, TRIAL_MAX, TRIAL_DAYS };
