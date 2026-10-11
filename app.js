/* CyberVault X — بدون تسجيل دخول، تخزين سحابي مشترك بين الأجهزة */
(function () {
  'use strict';

  var CFG = window.CYBERVAULT || {};
  var LS = {
    items: 'cybervault_items_v2',
    pend: 'cybervault_pending_v2',
    api: 'cybervault_api_base',
    key: 'cybervault_access_key',
    migrated: 'cybervault_migrated_v2'
  };

  /* ---------- أدوات ---------- */
  function $(s, r) { return (r || document).querySelector(s); }
  function $$(s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function icon(n) { return '<svg class="ic"><use href="#i-' + n + '"/></svg>'; }
  function lsGet(k, d) { try { var v = localStorage.getItem(k); return v == null ? d : v; } catch (e) { return d; } }
  function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
  function lsJSON(k, d) { try { return JSON.parse(lsGet(k, '')) || d; } catch (e) { return d; } }
  function newId() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }

  /* ---------- صوت خفيف (بدون مكتبات) ---------- */
  var actx = null;
  function beep(freqs) {
    try {
      actx = actx || new (window.AudioContext || window.webkitAudioContext)();
      if (actx.state === 'suspended') actx.resume();
      freqs.forEach(function (f, i) {
        var o = actx.createOscillator(), g = actx.createGain(), t = actx.currentTime + i * 0.09;
        o.type = 'sine'; o.frequency.value = f;
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(0.06, t + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
        o.connect(g); g.connect(actx.destination); o.start(t); o.stop(t + 0.25);
      });
    } catch (e) {}
  }

  var toastTimer;
  function toast(msg, bad) {
    var t = $('#toast');
    $('#toast-msg').textContent = msg;
    t.classList.toggle('bad', !!bad);
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.classList.remove('show'); }, 2400);
  }
  function copy(text) {
    function ok() { beep([880]); toast('تم النسخ'); }
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(text).then(ok, fallback);
    } else fallback();
    function fallback() {
      var ta = document.createElement('textarea');
      ta.value = text; ta.style.cssText = 'position:fixed;opacity:0';
      document.body.appendChild(ta); ta.select();
      try { document.execCommand('copy'); ok(); } catch (e) { toast('تعذر النسخ', true); }
      document.body.removeChild(ta);
    }
  }

  /* ---------- الحالة ---------- */
  var items = lsJSON(LS.items, []);
  var pend = lsJSON(LS.pend, { up: [], del: [] });
  var mode = 'local';     // cloud | local | offline
  var reason = '';
  var syncing = false;
  var lastSig = '';

  function saveLocal() { lsSet(LS.items, JSON.stringify(items)); lsSet(LS.pend, JSON.stringify(pend)); }

  /* ---------- API ---------- */
  function apiBase() {
    var b = (lsGet(LS.api, '') || CFG.API_BASE || '').trim().replace(/\/+$/, '');
    if (b && !/^https?:\/\//i.test(b)) b = 'https://' + b;
    return b;
  }
  function endpoint() { return apiBase() + '/api/vault'; }

  function api(method, opts) {
    opts = opts || {};
    var headers = { 'Content-Type': 'application/json' };
    var key = lsGet(LS.key, '');
    if (key) headers['x-vault-key'] = key;
    return fetch(endpoint() + (opts.query || ''), {
      method: method, headers: headers, cache: 'no-store',
      body: opts.body ? JSON.stringify(opts.body) : undefined
    }).then(function (r) {
      return r.text().then(function (txt) {
        var j = null; try { j = JSON.parse(txt); } catch (e) {}
        if (!r.ok || !j) {
          var err = new Error((j && j.error) || 'http_' + r.status);
          err.status = r.status; err.json = !!j; throw err;
        }
        return j;
      });
    });
  }

  function setMode(m, why) {
    mode = m; reason = why || '';
    var b = $('#status-badge');
    b.className = 'badge ' + (m === 'cloud' ? 'badge-cloud' : m === 'offline' ? 'badge-off' : 'badge-local');
    var label = m === 'cloud' ? 'متزامن سحابياً' : m === 'offline' ? 'غير متصل — محفوظ محلياً' : 'محلي (هذا الجهاز فقط)';
    b.innerHTML = icon(m === 'cloud' ? 'cloud' : 'drive') + '<span>' + label + '</span>';
    renderStatusBox();
  }

  function renderStatusBox() {
    var box = $('#status-box'); if (!box) return;
    var msg;
    if (mode === 'cloud') msg = 'متصل بالخادم ✓ — أي حساب تضيفه سيظهر تلقائياً على كل أجهزتك.';
    else if (mode === 'offline') msg = 'تعذر الاتصال بالخادم الآن. حساباتك محفوظة على هذا الجهاز وسيتم رفعها تلقائياً عند عودة الاتصال.';
    else if (reason === 'no_db') msg = 'الخادم يعمل لكن قاعدة البيانات غير مربوطة. في Vercel: Storage → Create → Upstash Redis → Connect Project ثم Redeploy.';
    else if (!apiBase() && /github\.io$/i.test(location.hostname)) msg = 'أنت على GitHub Pages: لا يوجد خادم هنا. ضع رابط مشروعك على Vercel في الخانة أدناه لتتزامن الحسابات.';
    else msg = 'لا يوجد خادم متصل، فالحسابات تُحفظ على هذا الجهاز فقط.';
    box.textContent = msg;
  }

  /* ---------- المزامنة ---------- */
  function flushPending() {
    var up = pend.up.map(function (id) { return items.filter(function (i) { return i.id === id; })[0]; }).filter(Boolean);
    var chain = Promise.resolve();
    if (up.length) chain = chain.then(function () { return api('POST', { body: { items: up } }); }).then(function () { pend.up = []; saveLocal(); });
    pend.del.slice().forEach(function (id) {
      chain = chain.then(function () { return api('DELETE', { query: '?id=' + encodeURIComponent(id) }); })
        .then(function () { pend.del = pend.del.filter(function (x) { return x !== id; }); saveLocal(); });
    });
    return chain;
  }

  function sync(manual) {
    if (syncing) return Promise.resolve();
    syncing = true;
    var badge = $('#status-badge'); badge.classList.add('spin');
    return flushPending().then(function () { return api('GET'); }).then(function (data) {
      var cloud = Array.isArray(data.items) ? data.items : [];
      var cloudIds = {}; cloud.forEach(function (i) { cloudIds[i.id] = 1; });
      var merged = cloud;
      // أول اتصال: ارفع الحسابات الموجودة محلياً فقط
      if (lsGet(LS.migrated, '') !== '1') {
        var only = items.filter(function (i) { return !cloudIds[i.id]; });
        lsSet(LS.migrated, '1');
        if (only.length) {
          merged = cloud.concat(only);
          return api('POST', { body: { items: only } }).then(function () { return merged; });
        }
      }
      return merged;
    }).then(function (list) {
      items = list; saveLocal(); setMode('cloud'); render();
      if (manual) toast('تمت المزامنة');
    }).catch(function (e) {
      if (e.status === 401) { setMode('offline'); askKey(!!lsGet(LS.key, '')); }
      else if (e.status === 501) setMode('local', 'no_db');
      else if (e.status === 404 || e.status === 405 || (e.status && !e.json)) setMode('local', 'no_server');
      else if (apiBase() || mode === 'cloud' || mode === 'offline') setMode('offline');
      else setMode('local', 'no_server');
      render();
    }).then(function () { syncing = false; badge.classList.remove('spin'); });
  }

  function pushUpsert(item) {
    if (mode === 'local') return;
    api('POST', { body: { items: [item] } }).then(function () {
      pend.up = pend.up.filter(function (x) { return x !== item.id; }); saveLocal();
      if (mode !== 'cloud') setMode('cloud');
    }).catch(function () {
      if (pend.up.indexOf(item.id) < 0) pend.up.push(item.id);
      saveLocal(); setMode('offline'); toast('حُفظ على الجهاز — سيُرفع عند عودة الاتصال', true);
    });
  }
  function pushDelete(id) {
    if (mode === 'local') return;
    api('DELETE', { query: '?id=' + encodeURIComponent(id) }).catch(function () {
      if (pend.del.indexOf(id) < 0) pend.del.push(id);
      saveLocal(); setMode('offline');
    });
  }

  /* ---------- عرض البطاقات ---------- */
  function faviconUrl(u) {
    if (!u) return '';
    try {
      var c = /^https?:\/\//i.test(u) ? u : 'https://' + u;
      return 'https://www.google.com/s2/favicons?domain=' + new URL(c).hostname + '&sz=128';
    } catch (e) { return ''; }
  }

  function render() {
    var q = ($('#search').value || '').toLowerCase().trim();
    var list = items.filter(function (i) {
      return !q || [i.title, i.email, i.note, i.url].some(function (v) { return String(v || '').toLowerCase().indexOf(q) > -1; });
    });
    var sig = JSON.stringify(list);
    if (sig === lastSig) return;
    lastSig = sig;

    var grid = $('#grid');
    if (!list.length) {
      grid.innerHTML = '<div class="empty"><div class="icon-chip">' + icon('shield') + '</div>' +
        '<h3>' + (q ? 'لا توجد نتائج مطابقة' : 'لا توجد حسابات بعد') + '</h3>' +
        '<p>' + (q ? 'جرّب كلمات بحث أخرى.' : 'اضغط «إضافة حساب جديد» لحفظ أول حساب.') + '</p></div>';
      return;
    }
    grid.innerHTML = list.map(function (it, n) {
      var fav = faviconUrl(it.url);
      return '<div class="card" data-id="' + esc(it.id) + '" style="animation-delay:' + Math.min(n * 40, 400) + 'ms">' +
        '<div class="card-top"><div class="card-id">' +
        '<div class="fav">' + (fav ? '<img src="' + esc(fav) + '" alt="" loading="lazy">' : icon('globe')) + '</div>' +
        '<div style="min-width:0"><h3>' + esc(it.title) + '</h3><p class="mail">' + esc(it.email) + '</p></div></div>' +
        '<div class="card-act">' +
        '<button class="icon-btn" data-act="edit" title="تعديل">' + icon('pen') + '</button>' +
        '<button class="icon-btn danger" data-act="del" title="حذف">' + icon('trash') + '</button></div></div>' +
        '<div class="pw"><div class="pw-box"><input type="password" readonly value="' + esc(it.password) + '">' +
        '<button class="icon-btn sm" data-act="eye" title="إظهار/إخفاء">' + icon('eye') + '</button>' +
        '<button class="icon-btn sm" data-act="copy" title="نسخ كلمة السر">' + icon('copy') + '</button></div>' +
        '<button class="icon-btn" data-act="copymail" title="نسخ البريد">' + icon('copy') + '</button></div>' +
        (it.note ? '<div class="note-line">' + esc(it.note) + '</div>' : '') +
        '</div>';
    }).join('');
    $$('.fav img', grid).forEach(function (img) {
      img.addEventListener('error', function () { img.parentNode.innerHTML = icon('globe'); });
    });
  }

  $('#grid').addEventListener('click', function (e) {
    var btn = e.target.closest('[data-act]'); if (!btn) return;
    var card = btn.closest('.card'), id = card.getAttribute('data-id');
    var it = items.filter(function (i) { return i.id === id; })[0]; if (!it) return;
    var act = btn.getAttribute('data-act');
    if (act === 'eye') {
      var inp = $('input', card), show = inp.type === 'password';
      inp.type = show ? 'text' : 'password';
      btn.innerHTML = icon(show ? 'eye-off' : 'eye');
    } else if (act === 'copy') copy(it.password);
    else if (act === 'copymail') copy(it.email);
    else if (act === 'edit') openModal(it);
    else if (act === 'del') {
      if (!confirm('حذف حساب «' + it.title + '» نهائياً؟')) return;
      items = items.filter(function (i) { return i.id !== id; });
      pend.up = pend.up.filter(function (x) { return x !== id; });
      saveLocal(); render(); pushDelete(id); toast('تم حذف الحساب');
    }
  });
  $('#search').addEventListener('input', render);

  /* ---------- نافذة الإضافة / التعديل ---------- */
  function setLogo(url) {
    var img = $('#f-logo'), ph = $('#f-logo-ph'), txt = $('#f-logo-txt');
    var f = faviconUrl(url);
    if (!f) { img.hidden = true; ph.style.display = ''; txt.textContent = url ? 'رابط غير صالح لمعاينة الشعار' : 'أدخل رابط الموقع لجلب الشعار تلقائياً'; return; }
    img.onload = function () { img.hidden = false; ph.style.display = 'none'; txt.textContent = 'تم جلب الشعار بنجاح'; };
    img.onerror = function () { img.hidden = true; ph.style.display = ''; txt.textContent = 'تعذر جلب الشعار — سيُستخدم رمز افتراضي'; };
    img.src = f;
  }
  $('#f-url').addEventListener('input', function () { setLogo(this.value.trim()); });

  function openModal(it) {
    $('#form').reset();
    $('#modal-title').textContent = it ? 'تعديل بيانات الحساب' : 'إضافة حساب جديد';
    $('#f-id').value = it ? it.id : '';
    $('#f-title').value = it ? it.title : '';
    $('#f-url').value = it ? it.url || '' : '';
    $('#f-email').value = it ? it.email : '';
    $('#f-pass').value = it ? it.password : '';
    $('#f-note').value = it ? it.note || '' : '';
    $('#f-pass').type = 'password';
    $('#f-eye').innerHTML = icon('eye');
    setLogo(it ? it.url : '');
    $('#modal').classList.remove('hidden');
    setTimeout(function () { $('#f-title').focus(); }, 50);
  }
  function closeModal() { $('#modal').classList.add('hidden'); }
  $('#btn-add').addEventListener('click', function () { openModal(null); });
  $$('[data-close]').forEach(function (b) { b.addEventListener('click', closeModal); });
  $('#modal').addEventListener('mousedown', function (e) { if (e.target === this) closeModal(); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeModal(); });
  $('#f-eye').addEventListener('click', function () {
    var i = $('#f-pass'), show = i.type === 'password';
    i.type = show ? 'text' : 'password'; this.innerHTML = icon(show ? 'eye-off' : 'eye');
  });
  $('#f-rand').addEventListener('click', function () {
    $('#f-pass').value = genPassword(18, true, true, true, true);
    $('#f-pass').type = 'text'; $('#f-eye').innerHTML = icon('eye-off');
    beep([660, 990]); toast('تم توليد كلمة سر قوية');
  });

  $('#form').addEventListener('submit', function (e) {
    e.preventDefault();
    var id = $('#f-id').value || newId();
    var item = {
      id: id,
      title: $('#f-title').value.trim(),
      url: $('#f-url').value.trim(),
      email: $('#f-email').value.trim(),
      password: $('#f-pass').value,
      note: $('#f-note').value.trim(),
      updatedAt: new Date().toISOString()
    };
    var idx = items.map(function (i) { return i.id; }).indexOf(id);
    if (idx > -1) items[idx] = item; else items.push(item);
    saveLocal(); render(); closeModal();
    beep([660, 880, 1320]); toast('تم حفظ الحساب');
    pushUpsert(item);
  });

  /* ---------- المولّد ---------- */
  function genPassword(len, up, low, num, sym) {
    var sets = [];
    if (up) sets.push('ABCDEFGHJKLMNPQRSTUVWXYZ');
    if (low) sets.push('abcdefghijkmnopqrstuvwxyz');
    if (num) sets.push('23456789');
    if (sym) sets.push('!@#$%^&*()-_=+?');
    if (!sets.length) return '';
    var all = sets.join(''), out = [];
    function rnd(n) {
      var a = new Uint32Array(1), lim = Math.floor(4294967296 / n) * n;
      do { crypto.getRandomValues(a); } while (a[0] >= lim);
      return a[0] % n;
    }
    sets.forEach(function (s) { out.push(s[rnd(s.length)]); });
    while (out.length < len) out.push(all[rnd(all.length)]);
    for (var i = out.length - 1; i > 0; i--) { var j = rnd(i + 1), t = out[i]; out[i] = out[j]; out[j] = t; }
    return out.slice(0, len).join('');
  }
  function regen() {
    $('#gen-out').value = genPassword(+$('#gen-len').value, $('#g-up').checked, $('#g-low').checked, $('#g-num').checked, $('#g-sym').checked) || 'اختر نوع حروف واحد على الأقل';
  }
  $('#gen-len').addEventListener('input', function () { $('#len-val').textContent = this.value; regen(); });
  ['g-up', 'g-low', 'g-num', 'g-sym'].forEach(function (id) { $('#' + id).addEventListener('change', regen); });
  $('#gen-btn').addEventListener('click', function () { regen(); beep([660, 990]); });
  $('#gen-copy').addEventListener('click', function () { copy($('#gen-out').value); });
  regen();

  /* ---------- التبويبات ---------- */
  $('#tabs').addEventListener('click', function (e) {
    var b = e.target.closest('.tab'); if (!b) return;
    $$('.tab').forEach(function (t) { t.classList.toggle('active', t === b); });
    $$('.view').forEach(function (v) { v.classList.add('hidden'); });
    $('#view-' + b.getAttribute('data-tab')).classList.remove('hidden');
    beep([520]);
  });

  /* ---------- الإعدادات ---------- */
  $('#set-api').value = lsGet(LS.api, '');
  $('#set-key').value = lsGet(LS.key, '');
  $('#set-save').addEventListener('click', function () {
    lsSet(LS.api, $('#set-api').value.trim());
    lsSet(LS.key, $('#set-key').value.trim());
    lsSet(LS.migrated, '');
    sync(true);
  });
  $('#status-badge').addEventListener('click', function () { sync(true); });

  /* ---------- رمز الوصول (اختياري) ---------- */
  function askKey(wrong) {
    $('#key-err').classList.toggle('hidden', !wrong);
    $('#key-modal').classList.remove('hidden');
    setTimeout(function () { $('#key-input').focus(); }, 50);
  }
  function submitKey() {
    var v = $('#key-input').value.trim(); if (!v) return;
    lsSet(LS.key, v); $('#set-key').value = v;
    $('#key-modal').classList.add('hidden'); $('#key-input').value = '';
    sync();
  }
  $('#key-ok').addEventListener('click', submitKey);
  $('#key-input').addEventListener('keydown', function (e) { if (e.key === 'Enter') submitKey(); });

  /* ---------- بدء التشغيل ---------- */
  render();
  setMode('local');
  sync();
  setInterval(function () { if (!document.hidden) sync(); }, 10000);
  document.addEventListener('visibilitychange', function () { if (!document.hidden) sync(); });
  window.addEventListener('online', function () { sync(); });
})();
