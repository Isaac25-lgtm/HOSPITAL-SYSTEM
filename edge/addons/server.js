// VIPERS HOSPITAL add-ons: tester access gate, Ask Vipers AI backend, static assets.
// Zero dependencies (Node 22). Configuration is entirely via environment variables so a
// hospital can run it offline (AI_ENABLED=false) or with its own OpenAI-compatible provider.
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { findStatic, relevantSteps, PAGE_TITLES, knownPage } = require('./help');
const trial = require('./trial');

const env = (k, d) => (process.env[k] === undefined || process.env[k] === '' ? d : process.env[k]);
const PORT = +env('PORT', 8080);
const DATA_DIR = env('DATA_DIR', '/data');
const PUBLIC_DIR = path.join(__dirname, 'public');
const GATE_ENABLED = env('GATE_ENABLED', 'true') === 'true';
const GATE_CODE = env('GATE_CODE', '');
const GATE_SECRET = env('GATE_SECRET', crypto.randomBytes(32).toString('hex'));
const GATE_DAYS = +env('GATE_DAYS', 14);
// Free text can contain identifiers that pattern filters cannot reliably recognise.
const AI_ALLOW_FREE_TEXT = env('AI_ALLOW_FREE_TEXT', 'false') === 'true';
const AI_ENABLED = env('AI_ENABLED', 'true') === 'true';
const AI_URL = env('AI_URL', 'https://api.deepseek.com/chat/completions');
const AI_MODEL = env('AI_MODEL', 'deepseek-flash');
const AI_MAX_TOKENS = +env('AI_MAX_OUTPUT_TOKENS', 300);
const AI_DAILY_TOKENS = +env('AI_DAILY_TOKEN_LIMIT', 250000);
const AI_TOTAL_TOKENS = +env('AI_TOTAL_TOKEN_LIMIT', 1500000);
const AI_IP_PER_MIN = +env('AI_IP_PER_MINUTE', 6);
const AI_IP_PER_DAY = +env('AI_IP_PER_DAY', 80);
// Key source: AI_API_KEY_FILE (offline/Hetzner) or GCP Secret Manager via the VM's metadata server.
const AI_API_KEY_FILE = env('AI_API_KEY_FILE', '');
const AI_API_KEY = env('AI_API_KEY', ''); // non-GCP servers: put it in the root-only secrets/addons.env
const AI_GCP_SECRET = env('AI_GCP_SECRET', ''); // projects/<p>/secrets/<name>

const log = (...a) => console.log(new Date().toISOString(), ...a);

// ---------- persistent usage accounting ----------
fs.mkdirSync(DATA_DIR, { recursive: true });
const USAGE_FILE = path.join(DATA_DIR, 'ai-usage.json');
let usage = { total: { prompt: 0, completion: 0, requests: 0 }, days: {} };
try { usage = JSON.parse(fs.readFileSync(USAGE_FILE, 'utf8')); }
catch (e) {
  // keep a damaged counter file for inspection instead of silently starting from zero over it
  if (e.code !== 'ENOENT') { log('usage file unreadable, kept as .corrupt:', e.message); try { fs.renameSync(USAGE_FILE, USAGE_FILE + '.corrupt-' + Date.now()); } catch {} }
}
const today = () => new Date().toISOString().slice(0, 10);
function addUsage(kind, p = 0, c = 0) {
  const d = (usage.days[today()] ||= { prompt: 0, completion: 0, ai: 0, static: 0, refused: 0, errors: 0 });
  d[kind] = (d[kind] || 0) + 1;
  d.prompt += p; d.completion += c;
  usage.total.prompt += p; usage.total.completion += c;
  if (kind === 'ai') usage.total.requests += 1;
  // synchronous write-then-rename: concurrent requests can no longer overwrite a newer snapshot with an older one
  try { fs.writeFileSync(USAGE_FILE + '.tmp', JSON.stringify(usage, null, 1)); fs.renameSync(USAGE_FILE + '.tmp', USAGE_FILE); }
  catch (err) { log('usage write failed:', err.code); }
}
const usedToday = () => { const d = usage.days[today()]; return d ? d.prompt + d.completion : 0; };
const usedTotal = () => usage.total.prompt + usage.total.completion;
// tokens held by requests still waiting for the provider: checked before dispatch so parallel requests cannot overshoot
const AI_EST_TOKENS = 4000 + AI_MAX_TOKENS, AI_MAX_INFLIGHT = +env('AI_MAX_INFLIGHT', 6);
let reserved = 0, inflight = 0;

