/* VIPERS HOSPITAL in-page layer: branding, contextual help, first-time walkthrough, Ask Vipers AI.
 * Loaded on every HTML page by the edge proxy. Never touches clinical data; the AI only receives
 * a page id, a role name and the user's question. */
(function () {
  'use strict';
  if (window.__vipers || window.top !== window) return;
  window.__vipers = true;

  // Bahmni bug: the In-Patient bed pop-up requests beds/{id}?v=custom:(...identifiers:(uuid,identifier),) and the
  // stray comma makes OpenMRS answer 400 "Unknown property ''" (red error on every occupied bed). Repair that URL.
  (function () {
    var open = XMLHttpRequest.prototype.open;
    XMLHttpRequest.prototype.open = function (method, url) {
      if (typeof url === 'string' && /\/beds\/\d+\?v=/.test(url)) arguments[1] = url.replace(/identifier(\)|%29)(,|%2C)(\)|%29)/i, 'identifier$1$3');
      return open.apply(this, arguments);
    };
  })();

  var BRAND = 'VIPERS HOSPITAL';
  // keep this file ASCII-only (Windows tools have re-encoded literal symbols before)
  var TIMES = String.fromCharCode(215), ELLIPSIS = String.fromCharCode(8230);
  var BILLING = /^billing\./.test(location.hostname);
  var store = {
    get: function (k) { try { return localStorage.getItem('vipers.' + k); } catch (e) { return null; } },
    set: function (k, v) { try { localStorage.setItem('vipers.' + k, v); } catch (e) {} }
  };
  var help = { pages: {}, faq: [] };
  var role = BILLING ? 'Cashier' : 'Staff';

  // ---------------- page detection ----------------
  function pageId() {
    var p = location.pathname, h = location.hash || '';
    if (BILLING) {
      if (billingLoginPage()) return 'billing-login';
      if (/invoices|payments|estimates/.test(p)) return 'billing-invoices';
      if (/customers/.test(p)) return 'billing-customers';
      return 'billing';
    }
    if (/\/bahmni\/home/.test(p)) return /login/.test(h) ? 'login' : 'home';
    if (/^\/bahmni-v2\/home/.test(p)) return 'home';
    if (/^\/bahmni-v2\/registration\/patient\/new/.test(p)) return 'registration';
    if (/^\/bahmni-v2\/registration\/patient\//.test(p)) return 'registration-edit';
    if (/^\/bahmni-v2\/registration/.test(p)) return 'patient-search';
    if (/^\/bahmni-v2\/patient-documents/.test(p)) return 'documents';
    if (/^\/bahmni-v2\/clinical/.test(p)) {
      // the consultation pad and its forms open on the same URL as the dashboard
      var vis = function (sel) { var e = document.querySelector(sel); return e && e.offsetParent !== null; };
      var txt = document.body ? document.body.innerText : '';
      if (/Pulse \(beats\/min\)/.test(txt) && /Save Form/.test(txt)) return 'vitals';
      if (vis('#diagnoses-search') || vis('#medication-search')) return 'consultation';
      return 'patient-dashboard';
    }
    if (/\/bahmni\/registration/.test(p)) return /patient\/[^/]+/.test(h) && !/new/.test(h) ? 'registration-edit' : (/new/.test(h) ? 'registration' : 'patient-search');
    if (/\/bahmni\/clinical/.test(p)) {
      if (/\/search/.test(h) || h === '' || /patient\/search/.test(h)) return 'clinical-search';
      if (/concept-set-group\/observations/.test(h)) return 'vitals';
      if (/diagnosis/.test(h)) return 'diagnosis';
      if (/treatment|medication|drug/.test(h)) return 'prescriptions';
      if (/orders/.test(h)) return 'lab-orders';
      if (/consultation|disposition|summary/.test(h) && !/dashboard/.test(h)) return 'consultation';
      return 'patient-dashboard';
    }
    if (/^\/bahmni-v2/.test(p)) return 'patient-dashboard';
    if (/^\/lab/.test(p)) return /\/lab\/patient\//.test(p) ? 'lab-results' : 'lab-queue';
    if (/^\/appointments/.test(p)) return /\/admin/.test(h) ? 'admin' : 'appointments';
    if (/\/bahmni\/document-upload|\/bahmni\/patient-documents/.test(p)) return 'documents';
    if (/\/bahmni\/adt/.test(p)) return 'adt';
    if (/\/bahmni\/orders/.test(p)) return 'orders';
    if (/\/bahmni\/admin|\/openmrs\/admin|\/implementer-interface/.test(p)) return 'admin';
    if (/\/bahmnireports|\/bahmni\/reports/.test(p)) return 'reports';
    return 'home';
  }

  // ---------------- branding ----------------
  // visible text only (never identifiers); case-insensitive so "BAHMNI EMR LOGIN" is covered too
  var BRAND_RE = /\bbahmni(\s+(emr|lite|clinic))?\b/gi;
  // stock wording that misleads demo users (exact phrases, found in QA on 28 Oct 2026)
  var TEXT_FIXES = [
    [/Simple Invoicing for\s+Individuals\s+Small\s+Businesses/, 'Hospital billing for ' + BRAND],
    [/Report successfully uploaded/, 'Saved successfully'],
    [/This week, no appointments are available for any of the Providers/, 'No appointments are assigned to a specific provider this week.'],
    [/^\s*Implementer Interface\s*$/, 'Form Builder'],
    [/^\s*InPatient\s*$/, 'In-Patient']
  ];
  var FIX_TEST = /bahmni|Crater|Simple Invoicing|successfully uploaded|any of the Providers|Implementer Interface|^\s*InPatient\s*$/i;
  function brandTitle() {
    var t = document.title || '';
    var nt = t.replace(BRAND_RE, BRAND).replace(/\bCrater\b/g, BRAND + ' Billing').replace(/^OpenMRS\b/, BRAND);
    if (!nt.trim()) nt = BRAND;
    if (nt !== t) document.title = nt;
  }
  function brandNode(root) {
    var w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode: function (n) {
        if (!n.nodeValue || !FIX_TEST.test(n.nodeValue)) return NodeFilter.FILTER_REJECT;
        var p = n.parentNode && n.parentNode.nodeName;
        return /^(SCRIPT|STYLE|TEXTAREA|INPUT|CODE|PRE)$/.test(p) || (n.parentNode.closest && n.parentNode.closest('#vipers-root,[contenteditable]'))
          ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT;
      }
    });
    var n, nodes = [];
    while ((n = w.nextNode())) nodes.push(n);
    nodes.forEach(function (t) {
      var v = t.nodeValue.replace(BRAND_RE, BRAND).replace(/\bCrater\b/g, BRAND + ' Billing');
      TEXT_FIXES.forEach(function (f) { v = v.replace(f[0], f[1]); });
      if (v !== t.nodeValue) t.nodeValue = v;
    });
  }
  function brandImages(root) {
    var imgs = (root.querySelectorAll ? root : document).querySelectorAll('img');
    for (var i = 0; i < imgs.length; i++) {
      var s = imgs[i].getAttribute('src') || '', alt = imgs[i].getAttribute('alt') || '';
      // match by file name or by alt text (e.g. Lab Entry's fingerprinted "Bahmni Logo" image)
      if ((/logo/i.test(s) || /crater-white/i.test(s) || /bahmni.*logo|logo.*bahmni/i.test(alt)) && !/vipers-assets/.test(s) && !/patient|document/i.test(s)) {
        imgs[i].setAttribute('src', /white/i.test(s) ? '/vipers-assets/logo-white.svg' : '/vipers-assets/logo.svg');
        imgs[i].setAttribute('alt', BRAND);
        imgs[i].classList.add('vipers-logo-img');
      }
    }
    // Crater's login page draws its wordmark as an inline SVG
    if (BILLING) {
      var svgs = document.querySelectorAll('svg.w-48.mb-32');
      for (var j = 0; j < svgs.length; j++) {
        var logo = el('img', { src: '/vipers-assets/logo.svg', alt: BRAND, class: 'vipers-logo-img vp-billing-login-logo' });
        svgs[j].parentNode.replaceChild(logo, svgs[j]);
      }
    }
  }
  function brandFavicon() {
    var links = document.querySelectorAll('link[rel*="icon"]');
    var ok = false;
    for (var i = 0; i < links.length; i++) {
      if (/vipers-assets/.test(links[i].href)) ok = true; else links[i].parentNode.removeChild(links[i]);
    }
    if (!ok) { var l = document.createElement('link'); l.rel = 'icon'; l.type = 'image/svg+xml'; l.href = '/vipers-assets/favicon.svg'; document.head.appendChild(l); }
  }
  // Small wordmark in the Carbon (React) app header; upstream help links -> VIPERS help
  function brandHeader() {
    var hdr = document.querySelector('header.cds--header, .cds--header, header.bx--header, .bx--header');
    if (hdr && !hdr.querySelector('#vp-brand')) {
      var a = el('a', { id: 'vp-brand', href: '/bahmni-v2/home/', title: BRAND, 'aria-label': BRAND + ' home' });
      a.appendChild(el('img', { src: '/vipers-assets/logo-white.svg', alt: BRAND }));
      hdr.insertBefore(a, hdr.firstChild);
    }
    // in app headers, show the DEMO label up here and drop the bottom-left badge (it can cover page content)
    if (hdr && !hdr.querySelector('#vp-hdr-badge')) {
      var tag = el('a', { id: 'vp-hdr-badge', href: '/vipers-assets/about.html', target: '_blank', rel: 'noopener', title: 'Demo environment - use fictional patient information only. About & licences' }, ['DEMO ENVIRONMENT']);
      var brand = hdr.querySelector('#vp-brand');
      if (brand && brand.nextSibling) hdr.insertBefore(tag, brand.nextSibling); else hdr.appendChild(tag);
    }
    if (root) root.classList.toggle('vp-has-header', !!hdr);
    var links = document.querySelectorAll('a[href*="bahmni.atlassian.net"]');
    for (var i = 0; i < links.length; i++) { links[i].href = '/vipers-assets/help.html'; links[i].target = '_blank'; }
  }
  function brandAll() {
    try { brandTitle(); if (document.body) { brandNode(document.body); brandImages(document); brandHeader(); if (root) ensureSpacer(); } brandFavicon(); }
    catch (e) { /* never let the overlay break the host application */ }
  }

  // ---------------- DOM helpers ----------------
  function el(tag, attrs, kids) {
    var e = document.createElement(tag);
    for (var k in attrs || {}) {
      if (k === 'text') e.textContent = attrs[k];
      else if (k.slice(0, 2) === 'on') e.addEventListener(k.slice(2), attrs[k]);
      else e.setAttribute(k, attrs[k]);
    }
    (kids || []).forEach(function (c) { if (c) e.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); });
    return e;
  }
  var SPARK = '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path fill="currentColor" d="M12 2l1.9 5.6L19.5 9.5l-5.6 1.9L12 17l-1.9-5.6L4.5 9.5l5.6-1.9zM19 14l.9 2.6 2.6.9-2.6.9L19 21l-.9-2.6-2.6-.9 2.6-.9z"/></svg>';

  var root, helpPanel, aiPanel, tipEl;
  function build() {
    root = el('div', { id: 'vipers-root' });

    var badge = el('div', { class: 'vp-badge', title: 'Use fictional patient information only.' }, [
      el('span', { class: 'vp-badge-tag', text: 'DEMO ENVIRONMENT' }),
      el('span', { class: 'vp-badge-note', text: 'Use fictional patient information only' }),
      el('a', { href: '/vipers-assets/about.html', target: '_blank', rel: 'noopener', class: 'vp-badge-about', text: 'About' })
    ]);

    var helpBtn = el('button', { class: 'vp-fab vp-help-btn', type: 'button', 'aria-label': 'Help for this screen', title: 'Help for this screen', onclick: toggleHelp, text: '?' });
    var aiBtn = el('button', { class: 'vp-fab vp-ai-btn', type: 'button', 'aria-label': 'Ask Vipers AI', title: 'Ask Vipers AI', onclick: toggleAI });
    aiBtn.innerHTML = SPARK + '<span>Ask Vipers AI</span>';

    helpPanel = el('section', { class: 'vp-panel vp-help', role: 'dialog', 'aria-label': 'Help', hidden: '' });
    aiPanel = buildAI();

    root.appendChild(badge);
    var themeBtn = el('button', { class: 'vp-fab vp-theme-btn', type: 'button', onclick: toggleTheme });
    root.appendChild(el('div', { class: 'vp-fabs' }, [themeBtn, helpBtn, aiBtn]));
    paintThemeBtn(themeBtn);
    root.appendChild(helpPanel);
    root.appendChild(aiPanel);
    document.body.appendChild(root);
  }
  // If the page has a fixed/sticky action bar along the bottom (e.g. the consultation pad's
  // Cancel | Done bar), lift the VIPERS buttons, badge and panels above it so they never cover it.
  function liftAboveBottomBars() {
    var lift = 0, w = window.innerWidth, h = window.innerHeight;
    [[w - 40, h - 8], [w - 160, h - 8], [200, h - 8]].forEach(function (pt) {
      var stack = document.elementsFromPoint ? document.elementsFromPoint(pt[0], pt[1]) : [];
      for (var i = 0; i < stack.length; i++) {
        var n = stack[i];
        if (n === document.documentElement || n === document.body || (root && root.contains(n)) || n.id === 'vipers-spacer') continue;
        // a short element flush with the window bottom that is (or holds) a button = an action bar
        for (var a = n; a && a !== document.body; a = a.parentElement) {
          var r = a.getBoundingClientRect();
          if (r.height >= 140) break;
          if (r.height > 0 && Math.abs(r.bottom - h) <= 3 && (a.matches('button,a,[role=button]') || a.querySelector('button,a,[role=button]'))) {
            lift = Math.max(lift, Math.round(h - r.top));
            break;
          }
        }
        break;
      }
    });
    // whatever panel scrolls underneath the floating buttons gets bottom room, so its last row can scroll clear
    var under = document.elementsFromPoint ? document.elementsFromPoint(w - 60, h - 30) : [];
    for (var u = 0; u < under.length; u++) {
      if (root.contains(under[u])) continue;
      for (var s = under[u]; s && s !== document.body && s !== document.documentElement; s = s.parentElement) {
        var st = getComputedStyle(s);
        if (/auto|scroll/.test(st.overflowY) && s.scrollHeight > s.clientHeight + 4) { s.classList.add('vp-scroll-pad'); break; }
      }
      break;
    }
    root.style.setProperty('--vp-lift', lift + 'px');
    root.classList.toggle('vp-compact', lift > 0); // inside forms with an action bar: icon-only AI button
  }
  function ensureSpacer() {
    var s = document.getElementById('vipers-spacer');
    if (!s) { s = el('div', { id: 'vipers-spacer', 'aria-hidden': 'true' }); }
    // last flow element of <body>, just before the (fixed-position) VIPERS layer
    if (root.parentNode !== document.body) document.body.appendChild(root); // app re-rendered <body>
    if (s.parentNode !== document.body) document.body.insertBefore(s, root);
  }

  // ---------------- help ----------------
  function currentHelp() {
    var id = pageId();
    return { id: id, h: help.pages[id] || help.pages[id.split('-')[0]] || help.pages.home || { title: 'Help', tip: '', steps: [] } };
  }
  function renderHelp() {
    var c = currentHelp().h;
    helpPanel.innerHTML = '';
    helpPanel.appendChild(el('header', {}, [
      el('h2', { text: c.title }),
      el('button', { class: 'vp-x', type: 'button', 'aria-label': 'Close help', onclick: toggleHelp, text: TIMES })
    ]));
    if (c.tip) helpPanel.appendChild(el('p', { class: 'vp-tip', text: c.tip }));
    if (c.steps && c.steps.length) {
      var ol = el('ol');
      c.steps.forEach(function (s) { ol.appendChild(el('li', { text: s })); });
      helpPanel.appendChild(ol);
    }
    helpPanel.appendChild(el('p', { class: 'vp-more' }, [
      'Still stuck? ',
      el('a', { href: '#', onclick: function (e) { e.preventDefault(); toggleHelp(); toggleAI(true); }, text: 'Ask Vipers AI' }),
      ' ' + String.fromCharCode(183) + ' ',
      el('a', { href: '#', onclick: function (e) { e.preventDefault(); toggleHelp(); startTour(true); }, text: 'Replay tour' })
    ]));
  }
  function toggleHelp() {
    var open = helpPanel.hasAttribute('hidden');
    closePanels();
    if (open) { renderHelp(); helpPanel.removeAttribute('hidden'); }
  }
  function closePanels() { helpPanel.setAttribute('hidden', ''); aiPanel.setAttribute('hidden', ''); }

  function showTip() {
    if (store.get('tips.off') || window.innerWidth < 640) return; // on phones the ? button gives the same help
    var c = currentHelp();
    if (!c.h.tip || store.get('tip.' + c.id) || c.id === 'login' || root.querySelector('.vp-overlay')) return;
    if (tipEl) tipEl.remove();
    tipEl = el('div', { class: 'vp-toast', role: 'status' }, [
      el('strong', { text: 'Quick tip' }),
      el('span', { text: c.h.tip }),
      el('div', { class: 'vp-toast-actions' }, [
        el('button', { type: 'button', text: 'Got it', onclick: function () { store.set('tip.' + c.id, '1'); tipEl.remove(); } }),
        el('button', { type: 'button', class: 'vp-link', text: 'Turn off tips', onclick: function () { store.set('tips.off', '1'); tipEl.remove(); } })
      ])
    ]);
    root.appendChild(tipEl);
    setTimeout(function () { if (tipEl && tipEl.parentNode) { store.set('tip.' + c.id, '1'); tipEl.remove(); } }, 15000);
  }

  // ---------------- walkthrough ----------------
  var TOUR = [
    { t: 'Welcome to VIPERS HOSPITAL', b: 'The home screen shows the modules your role can use, such as Registration, Clinical, Lab, Appointments and Billing. Click a tile to open it. You can always come back with the home icon at the top of each screen.' },
    { t: 'Find a patient, then work on their record', b: 'Most work starts by searching for a patient by name or ID. Open the patient to see their dashboard, start a visit, and record consultations, vitals, diagnoses, prescriptions and lab orders.' },
    { t: 'Help is always here', b: 'Use the ? button for short step-by-step help on the current screen, or Ask Vipers AI to ask how to do something in the system. This is a demo, so please use fictional patient information only.' }
  ];
  function startTour(force) {
    if (!force && (store.get('tour.done') || BILLING)) return;
    var i = 0;
    var ov = el('div', { class: 'vp-overlay', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Welcome tour' });
    var card = el('div', { class: 'vp-tour' });
    ov.appendChild(card);
    function done(remember) { if (remember) store.set('tour.done', '1'); ov.remove(); }
    function render() {
      card.innerHTML = '';
      card.appendChild(el('p', { class: 'vp-step', text: 'Step ' + (i + 1) + ' of ' + TOUR.length }));
      card.appendChild(el('h2', { text: TOUR[i].t }));
      card.appendChild(el('p', { text: TOUR[i].b }));
      var actions = el('div', { class: 'vp-tour-actions' }, [
        el('label', { class: 'vp-check' }, [el('input', { type: 'checkbox', id: 'vp-noshow', checked: '' }), " Don't show again"]),
        el('span', { class: 'vp-grow' }),
        el('button', { type: 'button', class: 'vp-link', text: 'Skip', onclick: function () { done(document.getElementById('vp-noshow').checked); } }),
        i > 0 ? el('button', { type: 'button', class: 'vp-secondary', text: 'Back', onclick: function () { i--; render(); } }) : null,
        el('button', { type: 'button', class: 'vp-primary', text: i < TOUR.length - 1 ? 'Next' : 'Finish', onclick: function () {
          if (i < TOUR.length - 1) { i++; render(); } else done(document.getElementById('vp-noshow').checked);
        } })
      ]);
      card.appendChild(actions);
    }
    render();
    root.appendChild(ov);
  }

  // ---------------- Ask Vipers AI ----------------
  var chatHistory = [], aiLog, aiInput, aiSuggest, busy = false;
  function buildAI() {
    var p = el('section', { class: 'vp-panel vp-ai', role: 'dialog', 'aria-label': 'Ask Vipers AI', hidden: '' });
    var head = el('header', {}, [el('h2', {}), el('button', { class: 'vp-x', type: 'button', 'aria-label': 'Close Ask Vipers AI', onclick: toggleAI, text: TIMES })]);
    head.firstChild.innerHTML = SPARK + ' Ask Vipers AI';
    aiLog = el('div', { class: 'vp-log', 'aria-live': 'polite' });
    aiSuggest = el('div', { class: 'vp-suggest' });
    aiInput = el('input', { type: 'text', maxlength: '400', placeholder: 'How do I...?', 'aria-label': 'Your question' });
    var form = el('form', { class: 'vp-ask', onsubmit: function (e) { e.preventDefault(); ask(aiInput.value); } }, [aiInput, el('button', { type: 'submit', class: 'vp-primary', text: 'Ask' })]);
    p.appendChild(head);
    p.appendChild(aiLog);
    p.appendChild(aiSuggest);
    p.appendChild(form);
    p.appendChild(el('p', { class: 'vp-fine', text: 'Helps with using the software only - no medical advice. Do not enter patient details.' }));
    return p;
  }
  function addMsg(who, text, src) {
    var m = el('div', { class: 'vp-msg vp-' + who });
    text.split('\n').forEach(function (line, idx) { if (idx) m.appendChild(el('br')); m.appendChild(document.createTextNode(line.replace(/\*\*/g, ''))); });
    if (src && src !== 'ai') m.appendChild(el('span', { class: 'vp-src', text: src === 'help' || src === 'cache' ? 'from Help' : '' }));
    aiLog.appendChild(m);
    aiLog.scrollTop = aiLog.scrollHeight;
  }
  function renderSuggestions() {
    var c = currentHelp().h;
    var ex = (c.examples && c.examples.length ? c.examples : (help.pages.home && help.pages.home.examples) || []).slice(0, 3);
    aiSuggest.innerHTML = '';
    // standing question: explains whatever screen is open, from the verified help (instant, no AI call)
    aiSuggest.appendChild(el('button', { type: 'button', class: 'vp-chip vp-chip-explain', text: 'Explain this screen', onclick: explainScreen }));
    ex.forEach(function (q) { aiSuggest.appendChild(el('button', { type: 'button', class: 'vp-chip', text: q, onclick: function () { ask(q); } })); });
  }
  function explainScreen() {
    var c = currentHelp().h;
    addMsg('me', 'Explain this screen');
    var lines = [(c.title || 'This screen') + ': ' + (c.tip || '')];
    (c.steps || []).forEach(function (s, i) { lines.push((i + 1) + '. ' + s); });
    lines.push('Ask me anything else about this screen or what to do next.');
    addMsg('bot', lines.join('\n'), 'help');
    chatHistory.push({ role: 'user', content: 'Explain this screen' }, { role: 'assistant', content: lines.join('\n') });
  }
  function toggleAI(forceOpen) {
    var open = forceOpen === true || aiPanel.hasAttribute('hidden');
    closePanels();
    if (!open) return;
    if (!aiLog.childNodes.length) addMsg('bot', 'Need help using VIPERS HOSPITAL? Ask me how to complete a task.');
    renderSuggestions();
    aiPanel.removeAttribute('hidden');
    aiInput.focus();
  }
  // Visible control labels (buttons, tabs, menus, field labels) so the AI knows what this screen offers.
  // Never patient data: skip patient panels/lists and anything with digits; the server filters again.
  function screenLabels() {
    var seen = {}, out = [];
    var els = document.querySelectorAll('button, [role=tab], .tab-item a, label, th, legend, .section-title, .cds--side-nav__link-text, [class*="AppTile_label"], .cds--breadcrumb-item a, select option:checked');
    for (var i = 0; i < els.length && out.length < 60; i++) {
      var e = els[i];
      if (e.closest('#vipers-root') || !e.offsetParent) continue;
      if (e.closest('[class*="patient" i], [class*="Patient"], .active-patient, [data-testid*="patient" i]')) continue;
      var t = (e.innerText || e.textContent || '').replace(/\s+/g, ' ').trim();
      if (!t || t.length > 40 || /\d|@/.test(t) || seen[t]) continue;
      seen[t] = 1; out.push(t);
    }
    return out;
  }
  function ask(q) {
    q = (q || '').trim();
    if (!q || busy) return;
    busy = true; aiInput.value = '';
    addMsg('me', q);
    var wait = el('div', { class: 'vp-msg vp-bot vp-wait', text: 'Thinking' + ELLIPSIS });
    aiLog.appendChild(wait);
    fetch('/vipers-ai/api/chat', {
      method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question: q, page: pageId(), role: role, history: chatHistory.slice(-4), title: document.title, screen: screenLabels() })
    }).then(function (r) { return r.json(); }).then(function (j) {
      wait.remove();
      addMsg('bot', j.answer || 'Sorry, something went wrong. Please use the Help (?) panel.', j.source);
      chatHistory.push({ role: 'user', content: q }, { role: 'assistant', content: j.answer || '' });
    }).catch(function () {
      wait.remove();
      addMsg('bot', 'Ask Vipers AI is not reachable right now. The Help (?) panel still has step-by-step instructions.');
    }).then(function () { busy = false; });
  }

  // ---------------- role ----------------
  var ROLE_BY_USER = { 'demo.reception': 'Receptionist', 'demo.doctor': 'Doctor', 'demo.lab': 'Laboratory technician', 'demo.cashier': 'Cashier', 'demo.admin': 'Demo administrator', 'demo.nurse': 'Ward nurse' };
  function loadRole() {
    if (BILLING) return;
    fetch('/openmrs/ws/rest/v1/session?v=custom:(authenticated,user:(username))', { credentials: 'same-origin', headers: { Accept: 'application/json' } })
      .then(function (r) { return r.json(); })
      .then(function (s) { if (s && s.user && s.user.username) role = ROLE_BY_USER[s.user.username] || 'Staff'; })
      .catch(function () {});
  }

  // ---------------- warm the browser cache ----------------
  // After the home page has loaded and the browser is idle, pre-download (lowest priority) the code of the
  // modules this user can open, so the first visit to each module is also fast. Code files are cached for a
  // year (fingerprinted names); patient data is never prefetched. Skipped on 2G / data-saver connections.
  function warmModules() {
    var c = navigator.connection || {};
    if (c.saveData || /(^|-)2g$/.test(c.effectiveType || '') || store.get('warmed') === today()) return;
    var map = [[/clinical/, '/bahmni/clinical/index.html'], [/appointments/, '/appointments/index.html'], [/^\/lab|\/lab$/, '/lab/'],
      [/implementer-interface/, '/implementer-interface/index.html'], [/\/admin/, '/bahmni/admin/index.html'], [/reports/, '/bahmni/reports/index.html'],
      [/document-upload/, '/bahmni/document-upload/index.html']];
    var pages = [];
    var tiles = document.querySelectorAll('a[href]');
    for (var i = 0; i < tiles.length; i++) {
      var href = tiles[i].getAttribute('href') || '';
      for (var j = 0; j < map.length; j++) if (map[j][0].test(href) && pages.indexOf(map[j][1]) < 0) pages.push(map[j][1]);
    }
    var seen = {};
    var next = function () {
      var p = pages.shift();
      if (!p) { store.set('warmed', today()); return; }
      fetch(p, { credentials: 'same-origin' }).then(function (r) { return r.text(); }).then(function (html) {
        var base = p.replace(/[^\/]*$/, ''), re = /(?:src|href)="([^"]+\.(?:js|css))(?:\?[^"]*)?"/g, m;
        while ((m = re.exec(html))) {
          var u = new URL(m[1], location.origin + base).pathname;
          if (seen[u]) continue; seen[u] = 1;
          // "as" makes the browser request it as a script/style (without it, it is fetched like a page)
          var l = document.createElement('link'); l.rel = 'prefetch'; l.as = /\.css$/.test(u) ? 'style' : 'script'; l.href = u; document.head.appendChild(l);
        }
      }).catch(function () {}).then(function () { setTimeout(next, 1500); });
    };
    next();
  }
  function today() { return new Date().toISOString().slice(0, 10); }

  // ---------------- one-click demo sign-in ----------------
  // Open demo (fictional data only): the login pages show a card per role instead of a password form.
  // A card fills and submits the stock form, so Bahmni/Crater create their sessions exactly as usual.
  var ACCOUNTS = [
    { u: 'demo.reception', p: 'liverpool', t: 'Reception', d: 'Register patients, start visits, book appointments, upload documents' },
    { u: 'demo.doctor', p: 'arsenal', t: 'Doctor', d: 'Consultations, vital signs, diagnoses, prescriptions, lab orders' },
    { u: 'demo.nurse', p: 'brighton', t: 'Ward Nurse', d: 'Admissions, bed allocation, ward transfers and discharges' },
    { u: 'demo.lab', p: 'chelsea', t: 'Laboratory', d: 'Lab work queue, enter and save test results' },
    { u: 'demo.cashier', p: 'everton', t: 'Cashier', d: 'Patient lookup and the Billing system' },
    { u: 'demo.admin', p: 'fulham', t: 'Administrator', d: 'Reports, audit log, form builder, appointment services' }
  ];
  var BILLING_ACCOUNT = { u: 'demo.cashier@vipers.demo', p: 'everton' };
  var session = {
    get: function (k) { try { return sessionStorage.getItem('vipers.' + k); } catch (e) { return null; } },
    set: function (k, v) { try { sessionStorage.setItem('vipers.' + k, v); } catch (e) {} },
    del: function (k) { try { sessionStorage.removeItem('vipers.' + k); } catch (e) {} }
  };
  // native setter + input event: updates both AngularJS ng-model and Vue v-model
  function setVal(input, v) {
    var proto = input.tagName === 'SELECT' ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, 'value').set.call(input, v);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }
  // role icons (24x24 line icons) and colours, matching the Home tiles
  var CARD_ICONS = {
    'Reception': '<circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 4-6 8-6s8 2 8 6"/>',
    'Doctor': '<path d="M6 3v6a5 5 0 0 0 10 0V3"/><path d="M11 14v2a5 5 0 0 0 10 0v-3"/><circle cx="21" cy="11" r="2"/>',
    'Ward Nurse': '<path d="M2 5v15"/><path d="M2 9h17a3 3 0 0 1 3 3v8"/><path d="M2 16h20"/><circle cx="7" cy="12.5" r="1.8"/>',
    'Laboratory': '<path d="M9 3h6"/><path d="M10 3v6L4.6 18.7A1.5 1.5 0 0 0 5.9 21h12.2a1.5 1.5 0 0 0 1.3-2.3L14 9V3"/><path d="M7.5 15h9"/>',
    'Cashier': '<rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="3"/><path d="M6 12h.01M18 12h.01"/>',
    'Administrator': '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M2 12h3M19 12h3M4.9 19.1L7 17M17 7l2.1-2.1"/>',
    'Billing': '<path d="M5 2h14v20l-3-2-2 2-2-2-2 2-2-2-3 2z"/><path d="M9 7h6M9 11h6M9 15h4"/>'
  };
  var CARD_ICON_DEFAULT = CARD_ICONS.Billing;
  var ARROW = '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg>';
  function card(title, desc, onclick, iconKey) {
    var key = iconKey || title;
    var b = el('button', { type: 'button', class: 'vp-card', 'data-role': key.toLowerCase().replace(/[^a-z]+/g, '-'), onclick: onclick });
    var ico = el('span', { class: 'vp-card-ico', 'aria-hidden': 'true' });
    ico.innerHTML = '<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">' + (CARD_ICONS[key] || CARD_ICON_DEFAULT) + '</svg>';
    var arrow = el('span', { class: 'vp-card-arrow', 'aria-hidden': 'true' });
    arrow.innerHTML = ARROW;
    b.appendChild(ico);
    b.appendChild(el('span', { class: 'vp-card-title', text: title }));
    b.appendChild(el('span', { class: 'vp-card-desc', text: desc }));
    b.appendChild(arrow);
    return b;
  }
  function cardsBox(id, heading, cards, form) {
    var status = el('p', { class: 'vp-cards-status', role: 'status' });
    var grid = el('div', { class: 'vp-card-grid' }, cards);
    var box = el('div', { id: id, class: 'vp-cards' }, [
      el('p', { class: 'vp-cards-head', text: heading }), grid, status,
      el('a', { href: '#', class: 'vp-cards-manual', text: 'Sign in with a username and password instead', onclick: function (e) {
        e.preventDefault(); form.classList.toggle('vp-manual');
      } })
    ]);
    box.busy = function (msg) {
      status.textContent = msg;
      [].forEach.call(grid.querySelectorAll('button'), function (b) { b.disabled = true; });
      setTimeout(function () { status.textContent = ''; [].forEach.call(grid.querySelectorAll('button'), function (b) { b.disabled = false; }); }, 20000);
    };
    return box;
  }
  // ---------------- evening mode ----------------
  // One switch for every module (Bahmni, Lab, Billing): vipers.css darkens the page and keeps photos, logos and
  // documents in true colour. The choice is a per-device convenience (localStorage).
  var MOON = '<svg viewBox="0 0 24 24" width="17" height="17" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>';
  var SUN = '<svg viewBox="0 0 24 24" width="17" height="17" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>';
  function applyTheme() { document.documentElement.classList.toggle('vp-dark', store.get('theme') === 'evening'); }
  function paintThemeBtn(b) {
    var dark = store.get('theme') === 'evening';
    b.innerHTML = dark ? SUN : MOON;
    b.setAttribute('aria-label', dark ? 'Switch to day mode' : 'Switch to evening mode');
    b.setAttribute('title', dark ? 'Day mode' : 'Evening mode');
  }
  function toggleTheme() {
    store.set('theme', store.get('theme') === 'evening' ? 'day' : 'evening');
    applyTheme();
    paintThemeBtn(root.querySelector('.vp-theme-btn'));
  }

  // ---------------- hospital trial servers ----------------
  // /vipers-assets/site.json exists only on a hospital's own trial server: {mode:"hospital", hospital, username,
  // billingEmail, expires}. There the role cards are replaced by the hospital's own sign-in and a trial notice.
  var SITE = null;   // null until loaded; {} on the shared demo
  function trialDate() { var d = new Date(SITE.expires); return isNaN(d) ? SITE.expires : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }); }
  function applySiteMode() {
    if (!SITE || SITE.mode !== 'hospital') return;
    document.documentElement.classList.add('vp-hospital');
    var tag = root && root.querySelector('.vp-badge-tag'), note = root && root.querySelector('.vp-badge-note');
    if (tag) tag.textContent = 'TRIAL';
    if (note) note.textContent = SITE.hospital + ' - all data is deleted on ' + trialDate();
  }
  function hospitalLogin() {
    var notice = 'This is the private trial space of ' + SITE.hospital + '. All data is deleted automatically on ' + trialDate() + '.';
    if (BILLING) {
      if (!billingLoginPage() || document.getElementById('vp-hnotice')) return;
      var email = document.querySelector('input[type=email]'), form = email && email.closest('form');
      if (!form) return;
      if (SITE.billingEmail && !email.value) setVal(email, SITE.billingEmail);
      form.insertBefore(el('p', { id: 'vp-hnotice', class: 'vp-hnotice', text: 'Billing for ' + SITE.hospital + ': sign in with ' + (SITE.billingEmail || 'your billing e-mail') + ' and your account password. ' + notice }), form.firstChild);
      return;
    }
    if (!/\/bahmni\/home/.test(location.pathname) || !/^#\/login/.test(location.hash || '') || document.getElementById('vp-hnotice')) return;
    var f = document.querySelector('form[name=loginForm]');
    if (!f) return;
    var body = f.querySelector('.login-body') || f;
    body.insertBefore(el('div', { id: 'vp-hnotice', class: 'vp-hnotice' }, [
      el('strong', { text: 'Welcome, ' + SITE.hospital }), el('br'), document.createTextNode('Sign in with your hospital username and password. ' + notice)]), body.firstChild);
    var u = document.getElementById('username');
    if (u && SITE.username && !u.value) setVal(u, SITE.username);
  }

  // Bahmni sometimes renders the language selector with no value (blank box): default it to English
  function fixLocale() {
    var loc = document.getElementById("locale");
    if (!loc || (loc.value && loc.value !== "?")) return;
    var en = [].filter.call(loc.options, function (o) { return o.value === "string:en"; })[0];
    if (en) setVal(loc, en.value);
  }

  function demoLogin() {
    if (SITE === null) return;
    fixLocale();
    if (SITE.mode === 'hospital') return hospitalLogin();
    if (SITE.mode) return;   // hospital server still being set up: no demo role cards
    if (BILLING) return billingCards();
    var h = location.hash || '';
    if (!/\/bahmni\/home/.test(location.pathname) || !/login/i.test(h)) { session.del('retried'); return; }
    if (/loginLocation/.test(h)) return autoLocation();
    if (!/^#\/login/.test(h) || document.getElementById('vp-cards')) return;
    var form = document.querySelector('form[name=loginForm]');
    var user = document.getElementById('username'), pass = document.getElementById('password');
    if (!form || !user || !pass) return;
    form.classList.add('vp-cards-mode');
    var signIn = function (a) {
      box.busy('Signing in as ' + a.t + ELLIPSIS);
      session.set('autoloc', String(Date.now()));
      // End any session left over from the previous role (login page reopened without a full logout).
      // Otherwise Bahmni keeps the old user, fails to save the new user's preferences (HTTP 500) and its spinner never stops.
      fetch('/openmrs/ws/rest/v1/session', { method: 'DELETE', credentials: 'same-origin' }).catch(function () {}).then(function () {
        setVal(user, a.u); setVal(pass, a.p);
        form.querySelector('button[type=submit]').click();
      });
      // safety net: if the sign-in has not left the login page after 25 s, reload and retry once
      setTimeout(function () {
        if (!/^#\/login(\?|$)/.test(location.hash)) return;
        if (session.get('retried')) { session.del('retried'); box.querySelector('.vp-cards-status').textContent = 'Sign-in did not finish. Please click your role again.'; return; }
        session.set('retry', a.u); location.reload();
      }, 25000);
    };
    var box = cardsBox('vp-cards', 'Click your role to enter. No password needed.', ACCOUNTS.map(function (a) {
      return card(a.t, a.d, function () { signIn(a); });
    }).concat([card('Billing', 'Invoices, payments and receipts in UGX', function () { location.href = '/vipers-gate/to-billing'; })]), form);
    var body = form.querySelector('.login-body') || form;
    body.insertBefore(box, body.querySelector('.form-field'));
    var retry = session.get('retry');
    if (retry) {
      session.del('retry'); session.set('retried', '1');
      var a = ACCOUNTS.filter(function (x) { return x.u === retry; })[0];
      if (a) setTimeout(function () { signIn(a); }, 500);
    }
  }
  // after a card sign-in, pick the hospital on the "choose location" step automatically
  function autoLocation() {
    var t = +session.get('autoloc');
    if (!t || Date.now() - t > 120000) return;
    var btn = [].filter.call(document.querySelectorAll('button'), function (b) { return /continue/i.test(b.textContent); })[0];
    var sels = document.querySelectorAll('select'), sel = sels[sels.length - 1];
    if (!btn || !sel) return;
    var opts = [].filter.call(sel.options, function (o) { return o.value && !/^\?/.test(o.value); });
    if (!opts.length) return;
    var o = opts.filter(function (x) { return /vipers/i.test(x.text); })[0] || opts[0];
    session.del('autoloc');
    setVal(sel, o.value);
    setTimeout(function () { btn.click(); }, 300);
  }
  // Crater serves its login form at / (and /login); other pages with a password field live under /admin
  function billingLoginPage() {
    return (location.pathname === '/' || /login/.test(location.pathname)) && !!document.querySelector('form input[type=password]');
  }
  function billingCards() {
    if (!billingLoginPage() || document.getElementById('vp-bcards')) return;
    var email = document.querySelector('input[type=email]'), pass = document.querySelector('input[type=password]');
    var form = email && email.closest('form');
    if (!form || !pass) return;
    form.classList.add('vp-cards-mode');
    var box = cardsBox('vp-bcards', 'Click to enter Billing. No password needed.', [card('Enter Billing as Cashier', 'Invoices, payments and receipts in UGX', function () {
      box.busy('Signing in' + ELLIPSIS);
      setVal(email, BILLING_ACCOUNT.u); setVal(pass, BILLING_ACCOUNT.p);
      setTimeout(function () { (form.querySelector('button[type=submit]') || form.querySelector('button')).click(); }, 50);
    }, 'Billing')], form);
    form.insertBefore(box, form.firstChild);
  }

  // ---------------- In-Patient: diagnoses from the 2.0 consultation ----------------
  // The ward (ADT) screens read only legacy diagnosis records, but the 2.0 consultation stores diagnoses
  // in the newer store (FHIR Condition, category encounter-diagnosis), so the panel always said
  // "No diagnosis for this patient". Fill it from FHIR, as the 2.0 dashboard does.
  function adtDiagnoses() {
    if (!/\/bahmni\/adt/.test(location.pathname)) return;
    var m = /patient\/([0-9a-f-]{36})/.exec(location.hash);
    if (!m) return;
    var empty = [].filter.call(document.querySelectorAll('div, span, p, td'), function (e) {
      return !e.children.length && /^\s*No diagnosis for this patient\s*$/i.test(e.textContent) && e.getAttribute('data-vp-dx') !== m[1];
    })[0];
    if (!empty) return;
    empty.setAttribute('data-vp-dx', m[1]);
    fetch('/openmrs/ws/fhir2/R4/Condition?category=encounter-diagnosis&patient=' + m[1] + '&_count=10&_sort=-_lastUpdated', { credentials: 'same-origin', headers: { Accept: 'application/fhir+json' } })
      .then(function (r) { return r.json(); })
      .then(function (b) {
        var rows = (b.entry || []).map(function (x) {
          var c = x.resource, code = c.code || {};
          var name = code.text || ((code.coding || [])[0] || {}).display || 'Diagnosis';
          var cert = (((c.verificationStatus || {}).coding || [])[0] || {}).code || '';
          var when = (c.recordedDate || '').slice(0, 10).split('-').reverse().join('/');
          return name + (cert ? ' - ' + cert.charAt(0).toUpperCase() + cert.slice(1) : '') + (when ? ' (' + when + (c.recorder && c.recorder.display ? ', ' + c.recorder.display : '') + ')' : '');
        });
        if (!rows.length) return;
        var ul = el('ul', { class: 'vp-adt-dx' }, rows.map(function (t) { return el('li', { text: t }); }));
        empty.textContent = '';
        empty.appendChild(ul);
      }).catch(function () {});
  }

  // In-Patient action buttons (Save / Cancel / Admit / Discharge) share one class; mark Cancel so it is styled as secondary
  function markSecondaryButtons() {
    var b = document.querySelectorAll("button.admit_btn:not(.vp-secondary)");
    for (var i = 0; i < b.length; i++) if (/^\s*Cancel\s*$/i.test(b[i].textContent)) b[i].classList.add("vp-secondary");
  }

  // ---------------- loading hint ----------------
  // On a first visit some modules show a blank page for 10+ seconds while their code downloads. vipers.css
  // shows "Loading VIPERS HOSPITAL..." from first paint (this script only runs after that download);
  // here we mark the page ready once real content is on screen.
  function loadingHint() {
    var t0 = Date.now();
    var hasContent = function () {
      var kids = document.body.children;
      for (var i = 0; i < kids.length; i++) {
        if (kids[i] === root || kids[i].nodeName === 'SCRIPT') continue;
        if (kids[i].offsetHeight > 40 && (kids[i].innerText || '').replace(/\s+/g, '').length > 15) return true;
      }
      return false;
    };
    var iv = setInterval(function () {
      if (hasContent() || Date.now() - t0 > 90000) { clearInterval(iv); document.documentElement.classList.add('vp-ready'); }
    }, 250);
  }

  // ---------------- boot ----------------
  var lastPage = null, lastUrl = null;
  function onRoute() {
    var id = pageId(), url = location.pathname + location.hash;
    if (id === lastPage) return;
    // page class on <html> lets the stylesheet apply phone fixes to specific screens only
    if (lastPage) document.documentElement.classList.remove('vp-page-' + lastPage);
    document.documentElement.classList.add('vp-page-' + id);
    lastPage = id;
    if (url !== lastUrl) { closePanels(); lastUrl = url; } // keep panels open for in-page changes (e.g. Vitals form)
    else if (!helpPanel.hasAttribute('hidden')) renderHelp();
    loadRole();
    setTimeout(showTip, 1200);
    if (id === 'home') {
      setTimeout(function () { startTour(false); }, 800);
      setTimeout(function () { (window.requestIdleCallback || function (f) { f(); })(warmModules); }, 4000);
    }
  }

  function start() {
    // one-time repair per browser (bump the key to repeat): 25 Oct warm-up bug cached a damaged appointment.js;
    // 28 Oct: config files had no Cache-Control, so browsers kept old Home tiles/dashboards;
    // clear this site's HTTP cache once per browser (server answers with Clear-Site-Data: "cache")
    if (!store.get('cachefix-2')) {
      fetch('/vipers-gate/reset-cache', { credentials: 'same-origin', cache: 'no-store' })
        .then(function () { store.set('cachefix-2', '1'); }).catch(function () {});
    }
    if (BILLING) document.documentElement.classList.add('vp-billing'); // teal theme for Crater
    applyTheme();
    build();
    loadingHint();
    brandAll();
    fetch('/vipers-assets/site.json', { credentials: 'same-origin', cache: 'no-store' })
      .then(function (r) { return r.ok ? r.json() : {}; }).catch(function () { return {}; })
      .then(function (j) { SITE = j || {}; applySiteMode(); });
    fetch('/vipers-assets/help.json', { credentials: 'same-origin' }).then(function (r) { return r.json(); })
      .then(function (j) { help = j; onRoute(); }).catch(onRoute);
    var pending = false;
    new MutationObserver(function () {
      if (pending) return; pending = true;
      setTimeout(function () { pending = false; brandAll(); }, 250);
    }).observe(document.documentElement, { childList: true, subtree: true, characterData: true });
    window.addEventListener('hashchange', onRoute);
    setInterval(function () { onRoute(); liftAboveBottomBars(); demoLogin(); adtDiagnoses(); markSecondaryButtons(); }, 700);
    window.addEventListener('resize', liftAboveBottomBars); // SPA routes that don't fire hashchange
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closePanels(); });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
