/* VIPERS HOSPITAL trial portal: open an account (creates the hospital's own server) or log in to an existing one. */
(function () {
  'use strict';
  var $ = function (s) { return document.querySelector(s); };
  var tabs = document.querySelectorAll('.tp-tabs button');
  var forms = { open: $('#tp-open'), login: $('#tp-login') };
  [].forEach.call(tabs, function (b) {
    b.addEventListener('click', function () {
      [].forEach.call(tabs, function (x) { x.setAttribute('aria-selected', String(x === b)); });
      forms.open.hidden = b.dataset.tab !== 'open';
      forms.login.hidden = b.dataset.tab !== 'login';
    });
  });
  function msg(form, text, err) { var m = form.querySelector('.tp-msg'); m.textContent = text || ''; m.className = 'tp-msg' + (err ? ' err' : ''); }
  function post(url, data) {
    return fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) })
      .then(function (r) { return r.json().then(function (j) { j.httpStatus = r.status; return j; }); });
  }
  function dateText(iso) { var d = new Date(iso); return isNaN(d) ? iso : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }); }

  function waitFor(id, form) {
    form.innerHTML = '<div class="tp-wait"><div class="tp-spin" aria-hidden="true"></div><h2 style="margin:0 0 6px;font-size:20px">Preparing your hospital space</h2>' +
      '<p style="margin:0;color:#3d5361">This takes about 5-10 minutes. You can keep this page open - it continues automatically.</p>' +
      '<ol class="tp-steps"><li>Creating your private server</li><li>Starting all hospital modules</li><li>Setting up your account</li></ol><p class="tp-msg" role="status"></p></div>';
    var started = Date.now();
    (function poll() {
      fetch('/vipers-trial/api/status?id=' + encodeURIComponent(id)).then(function (r) { return r.json(); }).then(function (j) {
        if (j.status === 'ready' && j.url) {
          msg(form, 'Ready! Opening ' + j.hospital + ' (available until ' + dateText(j.expires) + ')...');
          setTimeout(function () { location.href = j.url; }, 1500);
          return;
        }
        if (j.status === 'failed' || j.status === 'deleted' || j.error === 'unknown') { msg(form, 'Sorry, the hospital space could not be prepared. Please try again later.', true); return; }
        var min = Math.round((Date.now() - started) / 60000);
        msg(form, min ? 'Still working... (' + min + ' min)' : '');
        setTimeout(poll, 15000);
      }).catch(function () { setTimeout(poll, 20000); });
    })();
  }

  forms.open.addEventListener('submit', function (e) {
    e.preventDefault();
    var f = forms.open, btn = f.querySelector('button[type=submit]');
    var data = { hospital: f.hospital.value, username: f.username.value, password: f.password.value };
    btn.disabled = true; msg(f, 'Creating your hospital space...');
    post('/vipers-trial/api/signup', data).then(function (j) {
      if (j.httpStatus === 200 && j.id) {
        try { localStorage.setItem('vipers.trial', JSON.stringify({ id: j.id, username: data.username })); } catch (x) {}
        waitFor(j.id, f);
      } else { btn.disabled = false; msg(f, j.error || 'Something went wrong. Please try again.', true); }
    }).catch(function () { btn.disabled = false; msg(f, 'Could not reach the server. Please check your connection and try again.', true); });
  });

  forms.login.addEventListener('submit', function (e) {
    e.preventDefault();
    var f = forms.login, btn = f.querySelector('button[type=submit]');
    btn.disabled = true; msg(f, 'Looking up your hospital space...');
    post('/vipers-trial/api/find', { username: f.username.value }).then(function (j) {
      if (j.httpStatus === 200 && j.url) { msg(f, 'Opening ' + j.hospital + '...'); location.href = j.url; }
      else if (j.httpStatus === 202 && j.id) { waitFor(j.id, f); }
      else { btn.disabled = false; msg(f, j.error || 'Not found.', true); }
    }).catch(function () { btn.disabled = false; msg(f, 'Could not reach the server. Please try again.', true); });
  });

  // returning visitor whose space was still being prepared: resume waiting
  try {
    var pending = JSON.parse(localStorage.getItem('vipers.trial') || 'null');
    if (pending && pending.id) {
      fetch('/vipers-trial/api/status?id=' + encodeURIComponent(pending.id)).then(function (r) { return r.json(); }).then(function (j) {
        if (j.status === 'creating') waitFor(pending.id, forms.open);
      }).catch(function () {});
    }
  } catch (x) {}
})();