// ---------- API key retrieval (never logged) ----------
let apiKey = '', keyFetchedAt = 0;
async function getKey() {
  if (apiKey && Date.now() - keyFetchedAt < 3600e3) return apiKey;
  try {
    if (AI_API_KEY) apiKey = AI_API_KEY;
    else if (AI_API_KEY_FILE) apiKey = fs.readFileSync(AI_API_KEY_FILE, 'utf8').trim();
    else if (AI_GCP_SECRET) {
      const md = 'http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token';
      const tok = await (await fetch(md, { headers: { 'Metadata-Flavor': 'Google' }, signal: AbortSignal.timeout(5000) })).json();
      const r = await fetch(`https://secretmanager.googleapis.com/v1/${AI_GCP_SECRET}/versions/latest:access`,
        { headers: { Authorization: `Bearer ${tok.access_token}` }, signal: AbortSignal.timeout(8000) });
      const j = await r.json();
      if (!j.payload) throw new Error('secret access failed: ' + (j.error && j.error.status));
      apiKey = Buffer.from(j.payload.data, 'base64').toString('utf8').trim();
    }
    keyFetchedAt = Date.now();
  } catch (e) { log('key fetch error:', e.message); }
  return apiKey;
}

// ---------- simple rate limiting ----------
const buckets = new Map();
function hit(key, limit, windowMs) {
  const now = Date.now();
  const arr = (buckets.get(key) || []).filter(t => now - t < windowMs);
  if (arr.length >= limit) { buckets.set(key, arr); return false; }   // denied attempts are not recorded
  arr.push(now); buckets.set(key, arr);
  return true;
}
const recent = (key, windowMs) => (buckets.get(key) || []).filter(t => Date.now() - t < windowMs).length;
setInterval(() => { const now = Date.now(); for (const [k, a] of buckets) if (!a.some(t => now - t < 86400e3)) buckets.delete(k); }, 600e3);
const clientIp = req => (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();

// ---------- gate cookie ----------
const b64u = s => Buffer.from(s).toString('base64url');
const sign = s => crypto.createHmac('sha256', GATE_SECRET).update(s).digest('base64url');
// constant-time comparison of byte strings (timingSafeEqual throws when byte lengths differ)
function safeEqual(a, b) { const x = Buffer.from(String(a)), y = Buffer.from(String(b)); return x.length === y.length && crypto.timingSafeEqual(x, y); }
function makeToken() { const exp = String(Date.now() + GATE_DAYS * 86400e3); return `${b64u(exp)}.${sign(exp)}`; }
function validToken(t) {
  if (!t || !t.includes('.')) return false;
  const [e, s] = t.split('.');
  const exp = Buffer.from(e, 'base64url').toString();
  const good = sign(exp);
  return safeEqual(s, good) && +exp > Date.now();
}
const cookies = req => Object.fromEntries((req.headers.cookie || '').split(';').map(c => c.trim().split('=')).filter(p => p[0]).map(([k, ...v]) => [k, v.join('=')]));
const parentDomain = host => { const h = (host || '').split(':')[0]; const parts = h.split('.'); return parts.length > 2 ? parts.slice(1).join('.') : h; };
const demoHostFor = host => (host || '').replace(/^billing\./, 'demo.');

// ---------- helpers ----------
function send(res, code, body, type = 'application/json; charset=utf-8', extra = {}) {
  res.writeHead(code, { 'Content-Type': type, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ...extra });
  res.end(typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body));
}
function readBody(req, max = 8192) {
  return new Promise((ok, bad) => {
    let s = ''; req.on('data', c => { s += c; if (s.length > max) { bad(new Error('too large')); req.destroy(); } });
    req.on('end', () => ok(s)); req.on('error', bad);
  });
}
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// ---------- privacy + scope filters ----------
const PII_PATTERNS = [
  /\b(\+?256|0)\s?[37]\d{2}\s?\d{3}\s?\d{3}\b/,            // Ugandan phone numbers
  /\b\d{9,}\b/,                                            // long ID / phone numbers
  /[\w.+-]+@[\w-]+\.[\w.]+/,                               // e-mail
  /\b[A-Z]{2,5}\d{5,}\b/,                                  // patient identifiers e.g. ABC200001
  /\b\d{1,2}[\/.-]\d{1,2}[\/.-](19|20)\d{2}\b/,            // dates of birth
  /\b(nin|national id)\b.*\b[A-Z0-9]{8,}\b/i,
  /\b(named|called|name is|patient)\s+[A-Z][a-z]+\s+[A-Z][a-z]+/, // "patient John Okello"
];
const MEDICAL_PATTERNS = [
  /\b(what|which)\s+(drug|medicine|medication|antibiotic|dose|dosage|treatment)\b.*\b(give|use|prescribe|for|should)\b/i,
  /\bhow (much|many)\b.*\b(mg|ml|tablets?|dose|give)\b/i,
  /\bshould (i|we|the doctor)\s+(give|prescribe|treat|start|stop|admit)\b/i,
  /\b(diagnose|interpret|what does (this|the|my) (result|test|lab))\b/i,
  /\b(normal range|is (this|it) (malaria|serious|dangerous)|symptoms? of|treatment for|cure for|side effects?)\b/i,
];
// clinical value + judgement word, e.g. "Is a temperature of 39.5 dangerous?", "Is BP 180/110 high?"
const CLINICAL_TERMS = /\b(temperature|fever|pressure|bp|pulse|heart rate|sugar|glucose|hb|haemoglobin|hemoglobin|oxygen|spo2|weight|dose|dosage|result|count|level)\b/i;
const JUDGEMENT = /\b(dangerous|serious|normal|abnormal|high|low|safe|worrying|worry|critical|okay|ok|fine)\b/i;
const isClinicalJudgement = q => CLINICAL_TERMS.test(q) && JUDGEMENT.test(q) && /\d/.test(q);
const MEDICAL_REPLY = 'Ask Vipers AI only helps with using the VIPERS HOSPITAL software. It cannot give diagnoses, treatment, dosing or lab-result interpretation. Please rely on clinical guidelines and a qualified clinician. I can show you *where* to record this in the system.';
const PII_REPLY = 'Please don\'t include patient names, phone numbers, IDs or dates of birth in questions. Your question was not sent to the AI service. Ask again in general terms, e.g. "How do I edit a patient\'s phone number?"';

