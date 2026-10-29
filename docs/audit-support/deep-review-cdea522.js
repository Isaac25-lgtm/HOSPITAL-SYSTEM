// Defect reproducer, not a release gate. No network, timers or DOM mutations outside the fake context.
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm'), assert = require('assert/strict');
const source = fs.readFileSync(path.resolve(__dirname, '../../edge/addons/public/vipers.js'), 'utf8');
const attrs = {}, timers = new Map();
let timerId = 0, requests = 0;
const element = { children: [], textContent: 'No diagnosis for this patient', isConnected: true,
  getAttribute: k => attrs[k], setAttribute(k,v) { attrs[k]=v; }, hasAttribute: k => k in attrs,
  removeAttribute(k) { delete attrs[k]; }, appendChild() {} };
const id = '11111111-1111-1111-1111-111111111111';
const c = { URL, Promise, Date, AbortController,
  location: { pathname: '/bahmni/adt/', hash: '#/patient/'+id, origin: 'https://fixture.test' },
  document: { querySelectorAll: () => [element] }, el() {},
  setTimeout(fn) { timers.set(++timerId, fn); return timerId; }, clearTimeout(i) { timers.delete(i); },
  fetch: async () => { requests++; return { ok: true, json: () => new Promise(() => {}) }; } };
vm.createContext(c);
vm.runInContext(source.slice(source.indexOf('  function adtDiagnoses()'), source.indexOf('  // In-Patient action buttons')), c);
(async () => {
  c.adtDiagnoses();
  await new Promise(r => setImmediate(r));
  assert.equal(timers.size, 0); // headers arrived, but the body has not arrived: the abort timer was cancelled
  assert.equal(attrs['data-vp-dx-loading'], '1');
  c.adtDiagnoses();
  assert.equal(requests, 1); // all later retry attempts are suppressed by the permanent loading flag
  console.log('REPRODUCED: diagnosis headers cancel timeout before stalled JSON body; no retry remains');
})().catch(e => { console.error(e); process.exitCode=1; });
