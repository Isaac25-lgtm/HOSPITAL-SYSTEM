'use strict';
const fs = require('fs'), vm = require('vm'), path = require('path'), assert = require('assert/strict');
const source = fs.readFileSync(path.join(__dirname, '../edge/addons/public/vipers.js'), 'utf8');
const c = { BRAND: 'VIPERS HOSPITAL', NodeFilter: { SHOW_TEXT: 4, FILTER_REJECT: 2, FILTER_ACCEPT: 1 }, document: { title: 'Bahmni' } };
let node;
c.document.createTreeWalker = (_, type, filter) => { let done = false; return { nextNode() { if (done) return null; done = true; return filter.acceptNode(node) === 1 ? node : null; } }; };
vm.createContext(c);
vm.runInContext(source.slice(source.indexOf('  var BRAND_RE'), source.indexOf('  function brandImages')), c);
for (const text of ['Mary Crater', 'Clinical note: Report successfully uploaded despite failed submission', 'InPatient', 'Implementer Interface']) {
  node = { nodeValue: text, parentNode: { nodeName: 'TD', closest: sel => sel.includes('td,') ? {} : null } };
  c.brandNode({}); assert.equal(node.nodeValue, text);
}
node = { nodeValue: 'Bahmni Help', parentNode: { nodeName: 'BUTTON', closest: sel => sel.includes('header,') ? {} : null } };
c.brandNode({}); assert.equal(node.nodeValue, 'VIPERS HOSPITAL Help');
console.log('PASS | clinical phrases and names unchanged; interface branding still works');

const attrs = {}, element = { children: [], isConnected: true, textContent: 'No diagnosis for this patient', getAttribute: k => attrs[k], setAttribute(k, v) { attrs[k] = v; }, removeAttribute(k) { delete attrs[k]; }, hasAttribute: k => k in attrs, appendChild(e) { this.children.push(e); } };
const id = '11111111-1111-1111-1111-111111111111';
c.location = { pathname: '/bahmni/adt/', hash: '#/patient/' + id, origin: 'https://hospital.test' };
c.URL = URL; c.Promise = Promise; c.Date = Date;
c.document.querySelectorAll = () => [element];
c.el = (tag, props, children) => ({ tag, ...props, children });
let requests = 0, fail = true;
c.fetch = async url => {
  requests++;
  if (fail) return { ok: false };
  return { ok: true, json: async () => url.includes('page=2') ? { resourceType: 'Bundle', entry: [{ resource: { resourceType: 'Condition', code: { text: 'Older valid diagnosis' } } }] } :
    { resourceType: 'Bundle', entry: Array.from({ length: 10 }, () => ({ resource: { resourceType: 'Condition', verificationStatus: { coding: [{ code: 'refuted' }] } } })), link: [{ relation: 'next', url: '/openmrs/ws/fhir2/R4/Condition?page=2' }] } };
};
vm.runInContext(source.slice(source.indexOf('  function adtDiagnoses()'), source.indexOf('  // In-Patient action buttons')), c);
const tick = () => new Promise(r => setImmediate(r));
(async () => {
  c.adtDiagnoses(); await tick(); await tick();
  assert.equal(attrs['data-vp-dx'], undefined); assert.match(element.textContent, /unavailable/);
  fail = false; attrs['data-vp-dx-retry'] = '0'; c.adtDiagnoses(); await tick(); await tick();
  assert.equal(attrs['data-vp-dx'], id); assert.equal(requests, 3);
  assert.equal(element.children[1].children[0].text, 'Older valid diagnosis');
  console.log('PASS | failed diagnosis load retries and includes valid diagnoses on later pages');
})().catch(e => { console.error(e); process.exitCode = 1; });