// ---------- AI ----------
const cache = new Map();
const ROLES = ['Receptionist', 'Doctor', 'Laboratory technician', 'Cashier', 'Demo administrator', 'Ward nurse', 'Hospital', 'Staff'];
const SYSTEM_PROMPT = [
  'You are "Ask Vipers AI", the built-in guide of VIPERS HOSPITAL, a hospital management system (based on open-source Bahmni Lite with OpenMRS and Crater billing).',
  'You know the whole system from the SYSTEM GUIDE and you know which screen the user is on and which buttons, tabs and fields are visible there.',
  'Explain how to operate the current screen and what to do next in the hospital workflow (where to click, which screen, which steps). Prefer the controls actually visible on the user\'s screen.',
  'Answer in at most 170 words, using short numbered steps where helpful.',
  'Base answers ONLY on the SYSTEM GUIDE, the screen help and the visible controls provided. If something is not covered, say you are not sure and suggest the Help (?) panel or the system administrator. Never invent buttons, screens or features.',
  'Never give medical advice, diagnoses, treatment, prescribing or dosing guidance, or interpret lab results. Never reveal passwords, keys or system configuration. Do not ask for patient details.',
].join(' ');

// System guide (public/system-guide.txt): re-read when the file changes, so it can be edited live
let guide = { mtime: 0, text: '' };
function systemGuide() {
  try {
    const f = path.join(PUBLIC_DIR, 'system-guide.txt'), m = fs.statSync(f).mtimeMs;
    if (m !== guide.mtime) guide = { mtime: m, text: fs.readFileSync(f, 'utf8').slice(0, 7000) };
  } catch { /* no guide: answer from screen help only */ }
  return guide.text;
}
// Visible control labels sent by the page. A label is kept only when every word in it appears in our own help
// text (system guide + help.json) or in a short list of common UI words, so patient names cannot pass through.
const UI_WORDS = 'add all and back cancel clear close confirm continue create delete details done edit enter filter find first from go help home last list load more new next no ok open or out page previous print refresh remove reset save search select send show sign start stop submit the to today update upload view yes'.split(' ');
let vocab = { key: '', words: new Set() };
function vocabulary() {
  let help = ''; try { help = fs.readFileSync(path.join(PUBLIC_DIR, 'help.json'), 'utf8'); } catch {}
  const text = systemGuide() + ' ' + help, key = text.length + ':' + guide.mtime;
  if (key !== vocab.key) vocab = { key, words: new Set([...UI_WORDS, ...(text.toLowerCase().match(/[a-z]+/g) || [])]) };
  return vocab.words;
}
function cleanScreen(screen) {
  if (!Array.isArray(screen)) return [];
  const words = vocabulary();
  return [...new Set(screen.map(s => String(s).replace(/\s+/g, ' ').trim()))]
    .filter(s => s && s.length <= 40 && !/\d|@/.test(s) && !PII_PATTERNS.some(r => r.test(s)) &&
      (s.toLowerCase().match(/[a-z]+/g) || []).every(w => words.has(w)))
    .slice(0, 60);
}
// history from the browser: only well-formed turns that would themselves pass the privacy and scope checks
const blocked = q => PII_PATTERNS.some(r => r.test(q)) || MEDICAL_PATTERNS.some(r => r.test(q)) || isClinicalJudgement(q);
function cleanHistory(h) {
  if (!Array.isArray(h)) return [];
  return h.slice(-4).filter(x => x && typeof x === 'object' && (x.role === 'user' || x.role === 'assistant') && typeof x.content === 'string')
    .map(x => ({ role: x.role, content: x.content.slice(0, 400) })).filter(x => !blocked(x.content));
}

