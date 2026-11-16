/* PROMO MR — وحدة بطاقات الحفل الليلي (QR حقيقي + معلومات كاملة + صفحة مقسّمة حسب الحفل + إصلاح الإشعارات) */
(function () {
  'use strict';
  if (window.__pmNightV2) return; window.__pmNightV2 = true;
  var br = function () { return window.PromoMRFeatureBridge || null; };
  var isFr = function () { try { return (br() && br().lang && br().lang()) === 'fr' || document.documentElement.lang === 'fr'; } catch (e) { return false; } };
  var T = function (ar, fr) { return isFr() ? fr : ar; };
  var esc = function (v) { return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  var dbc = function () { var b = br(); return b && b.db ? b.db : (typeof db !== 'undefined' ? db : null); };
  var promoId = function () { var b = br(); try { return (b && b.tenant && b.tenant.id) || (typeof TENANT !== 'undefined' && TENANT && TENANT.id) || null; } catch (e) { return null; } };
  var say = function (m, k) { try { if (typeof toast === 'function') toast(m, k || ''); else if (br() && br().toast) br().toast(m, k); } catch (e) {} };

  function fmtDate(v) {
    if (!v) return T('لم يُحدَّد بعد', 'Non défini');
    try { return new Date(v).toLocaleString(isFr() ? 'fr-FR' : 'ar', { dateStyle: 'full', timeStyle: 'short' }); } catch (e) { return String(v); }
  }
  function cardUrl(token) { try { var u = new URL(location.href); u.hash = ''; u.searchParams.delete('night-cards'); u.searchParams.set('graduate', '1'); u.searchParams.set('night-card', token); return u.toString(); } catch (e) { return token; } }
  function qrSvg(token) { try { return window.PromoMRQR.toSvg(cardUrl(token), { margin: 2 }); } catch (e) { return '<div class="pm-qr-err">' + esc(token) + '</div>'; } }
  function pick(c, k) { return isFr() ? (c[k + '_fr'] || c[k + '_ar'] || '') : (c[k + '_ar'] || c[k + '_fr'] || ''); }

  function css() {
    if (document.getElementById('pm-night-css')) return;
    var s = document.createElement('style'); s.id = 'pm-night-css';
    s.textContent = '.pm-card{background:#fff;color:#0b1220;border-radius:18px;padding:14px;margin:10px 0;box-shadow:0 6px 20px rgba(0,0,0,.25);text-align:center}.pm-card h4{margin:0 0 2px;font-size:16px}.pm-card .pm-sub{font-size:12px;color:#475569;margin-bottom:8px}.pm-qr{width:min(240px,100%);margin:8px auto;background:#fff;padding:6px;border-radius:12px}.pm-qr svg{width:100%;height:auto;display:block}.pm-info{text-align:start;font-size:13px;margin-top:8px;display:grid;gap:4px}.pm-info b{color:#334155}.pm-badge{display:inline-block;padding:2px 10px;border-radius:99px;font-size:12px;background:#dcfce7;color:#166534}.pm-badge.used{background:#fee2e2;color:#991b1b}.pm-acts{display:flex;gap:6px;flex-wrap:wrap;justify-content:center;margin-top:8px}.pm-acts button,.pm-btn{border:1px solid #cbd5e1;background:#f1f5f9;color:#0b1220;border-radius:10px;padding:6px 10px;font:inherit;font-size:12px;cursor:pointer}.pm-ev{background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.15);border-radius:16px;padding:12px;margin:12px 0}.pm-ev h3{margin:0 0 6px}.pm-ev .pm-meta{font-size:13px;opacity:.9;display:grid;gap:2px}.pm-stats{display:flex;gap:8px;margin-top:8px;flex-wrap:wrap}.pm-stats span{background:rgba(255,255,255,.1);padding:3px 10px;border-radius:99px;font-size:12px}.pm-extra{margin-top:8px;font-size:13px;text-align:start;display:grid;gap:3px}.pm-empty{padding:18px;text-align:center;opacity:.85}';
    document.head.appendChild(s);
  }

  var ownCache = { t: 0, rows: null };
  async function loadOwn(force) {
    if (!force && ownCache.rows && Date.now() - ownCache.t < 20000) return ownCache.rows;
    var d = dbc(); if (!d) throw new Error('NO_DB');
    var r = await d.rpc('get_my_night_event_cards', { _promotion_id: promoId() });
    if (r.error) throw r.error;
    ownCache = { t: Date.now(), rows: r.data || [] }; return ownCache.rows;
  }
  function infoRows(c) {
    var inst = pick(c, 'institution_name'), pn = c.promotion_number != null ? c.promotion_number : '', pname = pick(c, 'promotion_name');
    var rows = [];
    rows.push(['🏛', T('المؤسسة', 'Établissement'), inst]);
    rows.push(['🎓', T('الدفعة', 'Promotion'), [pname, pn !== '' ? (T('الدفعة رقم ', 'Promotion n° ') + pn) : ''].filter(Boolean).join(' — ')]);
    rows.push(['📍', T('مكان الحفل', 'Lieu'), pick(c, 'venue') || T('لم يُحدَّد بعد', 'Non défini')]);
    rows.push(['📅', T('تاريخ الحفل', 'Date'), fmtDate(c.event_date)]);
    if (c.beneficiary_name !== undefined) rows.push(['👤', T('المستفيد', 'Bénéficiaire'), c.beneficiary_name || T('لم يحدد المستفيد بعد', 'Non défini')]);
    return rows.filter(function (r) { return r[2]; }).map(function (r) { return '<div>' + r[0] + ' <b>' + esc(r[1]) + ':</b> ' + esc(r[2]) + '</div>'; }).join('');
  }
  function cardHTML(c, i) {
    var used = !!c.used_at;
    return '<div class="pm-card" data-pm-card="' + esc(c.token) + '"><h4>' + esc(c.ceremony_name || T('الحفل الليلي', 'Soirée')) + ' #' + (i + 1) + '</h4><div class="pm-sub"><span class="pm-badge' + (used ? ' used' : '') + '">' + (used ? T('مستعملة', 'Utilisée') : T('صالحة', 'Valide')) + '</span></div>' +
      '<div class="pm-qr" style="' + (used ? 'opacity:.35' : '') + '">' + qrSvg(c.token) + '</div><div class="pm-info">' + infoRows(c) + '</div>' +
      '<div class="pm-acts"><button data-pm-share>' + T('مشاركة', 'Partager') + '</button><button data-pm-png>' + T('حفظ QR', 'Enregistrer QR') + '</button>' + (used ? '' : '<button data-pm-ben>' + T('تعديل المستفيد', 'Bénéficiaire') + '</button>') + '</div></div>';
  }

  async function staffOverview() {
    try { var d = dbc(); var r = await d.rpc('get_night_event_overview', { _promotion_id: promoId() }); return r.error ? null : (r.data || []); } catch (e) { return null; }
  }
  async function openPage() {
    css(); var b = br(); if (!b || !b.openModal) { say(T('الصفحة غير جاهزة بعد، أعد المحاولة', 'Page pas prête'), 'err'); return; }
    var root = b.openModal('<div class="modal graduate-modal" dir="' + (isFr() ? 'ltr' : 'rtl') + '"><div class="modal-head"><h3>' + T('بطاقات الحفل الليلي', 'Cartes de la soirée') + '</h3><button class="btn ghost" data-close>×</button></div><div class="modal-body" id="pmNightBody"><div class="pm-empty">…</div></div></div>');
    var host = root && root.nodeType === 1 ? root : document.querySelector('.modal-backdrop,.overlay');
    var close = function () { try { (host || root).remove(); } catch (e) {} };
    var body = (host || document).querySelector('#pmNightBody');
    host.addEventListener('click', function (e) {
      if (e.target.closest('[data-close]') || e.target === host) { close(); return; }
      var card = e.target.closest('[data-pm-card]'); if (!card) return; var tk = card.getAttribute('data-pm-card');
      if (e.target.closest('[data-pm-share]')) { var u = cardUrl(tk); if (navigator.share) navigator.share({ title: T('بطاقة الحفل الليلي', 'Carte soirée'), url: u }).catch(function () {}); else if (navigator.clipboard) navigator.clipboard.writeText(u).then(function () { say(T('تم نسخ الرابط', 'Lien copié')); }); }
      if (e.target.closest('[data-pm-png]')) { var cv = window.PromoMRQR.drawCanvas(document.createElement('canvas'), cardUrl(tk), { width: 720, margin: 4 }); cv.toBlob(function (bl) { var a = document.createElement('a'); a.href = URL.createObjectURL(bl); a.download = 'night-card-qr.png'; a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); }, 4000); }); }
      if (e.target.closest('[data-pm-ben]')) { var nm = prompt(T('اسم المستفيد من البطاقة', 'Nom du bénéficiaire')); if (nm && nm.trim()) dbc().rpc('update_night_event_card_beneficiary', { _card_id: ownCache.rows.filter(function (x) { return x.token === tk; })[0].card_id, _beneficiary_name: nm.trim() }).then(function (r) { if (r.error) say(T('تعذر الحفظ', 'Échec'), 'err'); else { say(T('تم الحفظ', 'Enregistré')); render(true); } }); }
    });
    async function render(force) {
      try {
        var sess = await dbc().auth.getSession(); if (!sess.data || !sess.data.session) { body.innerHTML = '<div class="pm-empty">' + T('سجّل الدخول إلى مساحة الخريج لعرض بطاقاتك.', 'Connectez-vous à l’espace diplômé.') + '<br><br><button class="pm-btn" id="pmLogin">' + T('فتح مساحة الخريج', 'Ouvrir l’espace') + '</button></div>'; var lb = body.querySelector('#pmLogin'); if (lb) lb.onclick = function () { close(); var g = document.getElementById('graduateEntryButton'); if (g) g.click(); }; return; }
        var rows = await loadOwn(force), ov = await staffOverview(), html = '';
        if (ov && ov.length) {
          html += '<h3>' + T('إدارة الحفل', 'Gestion') + '</h3>' + ov.map(function (o) { return '<div class="pm-ev"><h3>' + esc(o.ceremony_name || '') + '</h3><div class="pm-meta"><div>📍 ' + esc(isFr() ? (o.venue_fr || o.venue_ar || '') : (o.venue_ar || o.venue_fr || '')) + '</div><div>📅 ' + esc(fmtDate(o.event_date)) + '</div></div><div class="pm-stats"><span>' + T('الإجمالي', 'Total') + ': ' + o.total_cards + '</span><span>' + T('مستعملة', 'Utilisées') + ': ' + o.used_cards + '</span><span>' + T('متبقية', 'Restantes') + ': ' + o.remaining_cards + '</span></div></div>'; }).join('');
        }
        var groups = {}, order = []; rows.forEach(function (c) { var k = c.ceremony_id || c.ceremony_name; if (!groups[k]) { groups[k] = []; order.push(k); } groups[k].push(c); });
        html += '<h3>' + T('بطاقاتي', 'Mes cartes') + '</h3>';
        if (!order.length) html += '<div class="pm-empty">' + T('لا توجد بطاقات حفل ليلي مخصّصة لك حالياً.', 'Aucune carte pour le moment.') + '</div>';
        order.forEach(function (k) { var g = groups[k], f = g[0]; html += '<div class="pm-ev"><h3>🌙 ' + esc(f.ceremony_name || T('الحفل الليلي', 'Soirée')) + '</h3><div class="pm-meta">' + infoRows(Object.assign({}, f, { beneficiary_name: undefined })) + '</div><div class="pm-stats"><span>' + T('عدد البطاقات', 'Cartes') + ': ' + g.length + '</span></div>' + g.map(cardHTML).join('') + '</div>'; });
        body.innerHTML = html;
      } catch (e) { body.innerHTML = '<div class="pm-empty">' + T('تعذر تحميل البطاقات.', 'Chargement impossible.') + '</div>'; }
    }
    render(true);
  }

  /* ===== تزيين بطاقات المساحة والبطاقة المشتركة بـ QR حقيقي ومعلومات كاملة ===== */
  async function decorate() {
    try {
      css();
      var spaceCards = document.querySelectorAll('.graduate-night-card[data-night-card]:not([data-pm-done])');
      if (spaceCards.length) {
        spaceCards.forEach(function (el) { el.setAttribute('data-pm-done', '1'); });
        var rows = await loadOwn(false);
        spaceCards.forEach(function (el) {
          var c = rows.filter(function (x) { return x.token === el.getAttribute('data-night-card'); })[0]; if (!c) return;
          var q = el.querySelector('.graduate-night-qr'); if (q) q.innerHTML = '<div class="pm-qr">' + qrSvg(c.token) + '</div>';
          if (!el.querySelector('.pm-extra')) { var d = document.createElement('div'); d.className = 'pm-extra'; d.innerHTML = infoRows(Object.assign({}, c, { beneficiary_name: undefined })); (q || el).insertAdjacentElement('afterend', d); }
        });
      }
      var sh = document.getElementById('sharedNightQr');
      if (sh && !sh.getAttribute('data-pm-done')) {
        sh.setAttribute('data-pm-done', '1');
        var token = new URL(location.href).searchParams.get('night-card'); if (!token) return;
        var r = await dbc().rpc('get_shared_night_event_card', { _token: token }); var c2 = r.data && (Array.isArray(r.data) ? r.data[0] : r.data);
        if (c2 && !c2.used_at) sh.innerHTML = '<div class="pm-qr">' + qrSvg(token) + '</div>';
        if (c2 && !sh.parentNode.querySelector('.pm-extra')) { var d2 = document.createElement('div'); d2.className = 'pm-extra'; d2.innerHTML = infoRows(c2); sh.insertAdjacentElement('afterend', d2); }
      }
    } catch (e) {}
  }
  var pend = false;
  new MutationObserver(function () { if (pend) return; pend = true; requestAnimationFrame(function () { pend = false; decorate(); addButton(); }); }).observe(document.documentElement, { childList: true, subtree: true });

  function addButton() {
    var g = document.getElementById('graduateEntryButton'); if (!g || document.getElementById('pmNightPageBtn')) return;
    var b = document.createElement('button'); b.id = 'pmNightPageBtn'; b.type = 'button'; b.className = g.className; b.textContent = '🌙 ' + T('بطاقات الحفل الليلي', 'Cartes soirée'); b.onclick = openPage; g.insertAdjacentElement('afterend', b);
  }
  window.PromoMRNightCards = { open: openPage };
  try { if (new URL(location.href).searchParams.get('night-cards')) { var n = 0, iv = setInterval(function () { if ((br() && br().openModal) || ++n > 60) { clearInterval(iv); if (br() && br().openModal) openPage(); } }, 500); } } catch (e) {}

  /* ===== ماسح الإدارة: قبول الرمز الخام أو رابط البطاقة ===== */
  document.addEventListener('click', function (e) {
    if (!e.target.closest || !e.target.closest('#graduateNightRedeem')) return;
    var i = document.getElementById('graduateNightToken'); if (!i) return;
    var m = String(i.value || '').match(/night-card=([0-9a-fA-F]+)/); if (m) i.value = m[1].toLowerCase(); else i.value = String(i.value || '').trim();
  }, true);

  /* ===== الإشعارات: تفعيل متين + رسالة إرشادية بدل «المتصفح لا يدعم» ===== */
  function inApp() { return /FBAN|FBAV|Instagram|WhatsApp|Line\/|Snapchat|Telegram|; wv\)|WebView/i.test(navigator.userAgent); }
  async function activeReg() {
    var reg = await navigator.serviceWorker.register('/site/service-worker.js');
    if (reg.active) return reg;
    var w = reg.installing || reg.waiting;
    if (w) await new Promise(function (res) { var done = function () { res(); }; w.addEventListener('statechange', function () { if (w.state === 'activated') done(); }); setTimeout(done, 8000); });
    return reg.active ? reg : await Promise.race([navigator.serviceWorker.ready, new Promise(function (r) { setTimeout(function () { r(reg); }, 6000); })]);
  }
  function helpModal(msg) {
    var b = br(); if (!b || !b.openModal) { say(msg, 'err'); return; }
    var u = location.href, android = /Android/i.test(navigator.userAgent);
    var root = b.openModal('<div class="modal graduate-modal" dir="' + (isFr() ? 'ltr' : 'rtl') + '"><div class="modal-head"><h3>' + T('تفعيل إشعارات الهاتف', 'Notifications du téléphone') + '</h3><button class="btn ghost" data-close>×</button></div><div class="modal-body"><p>' + esc(msg) + '</p><div class="pm-acts"><button class="pm-btn" data-copy>' + T('نسخ الرابط', 'Copier le lien') + '</button>' + (android ? '<button class="pm-btn" data-chrome>' + T('فتح في Chrome', 'Ouvrir dans Chrome') + '</button>' : '') + '</div></div></div>');
    root.addEventListener('click', function (e) {
      if (e.target.closest('[data-close]') || e.target === root) root.remove();
      if (e.target.closest('[data-copy]') && navigator.clipboard) navigator.clipboard.writeText(u).then(function () { say(T('تم نسخ الرابط', 'Lien copié')); });
      if (e.target.closest('[data-chrome]')) { var x = new URL(u); location.href = 'intent://' + x.host + x.pathname + x.search + '#Intent;scheme=https;package=com.android.chrome;end'; }
    });
  }
  async function robustEnable() {
    if (typeof notifState === 'undefined') return;
    if (notifState.busy) return; notifState.busy = true;
    var fallback = function () { try { if (typeof enableRealtimeNotificationsFallback === 'function') enableRealtimeNotificationsFallback(); } catch (e) {} };
    try {
      var has = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window && window.isSecureContext;
      if (!has) {
        fallback();
        var ios = typeof isIOSDevice !== 'undefined' && isIOSDevice;
        helpModal(inApp() ? T('أنت تفتح الموقع داخل متصفح تطبيق (مثل واتساب) لا يسمح بإشعارات الهاتف. التنبيهات داخل الموقع مفعّلة الآن، ولتصلك إشعارات على الهاتف افتح الرابط في Chrome أو Safari.', 'Vous êtes dans un navigateur intégré qui ne permet pas les notifications. Ouvrez le lien dans Chrome ou Safari.')
          : ios ? T('على الأيفون ثبّت الموقع على الشاشة الرئيسية (مشاركة ← إضافة إلى الشاشة الرئيسية) ثم فعّل الإشعارات من التطبيق.', 'Sur iPhone, ajoutez le site à l’écran d’accueil puis activez les notifications.')
          : T('هذا المتصفح لا يوفّر إشعارات الهاتف. التنبيهات داخل الموقع مفعّلة، وللحصول على إشعارات الهاتف استخدم Chrome أو Edge أو Firefox.', 'Ce navigateur ne fournit pas les notifications. Utilisez Chrome, Edge ou Firefox.'));
        return;
      }
      var perm = Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission();
      if (perm !== 'granted') { fallback(); helpModal(T('تم رفض إذن الإشعارات. اسمح بها من إعدادات الموقع في المتصفح (قفل العنوان ← الأذونات ← الإشعارات) ثم أعد المحاولة.', 'Permission refusée. Autorisez les notifications dans les réglages du site.')); return; }
      var reg = await activeReg(), sub = await reg.pushManager.getSubscription();
      if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(await loadVapidPublicKey()) });
      var args = { p_endpoint: sub.endpoint, p_p256dh: subKey(sub, 'p256dh'), p_auth: subKey(sub, 'auth'), p_device_id: notifDeviceId(), p_user_agent: navigator.userAgent.slice(0, 300), p_lang: state.lang };
      if (tenantOn()) args.p_promo = TENANT.id;
      var r = await dbc().rpc('save_push_subscription', args);
      if (r.error) throw r.error;
      notifState.on = true; try { if (typeof refreshNotifButton === 'function') refreshNotifButton(); } catch (e) {}
      say(typeof t === 'function' ? t('msg_notif_enabled') : T('تم تفعيل الإشعارات', 'Notifications activées'), 'ok');
    } catch (e) {
      fallback();
      helpModal(T('تعذر تسجيل إشعارات الهاتف على هذا الجهاز/المتصفح (' + ((e && e.name) || 'خطأ') + '). التنبيهات داخل الموقع مفعّلة. جرّب Chrome المحدَّث مع تفعيل خدمات Google.', 'Impossible d’activer les notifications du téléphone. Les alertes dans le site restent actives.'));
    } finally { notifState.busy = false; }
  }
  document.addEventListener('click', function (e) {
    var b = e.target.closest && e.target.closest('#nbEnable,#btnNotif'); if (!b) return;
    try { if (b.id === 'btnNotif' && typeof notifState !== 'undefined' && notifState.on) return; } catch (x) { return; }
    e.stopImmediatePropagation(); e.preventDefault(); robustEnable();
  }, true);
})();
