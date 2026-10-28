// Static help knowledge base: shared by the Help panel (browser) and Ask Vipers AI (server).
// Content lives in public/help.json so it can be edited without code changes.
'use strict';
const fs = require('fs');
const path = require('path');

const FILE = path.join(__dirname, 'public', 'help.json');
let KB = { pages: {}, faq: [] };
let loadedAt = 0;
function kb() {
  const m = fs.statSync(FILE).mtimeMs;
  if (m !== loadedAt) { KB = JSON.parse(fs.readFileSync(FILE, 'utf8')); loadedAt = m; }
  return KB;
}

const STOP = new Set('a an the i we you to of in on for and or is are do does how can where what which my this that it with from be at as by please into new'.split(' '));
const words = s => String(s).toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(w => w && !STOP.has(w))
  .map(w => w.replace(/(ing|es|s)$/, ''));

function score(qWords, entryText) {
  const e = new Set(words(entryText));
  let hits = 0; for (const w of qWords) if (e.has(w)) hits++;
  return qWords.length ? hits / qWords.length : 0;
}

const fmt = e => `${e.a}${e.steps ? '\n' + e.steps.map((s, i) => `${i + 1}. ${s}`).join('\n') : ''}`;

// Return a static answer when an FAQ clearly matches; otherwise null (caller may use AI).
function findStatic(question, page) {
  const q = words(question);
  if (!q.length) return null;
  let best = null, bestScore = 0;
  for (const e of kb().faq) {
    let s = score(q, e.q + ' ' + (e.k || ''));
    if (e.pages && e.pages.includes(page)) s += 0.15;
    if (s > bestScore) { bestScore = s; best = e; }
  }
  return bestScore >= 0.6 ? fmt(best) : null;
}

// Small, relevant context for the AI: current page help + top 3 FAQs.
function relevantSteps(question, page) {
  const k = kb(), q = words(question), out = [];
  const p = k.pages[page];
  if (p) out.push(`[${p.title}] ${p.tip}\n` + p.steps.map((s, i) => `${i + 1}. ${s}`).join('\n'));
  k.faq.map(e => ({ e, s: score(q, e.q + ' ' + (e.k || '')) })).sort((a, b) => b.s - a.s).slice(0, 4)
    .filter(x => x.s > 0).forEach(x => out.push(`Q: ${x.e.q}\nA: ${fmt(x.e)}`));
  return out.join('\n\n').slice(0, 3500);
}

const PAGE_TITLES = new Proxy({}, { get: (_, p) => (kb().pages[p] || {}).title || p });
const knownPage = p => typeof p === 'string' && Object.prototype.hasOwnProperty.call(kb().pages, p);

module.exports = { findStatic, relevantSteps, PAGE_TITLES, knownPage };