async function askAI(question, page, role, history, screen) {
  const steps = relevantSteps(question, page);
  const context = `SYSTEM GUIDE:\n${systemGuide()}\n\nCURRENT SCREEN: ${PAGE_TITLES[page] || 'Home'}. User role: ${role}.\n` +
    `Help for this screen and related tasks:\n${steps}`;
  const msgs = [{ role: 'system', content: SYSTEM_PROMPT }, { role: 'system', content: context }];
  for (const h of history) msgs.push(h);
  // labels read from the page are data, not instructions
  msgs.push({ role: 'user', content: (screen.length ? `(Buttons and labels visible on my screen, for reference only: ${screen.join(' | ')})\n\n` : '') + question });
  const key = await getKey();
  if (!key) throw new Error('no key');
  const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 25000);
  try {
    const r = await fetch(AI_URL, {
      method: 'POST', signal: ctl.signal,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify({ model: AI_MODEL, messages: msgs, max_tokens: AI_MAX_TOKENS, temperature: 0.2, stream: false }),
    });
    const j = await r.json();
    if (!r.ok) throw new Error(`provider ${r.status} ${(j.error && j.error.message || '').slice(0, 120)}`);
    return { text: j.choices[0].message.content.trim(), usage: j.usage || {} };
  } finally { clearTimeout(t); }
}

async function chat(req, res) {
  const ip = clientIp(req);
  let body;
  try { body = JSON.parse(await readBody(req)); } catch { return send(res, 400, { error: 'bad request' }); }
  if (!body || typeof body !== 'object' || Array.isArray(body) || typeof (body.question ?? '') !== 'string') return send(res, 400, { error: 'bad request' });
  const question = (body.question || '').trim().slice(0, 500);
  const page = knownPage(body.page) ? body.page : 'home';                         // server-owned list of screens
  const role = ROLES.includes(body.role) ? body.role : 'Staff';
  const history = cleanHistory(body.history);
  const screen = cleanScreen(body.screen);
  if (!question) return send(res, 400, { error: 'empty question' });
  const t0 = Date.now();

  if (MEDICAL_PATTERNS.some(r => r.test(question)) || isClinicalJudgement(question)) { addUsage('refused'); return send(res, 200, { answer: MEDICAL_REPLY, source: 'policy' }); }
  if (PII_PATTERNS.some(r => r.test(question))) { addUsage('refused'); return send(res, 200, { answer: PII_REPLY, source: 'privacy' }); }

  const st = findStatic(question, page);
  if (st) { addUsage('static'); return send(res, 200, { answer: st, source: 'help', ms: Date.now() - t0 }); }

  if (!AI_ALLOW_FREE_TEXT) return send(res, 200, { answer: 'Free-text AI is disabled for privacy. Use the Help panel or ask a standard software question without patient details.', source: 'privacy' });

  // shared answers only for a first question on the same screen, role and visible controls
  const ck = [page, role, question.toLowerCase().replace(/\s+/g, ' '), crypto.createHash('sha1').update(screen.join('|')).digest('hex')].join('|');
  if (!history.length && cache.has(ck)) { addUsage('static'); return send(res, 200, { answer: cache.get(ck), source: 'cache', ms: Date.now() - t0 }); }

  const fallback = 'Ask Vipers AI is not available right now. Open the Help (?) panel for step-by-step instructions for this screen.';
  if (!AI_ENABLED) return send(res, 200, { answer: fallback, source: 'disabled' });
  if (usedToday() + reserved + AI_EST_TOKENS > AI_DAILY_TOKENS || usedTotal() + reserved + AI_EST_TOKENS > AI_TOTAL_TOKENS)
    return send(res, 200, { answer: fallback + ' (Daily AI allowance reached.)', source: 'limit' });
  if (inflight >= AI_MAX_INFLIGHT) return send(res, 429, { answer: 'Ask Vipers AI is busy - please try again in a moment.', source: 'busy' });
  if (!hit('ai-min:' + ip, AI_IP_PER_MIN, 60e3) || !hit('ai-day:' + ip, AI_IP_PER_DAY, 86400e3))
    return send(res, 429, { answer: 'You are asking very quickly - please wait a minute and try again.', source: 'ratelimit' });

  inflight++; reserved += AI_EST_TOKENS;
  try {
    const { text, usage: u } = await askAI(question, page, role, history, screen);
    addUsage('ai', u.prompt_tokens || 0, u.completion_tokens || 0);
    if (cache.size > 300) cache.delete(cache.keys().next().value);
    if (!history.length) cache.set(ck, text);
    log(`ai page=${page} role=${role} in=${u.prompt_tokens} out=${u.completion_tokens} ms=${Date.now() - t0}`);
    return send(res, 200, { answer: text, source: 'ai', ms: Date.now() - t0, tokens: { in: u.prompt_tokens, out: u.completion_tokens } });
  } catch (e) {
    addUsage('errors'); log('ai error:', e.message);
    return send(res, 200, { answer: fallback, source: 'error' });
  } finally { inflight--; reserved -= AI_EST_TOKENS; }
}

// ---------- gate pages ----------
function gatePage(next, msg = '') {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>VIPERS HOSPITAL - Demo access</title><link rel="icon" href="/vipers-assets/favicon.svg"><link rel="stylesheet" href="/vipers-assets/gate.css"></head>
<body><main class="card"><img src="/vipers-assets/logo.svg" alt="VIPERS HOSPITAL" class="logo">
<p class="tag">DEMO ENVIRONMENT</p>
<h1>Welcome to the VIPERS HOSPITAL demo</h1>
<p class="sub">Enter the tester access code you were given to continue to the sign-in page.</p>
${msg ? `<p class="err" role="alert">${esc(msg)}</p>` : ''}
<form method="post" action="/vipers-gate/login"><input type="hidden" name="next" value="${esc(next)}">
<label for="code">Tester access code</label><input id="code" name="code" autocomplete="off" autofocus required>
<button type="submit">Continue</button></form>
<p class="note">Use fictional patient information only.</p>
<footer>Demo configured by Motion Imprints Technologies &middot; <a href="/vipers-assets/about.html">About &amp; licences</a></footer></main></body></html>`;
}
function safeNext(next, host) {
  try {
    const u = new URL(next, `https://${host}`);
    const base = parentDomain(host);
    if (u.protocol === 'https:' && (u.hostname === base || u.hostname.endsWith('.' + base))) return u.toString();
  } catch {}
  return '/';
}

async function gateLogin(req, res) {
  const ip = clientIp(req), host = req.headers['x-forwarded-host'] || req.headers.host;
  const form = new URLSearchParams(await readBody(req).catch(() => ''));
  const next = safeNext(form.get('next') || '/', host);
  // only wrong codes count towards the lockout (offices may share one public IP)
  if (recent('gate-fail:' + ip, 15 * 60e3) >= 10)
    return send(res, 429, gatePage(next, 'Too many wrong attempts. Please wait 15 minutes and try again.'), 'text/html; charset=utf-8');
  const code = (form.get('code') || '').trim().toLowerCase();
  const ok = !!GATE_CODE && safeEqual(code, GATE_CODE.toLowerCase());
  if (!ok) {
    hit('gate-fail:' + ip, 1e9, 15 * 60e3);
    log(`gate fail ip=${ip}`); return send(res, 401, gatePage(next, 'That access code is not correct.'), 'text/html; charset=utf-8');
  }
  log(`gate ok ip=${ip}`);
  const cookie = `vipers_gate=${makeToken()}; Domain=${parentDomain(host)}; Path=/; Max-Age=${GATE_DAYS * 86400}; HttpOnly; Secure; SameSite=Lax`;
  res.writeHead(303, { Location: next, 'Set-Cookie': cookie, 'Cache-Control': 'no-store' }); res.end();
}

function gateVerify(req, res) {
  if (!GATE_ENABLED || validToken(cookies(req).vipers_gate)) return send(res, 200, 'ok', 'text/plain');
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  const uri = req.headers['x-forwarded-uri'] || '/';
  const accept = req.headers.accept || '';
  if ((req.headers['x-forwarded-method'] || 'GET') === 'GET' && accept.includes('text/html')) {
    const next = `https://${host}${uri}`;
    res.writeHead(302, { Location: `https://${demoHostFor(host)}/vipers-gate/?next=${encodeURIComponent(next)}`, 'Cache-Control': 'no-store' });
    return res.end();
  }
  return send(res, 401, { error: 'demo access code required' });
}

// ---------- static ----------
const TYPES = { '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.html': 'text/html', '.png': 'image/png', '.json': 'application/json', '.ico': 'image/x-icon' };
function serveStatic(req, res, rel) {
  const p = path.normalize(path.join(PUBLIC_DIR, rel));
  if (!p.startsWith(PUBLIC_DIR)) return send(res, 404, 'not found', 'text/plain');
  fs.readFile(p, (err, data) => {
    if (err) return send(res, 404, 'not found', 'text/plain');
    res.writeHead(200, { 'Content-Type': (TYPES[path.extname(p)] || 'application/octet-stream') + '; charset=utf-8', 'Cache-Control': 'public, max-age=300' });
    res.end(data);
  });
}

process.on('unhandledRejection', e => log('unhandled rejection:', e && e.message));
http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  const p = url.pathname;
  try {
    if (p.startsWith('/vipers-trial')) {
      const ip = clientIp(req);
      if (await trial.handle(req, res, p, send, (name, max, win) => !hit('trial-' + name + ':' + ip, max, win))) return;
    }
    if (p === '/vipers-gate/verify') return gateVerify(req, res);
    if (p === '/vipers-gate/login' && req.method === 'POST') return await gateLogin(req, res);
    if (p === '/vipers-gate/' || p === '/vipers-gate') {
      const host = req.headers['x-forwarded-host'] || req.headers.host;
      const next = safeNext(url.searchParams.get('next') || '/', host);
      if (validToken(cookies(req).vipers_gate)) { res.writeHead(302, { Location: next }); return res.end(); }
      return send(res, 200, gatePage(next), 'text/html; charset=utf-8');
    }
    if (p === '/vipers-gate/reset-cache') {
      res.writeHead(204, { 'Clear-Site-Data': '"cache"', 'Cache-Control': 'no-store' });
      return res.end();
    }
    if (p === '/vipers-gate/to-billing') {
      const host = req.headers['x-forwarded-host'] || req.headers.host;
      res.writeHead(302, { Location: `https://${host.replace(/^demo\./, 'billing.')}/`, 'Cache-Control': 'no-store' });
      return res.end();
    }
    if (p === '/vipers-ai/api/chat' && req.method === 'POST') return await chat(req, res);
    if (p === '/vipers-ai/api/status') return send(res, 200, { ai: AI_ENABLED, freeText: AI_ALLOW_FREE_TEXT, model: AI_MODEL, today: usedToday(), dailyLimit: AI_DAILY_TOKENS, total: usedTotal(), totalLimit: AI_TOTAL_TOKENS });
    // site.json exists only on hospital/production servers; elsewhere answer "{}" (no special mode) instead of a 404,
    // which browsers log as an error and which, over HTTP/3, test browsers never reported as finished
    if (p === '/vipers-assets/site.json' && !fs.existsSync(path.join(PUBLIC_DIR, 'site.json'))) return send(res, 200, {});
    if (p.startsWith('/vipers-assets/')) return serveStatic(req, res, p.slice('/vipers-assets/'.length));
    if (p === '/healthz') return send(res, 200, 'ok', 'text/plain');
    send(res, 404, { error: 'not found' });
  } catch (e) { log('error', e.message); if (!res.headersSent) send(res, 500, { error: 'internal error' }); else res.end(); }
}).listen(PORT, () => log(`vipers-addons listening on ${PORT}; gate=${GATE_ENABLED} ai=${AI_ENABLED} model=${AI_MODEL}`));
