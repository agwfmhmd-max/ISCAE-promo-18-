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

/* ===== طبقة الترجمة: لا كلمات عربية داخل الواجهة الفرنسية ===== */
(function () {
  'use strict';
  var EXTRA = {
    'تم التحقق من رابط البريد الإلكتروني. أدخل كلمة المرور الجديدة؛ ستبقى جميع بيانات حسابك كما هي.': 'Le lien e-mail a été vérifié. Saisissez le nouveau mot de passe ; toutes les données de votre compte restent inchangées.',
    'تتطلب هذه العملية تفعيلًا مسبقًا من المشرف الرئيسي. أدخل رقم التسجيل والبريد الإلكتروني المسجل؛ إذا تطابقت البيانات فسيصلك رابط تحقق، وبعد فتحه ستضع كلمة مرور جديدة. لن تُحذف معلومات حسابك.': 'Cette opération nécessite une activation préalable par l’administrateur principal. Saisissez le numéro d’inscription et l’e-mail enregistré ; si les données correspondent, vous recevrez un lien de vérification, puis vous définirez un nouveau mot de passe. Aucune information de votre compte ne sera supprimée.',
    'متابعة التحقق وإنشاء الحساب': 'Vérifier et créer le compte', 'إنشاء الحساب': 'Créer mon compte', 'نسيت كلمة المرور؟': 'Mot de passe oublié ?',
    'أدخل رقم تسجيل صالحًا.': 'Saisissez un numéro d’inscription valide.', 'جارٍ التحقق…': 'Vérification…',
    'رقم التسجيل غير متاح لإنشاء الحساب. تحقق منه أو تواصل مع الإدارة.': 'Numéro d’inscription indisponible pour créer un compte. Vérifiez-le ou contactez l’administration.',
    'استعادة كلمة المرور': 'Réinitialiser le mot de passe',
    'تتطلب هذه العملية تفعيلًا مسبقًا من المشرف الرئيسي. أدخل رقم التسجيل والبريد الإلكتروني المسجل؛ إذا تطابقت البيانات فسيصلك رابط تحقق، وبعد فتحه ستضع كلمة مرور جديدة وتؤكدها. لن تُحذف معلومات حسابك.': 'Cette opération nécessite une activation préalable par l’administrateur principal. Saisissez le numéro d’inscription et l’e-mail enregistré ; si les données correspondent, vous recevrez un lien de vérification, puis vous définirez et confirmerez un nouveau mot de passe. Aucune information de votre compte ne sera supprimée.',
    'رقم التسجيل': 'Numéro d’inscription', 'البريد الإلكتروني المسجل': 'E-mail enregistré', 'إرسال رابط الاستعادة': 'Envoyer le lien de récupération',
    'أدخل رقم التسجيل والبريد الإلكتروني.': 'Saisissez le numéro d’inscription et l’e-mail.', 'تعذر إرسال الطلب مؤقتًا.': 'Impossible d’envoyer la demande pour le moment.',
    'إذا كانت البيانات صحيحة فسيصل رابط آمن إلى بريدك المسجل.': 'Si les données sont correctes, un lien sécurisé sera envoyé à votre e-mail enregistré.',
    'تعيين كلمة مرور جديدة': 'Définir un nouveau mot de passe',
    'تم التحقق من رابط البريد الإلكتروني. أدخل كلمة المرور الجديدة ثم أكدها؛ ستبقى جميع بيانات حسابك كما هي.': 'Le lien e-mail a été vérifié. Saisissez le nouveau mot de passe puis confirmez-le ; toutes les données de votre compte restent inchangées.',
    'كلمة المرور الجديدة': 'Nouveau mot de passe', 'تأكيد كلمة المرور': 'Confirmer le mot de passe', 'حفظ كلمة المرور': 'Enregistrer le mot de passe',
    'استخدم كلمة مرور من 8 أحرف على الأقل.': 'Utilisez un mot de passe d’au moins 8 caractères.', 'جارٍ الحفظ…': 'Enregistrement…',
    'تم تحديث كلمة المرور بنجاح دون حذف بيانات الحساب.': 'Mot de passe mis à jour sans suppression des données du compte.',
    'تعذر تحميل مكتبة قراءة QR. استخدم الإدخال اليدوي.': 'Impossible de charger le lecteur QR. Utilisez la saisie manuelle.',
    'مسح بطاقة الحفل الليلي': 'Scanner une carte de la soirée',
    'تعذر فتح الكاميرا. تحقق من إذن الكاميرا أو استخدم الإدخال اليدوي.': 'Impossible d’ouvrir la caméra. Vérifiez l’autorisation ou utilisez la saisie manuelle.',
    'تعذر تحميل الصور حالياً.': 'Impossible de charger les photos pour le moment.', 'جاري تحميل الصور…': 'Chargement des photos…',
    'رقم الهاتف الذي أُرسل منه الاشتراك': 'Numéro de téléphone depuis lequel l’abonnement a été envoyé',
    'لا توجد حسابات بنكية مفعّلة لاستقبال الدفع حالياً.': 'Aucun compte bancaire actif pour recevoir les paiements.',
    'تم قبول دفعة سابقة لهذا الحساب، ولا يمكن الدفع مرة أخرى.': 'Un paiement précédent a déjà été approuvé pour ce compte ; un nouveau paiement est impossible.',
    'لديك طلب دفع قيد المراجعة بالفعل.': 'Vous avez déjà une demande de paiement en cours d’examen.',
    'أدخل رقم الهاتف الذي أُرسل منه الاشتراك، واختر البنك وارفع إثبات الدفع.': 'Saisissez le numéro depuis lequel l’abonnement a été envoyé, choisissez la banque et téléversez la preuve de paiement.',
    'جارٍ إرسال الطلب…': 'Envoi de la demande…', 'اختر صورة أولًا.': 'Choisissez d’abord une photo.', 'ذكرى': 'Souvenir',
    'أكمل رقم التسجيل والهاتف واسمي الشهادة والوشاح قبل المتابعة.': 'Renseignez le numéro d’inscription, le téléphone et les noms du certificat et de l’écharpe avant de continuer.',
    'اختر تخصصك قبل المتابعة.': 'Choisissez votre spécialité avant de continuer.', 'رقم التسجيل غير موجود ضمن قائمة الدفعة.': 'Numéro d’inscription introuvable dans la liste de la promotion.',
    'بيانات التخصص المسجلة لا تطابق سجل الدفعة.': 'La spécialité enregistrée ne correspond pas au registre de la promotion.',
    'تعذر التحقق من رقم التسجيل. راجع الرقم مع الإدارة.': 'Impossible de vérifier le numéro d’inscription. Vérifiez-le avec l’administration.',
    'تحقق من رقم التسجيل قبل المتابعة.': 'Vérifiez le numéro d’inscription avant de continuer.', 'أدخل رقم التسجيل أولاً.': 'Saisissez d’abord le numéro d’inscription.',
    'فعّل المشرف الرئيسي استعادة هذا الحساب. أدخل البريد المسجل لطلب رابط التحقق ثم عيّن كلمة مرور جديدة.': 'L’administrateur principal a activé la récupération de ce compte. Saisissez l’e-mail enregistré pour demander un lien de vérification, puis définissez un nouveau mot de passe.',
    'طلبات الاشتراك المالية': 'Demandes d’adhésion financières', 'مسح بطاقات الحفل الليلي': 'Scanner les cartes de la soirée', 'استعادة كلمة مرور خريج': 'Récupération du mot de passe d’un diplômé',
    'اختر الدفعة وأدخل رقم التسجيل. لن تُحذف أي معلومات؛ سيتطلب الحساب البريد المسجل ورابط التحقق ثم كلمة مرور جديدة وتأكيدها. الأرقام المكررة لا تُفعّل حتى تُراجع يدويًا.': 'Choisissez la promotion et saisissez le numéro d’inscription. Aucune information ne sera supprimée ; le compte exigera l’e-mail enregistré et le lien de vérification, puis un nouveau mot de passe à confirmer. Les numéros en double ne sont pas activés avant vérification manuelle.',
    'السماح باستعادة كلمة المرور': 'Autoriser la récupération du mot de passe', 'جارٍ التفعيل…': 'Activation…', 'أدخل رقم التسجيل.': 'Saisissez le numéro d’inscription.',
    'يوجد أكثر من حساب بهذا الرقم؛ لم يتم تفعيل الاستعادة لحماية البيانات. يلزم مراجعة التكرار يدويًا.': 'Plusieurs comptes portent ce numéro ; la récupération n’a pas été activée pour protéger les données. Une vérification manuelle du doublon est nécessaire.',
    'لا يوجد حساب خريج بهذا الرقم في الدفعة المختارة.': 'Aucun compte de diplômé avec ce numéro dans la promotion choisie.',
    'فُعّلت الاستعادة لهذا الحساب. سيحتاج الخريج إلى بريده المسجل ورابط التحقق ثم كلمة مرور جديدة.': 'La récupération est activée pour ce compte. Le diplômé aura besoin de son e-mail enregistré et du lien de vérification, puis d’un nouveau mot de passe.',
    'تم تفعيل استعادة كلمة المرور دون حذف الحساب.': 'Récupération du mot de passe activée sans supprimer le compte.',
    'معلومات الحفل الليلي': 'Informations de la soirée', 'تظهر هذه المعلومات على جميع بطاقات Scan للحفل.': 'Ces informations apparaissent sur toutes les cartes Scan de la soirée.',
    'الحفل الليلي': 'Soirée', 'تاريخ الحفل': 'Date de la soirée', 'مكان الحفل (عربي)': 'Lieu de la soirée (arabe)', 'مكان الحفل (فرنسي)': 'Lieu de la soirée (français)',
    'حفظ معلومات الحفل': 'Enregistrer les informations de la soirée', 'تم حفظ معلومات الحفل الليلي وستظهر على البطاقات.': 'Informations de la soirée enregistrées ; elles apparaîtront sur les cartes.',
    'نوع البند': 'Type de ligne', 'إضافة البند': 'Ajouter la ligne', 'حفظ تعديل البنك': 'Enregistrer la modification de la banque', 'مفعّل': 'Activé',
    'تأكيد حذف / إيقاف هذا الحساب البنكي؟': 'Confirmer la suppression / désactivation de ce compte bancaire ?', 'تعذر فتح الإثبات.': 'Impossible d’ouvrir le justificatif.',
    'يجب حسم الطلب الأقدم أولاً.': 'Il faut d’abord traiter la demande la plus ancienne.', 'يجب التحقق من الطلب السابق أولاً.': 'Vérifiez d’abord la demande précédente.',
    'تم حفظ إعدادات الاشتراك وموعد الدفع.': 'Paramètres d’adhésion et date de paiement enregistrés.', 'لم يمنح المشرف الرئيسي صلاحية تحديد الموعد.': 'L’administrateur principal ne vous a pas délégué la définition de la date.',
    'أدخل اسم بنك ورقم حساب صحيحين؛ تتم معاينتهما قبل الحفظ.': 'Saisissez un nom de banque et un numéro de compte valides ; ils sont prévisualisés avant l’enregistrement.',
    'تم تحديث بيانات البنك.': 'Informations de la banque mises à jour.', 'تمت إضافة البنك.': 'Banque ajoutée.',
    'أوقف البنك مع حفظ مرجعه في سجل المدفوعات السابقة.': 'Banque désactivée ; sa référence est conservée dans l’historique des paiements.', 'تم حذف الحساب البنكي.': 'Compte bancaire supprimé.',
    'أدخل البريد الإلكتروني للحساب المسجل.': 'Saisissez l’e-mail du compte enregistré.', 'لم يُعثر على حساب بهذا البريد. اطلب من الشخص إنشاء حساب أولاً.': 'Aucun compte trouvé avec cet e-mail. Demandez à la personne de créer d’abord un compte.',
    'تم تعيين مسؤول المالية لهذه الدفعة.': 'Responsable financier désigné pour cette promotion.', 'تم تعيين مسؤول الحفل الليلي لهذه الدفعة.': 'Responsable de la soirée désigné pour cette promotion.',
    'تم تحديث صلاحية المسؤول.': 'Rôle du responsable mis à jour.', 'تأكيد حذف صلاحية هذا المسؤول من الدفعة؟': 'Confirmer le retrait de ce responsable de la promotion ?',
    'تم حذف صلاحية المسؤول عن هذه الدفعة.': 'Rôle du responsable retiré pour cette promotion.', 'مسؤول المالية': 'Responsable financier', 'مسؤول': 'Responsable', 'غير نشط': 'inactif', 'خريج': 'Diplômé',
    'أدخل عنوان التقرير بالعربية والفرنسية.': 'Saisissez le titre du rapport en arabe et en français.', 'تم إنشاء مسودة التقرير.': 'Brouillon du rapport créé.',
    'أدخل فئة ومبلغًا أكبر من صفر.': 'Saisissez une catégorie et un montant supérieur à zéro.', 'ارفع صورة PNG أو JPG أو WEBP لا يتجاوز حجمها 8 ميغابايت.': 'Téléversez une image PNG, JPG ou WEBP de 8 Mo maximum.',
    'تمت إضافة بند التقرير.': 'Ligne du rapport ajoutée.', 'أنشئ مسودة قبل النشر.': 'Créez un brouillon avant la publication.', 'تم نشر التقرير المالي لجميع الخريجين.': 'Rapport financier publié pour tous les diplômés.',
    'يمكن للرئيس أو مسؤول المالية إعداد المسودة وإضافة بنودها. النشر متاح لرئيس الدفعة فقط ويظهر للخريجين في مساحتهم.': 'Le président ou le responsable financier peut préparer le brouillon et ajouter ses lignes. La publication est réservée au président de la promotion et s’affiche dans l’espace des diplômés.',
    'لا يمكن الإرسال قبل ذلك الموعد.': 'aucun envoi n’est possible avant cette date.',
    'حالات الاشتراك': 'Statuts d’adhésion', 'دفعوا الاشتراك': 'Ont payé l’adhésion', 'في انتظار التحقق': 'En attente de vérification', 'لم يدفعوا': 'N’ont pas payé', 'حالة الاشتراك': 'Statut d’adhésion',
    'رفع قائمة الخريجين': 'Importer la liste des diplômés', 'تمكين استعادة كلمة المرور': 'Autoriser la récupération du mot de passe', 'تمكين الاستعادة': 'Autoriser la récupération', 'الدفعة المحددة:': 'Promotion sélectionnée :',
    'تعذر قراءة الملف.': 'Impossible de lire le fichier.', 'إضافة الطلاب يدويًا متاحة للمشرف الرئيسي فقط.': 'L’ajout manuel d’étudiants est réservé à l’administrateur principal.',
    'لا يوجد حساب خريج بهذا الرقم في الدفعة المحددة.': 'Aucun compte de diplômé avec ce numéro dans la promotion sélectionnée.', 'الصيغ المدعومة هي Excel أو CSV أو TSV أو PDF نصي.': 'Formats pris en charge : Excel, CSV, TSV ou PDF texte.',
    'يوجد رقم تسجيل مكرر في الملف. صحح التكرار ثم أعد الرفع.': 'Le fichier contient un numéro d’inscription en double. Corrigez puis réimportez.',
    'تم تمكين الاستعادة لهذا الحساب. سيحتاج الخريج إلى بريده المسجل ورابط التحقق.': 'Récupération activée pour ce compte. Le diplômé aura besoin de son e-mail enregistré et du lien de vérification.',
    'يمكنك تعديل الأسماء واسم شهادة التكريم واسم الوشاح فقط؛ رقم التسجيل للقراءة فقط.': 'Vous pouvez modifier uniquement les noms, le nom du certificat et le nom de l’écharpe ; le numéro d’inscription est en lecture seule.',
    'يوجد أكثر من حساب بهذا الرقم؛ لم يتم اختيار حساب عشوائي. راجع التعارض قبل تمكين الاستعادة.': 'Plusieurs comptes portent ce numéro ; aucun n’a été choisi au hasard. Résolvez le conflit avant d’activer la récupération.',
    'لن تتغير بيانات الخريج؛ سيُرسل رابط استعادة آمن إلى بريده المسجل بعد إدخال رقم التسجيل والبريد المطابق.': 'Les données du diplômé ne changent pas ; un lien de récupération sécurisé sera envoyé à son e-mail enregistré après saisie du numéro d’inscription et de l’e-mail correspondant.',
    'لم تُعثر على صفوف خريجين صالحة. استخدم الأعمدة: رقم التسجيل، الاسم العربي، الاسم الفرنسي، التخصص العربي، التخصص الفرنسي.': 'Aucune ligne de diplômé valide trouvée. Utilisez les colonnes : numéro d’inscription, nom arabe, nom français, spécialité arabe, spécialité française.',
    'أعمدة الملف المطلوبة: رقم التسجيل، الاسم العربي، الاسم الفرنسي، التخصص العربي، التخصص الفرنسي. يمكن أن تسبقها أسطر عنوان أو بيانات تعريفية.': 'Colonnes requises : numéro d’inscription, nom arabe, nom français, spécialité arabe, spécialité française. Des lignes de titre ou d’en-tête peuvent les précéder.',
    'انتهت جلسة المشرف. يرجى تسجيل الدخول من جديد قبل الحفظ.': 'Session administrateur expirée. Reconnectez-vous avant d’enregistrer.',
    'انتهت مهلة الحفظ؛ تحقق من الاتصال والصلاحية ثم أعد المحاولة.': 'Délai d’enregistrement dépassé ; vérifiez la connexion et les droits puis réessayez.',
    'انتهت مهلة توزيع البطاقات؛ تحقق من الاتصال والصلاحية ثم أعد المحاولة.': 'Délai de répartition des cartes dépassé ; vérifiez la connexion et les droits puis réessayez.',
    'تعذر حفظ الحفل.': 'Impossible d’enregistrer l’événement.', 'تعذر توزيع البطاقات.': 'Impossible de répartir les cartes.', 'تعذر تحديد ملف المؤسسة.': 'Impossible de déterminer le fichier de l’établissement.',
    'تعذر تحديد الجامعة والدفعة.': 'Impossible de déterminer l’université et la promotion.', 'تعذر التحقق من نطاق الدفعة.': 'Impossible de vérifier le périmètre de la promotion.',
    'تعذر التحقق من الجامعة والدفعة.': 'Impossible de vérifier l’université et la promotion.', 'لون مخصص': 'Couleur personnalisée',
    'تعذّر فتح الإعدادات. أعد تحميل الصفحة وحاول مرة أخرى.': 'Impossible d’ouvrir les paramètres. Rechargez la page et réessayez.',
    'ثبّت التطبيق': 'Installer l’application', 'تثبيت الآن': 'Installer maintenant', 'لاحقاً': 'Plus tard',
    'بطاقات الحفل الليلي': 'Cartes de la soirée', 'إدارة سجلات الإرسال والاشتراك': 'Gestion des enregistrements d’envoi et d’abonnement'
  };
  var PATTERNS = [
    [/^\s*(\d+) من (\d+)\s*$/, '$1 sur $2'],
    [/^\s*(\d+) خريج\s*$/, '$1 diplômé(s)'],
    [/سيتم استيراد\/تحديث (\d+) سجلًا في الدفعة الحالية، وسيصبح رقم التسجيل وسجل الطالب أساس التحقق\. متابعة؟/, 'Importer/mettre à jour $1 enregistrement(s) dans la promotion actuelle ? Le numéro d’inscription et la fiche étudiant serviront de base de vérification.'],
    [/تم استيراد (\d+) خريجًا \((\d+) جديد، (\d+) تحديث\)/, '$1 diplômé(s) importé(s) ($2 nouveau(x), $3 mis à jour)'],
    [/تم حذف (\d+)/, 'Supprimé : $1']
  ];
  var AR = /[\u0600-\u06FF]/, EXACT = null, LONG = null, orig = new Map(), busy = false, timer = 0;
  function build() {
    EXACT = new Map(); var long = [];
    function add(a, b) { if (!a || !b || a === b || /[{]/.test(a)) return; a = String(a).trim(); if (!AR.test(a)) return; if (!EXACT.has(a)) EXACT.set(a, b); if (a.length >= 14) long.push([a, b]); }
    try { for (var k in I18N) { var v = I18N[k]; if (v && v.ar && v.fr) add(v.ar, v.fr); } } catch (e) {}
    for (var key in EXTRA) add(key, EXTRA[key]);
    long.sort(function (x, y) { return y[0].length - x[0].length; }); LONG = long;
  }
  function tr(text) {
    if (!AR.test(text)) return text;
    if (!EXACT) build();
    var t = String(text).trim(); if (!t) return text;
    if (EXACT.has(t)) return String(text).replace(t, EXACT.get(t));
    var out = String(text), i;
    for (i = 0; i < PATTERNS.length; i++) out = out.replace(PATTERNS[i][0], PATTERNS[i][1]);
    for (i = 0; i < LONG.length; i++) if (out.indexOf(LONG[i][0]) >= 0) out = out.split(LONG[i][0]).join(LONG[i][1]);
    return out;
  }
  var isFrLang = function () { return String(document.documentElement.lang || '').toLowerCase().indexOf('fr') === 0; };
  var SKIP = { SCRIPT: 1, STYLE: 1, TEXTAREA: 1, INPUT: 1, NOSCRIPT: 1 };
  function walk(root) {
    if (!root) return;
    var w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, { acceptNode: function (n) { var p = n.parentNode; return (p && !SKIP[p.nodeName] && AR.test(n.nodeValue)) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT; } });
    var nodes = [], n; while ((n = w.nextNode())) nodes.push(n);
    nodes.forEach(function (node) { var v = tr(node.nodeValue); if (v !== node.nodeValue) { orig.set(node, [node.nodeValue, v]); node.nodeValue = v; } });
    if (root.querySelectorAll) root.querySelectorAll('[placeholder],[title],[aria-label]').forEach(function (el) { ['placeholder', 'title', 'aria-label'].forEach(function (a) { var cur = el.getAttribute(a); if (cur && AR.test(cur)) { var v = tr(cur); if (v !== cur) el.setAttribute(a, v); } }); });
  }
  function revert() { orig.forEach(function (pair, node) { if (node.isConnected && node.nodeValue === pair[1]) node.nodeValue = pair[0]; }); orig.clear(); }
  function pass() { if (busy) return; busy = true; try { if (isFrLang()) walk(document.body); else if (orig.size) revert(); } finally { busy = false; } }
  function schedule() { clearTimeout(timer); timer = setTimeout(pass, 60); }
  function start() {
    if (!document.body) return setTimeout(start, 50);
    pass();
    new MutationObserver(function (muts) { if (busy) return; schedule(); }).observe(document.body, { childList: true, subtree: true, characterData: true });
    new MutationObserver(schedule).observe(document.documentElement, { attributes: true, attributeFilter: ['lang'] });
  }
  window.PromoMRTr = tr;
  start();
  ['confirm', 'prompt', 'alert'].forEach(function (name) { var f = window[name]; if (typeof f !== 'function') return; window[name] = function (m) { var a = [].slice.call(arguments); if (isFrLang() && typeof a[0] === 'string') a[0] = tr(a[0]); return f.apply(window, a); }; });

  /* ===== مزامنة اشتراك Push: تجديد/حفظ الاشتراك تلقائياً إن كان الإذن ممنوحاً ===== */
  var synced = false;
  async function syncPush() {
    try {
      if (synced) return; synced = true;
      if (!('serviceWorker' in navigator) || !('PushManager' in window) || Notification.permission !== 'granted') return;
      if (typeof tenantOn !== 'function' || !tenantOn()) return;
      var regs = await navigator.serviceWorker.getRegistrations();
      var reg = regs.filter(function (r) { return /\/site\//.test(r.scope); })[0] || regs[0]; if (!reg || !reg.active) return;
      var sub = await reg.pushManager.getSubscription();
      if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(await loadVapidPublicKey()) });
      var r = await db.rpc('save_push_subscription', { p_endpoint: sub.endpoint, p_p256dh: subKey(sub, 'p256dh'), p_auth: subKey(sub, 'auth'), p_device_id: notifDeviceId(), p_user_agent: navigator.userAgent.slice(0, 300), p_lang: state.lang, p_promo: TENANT.id });
      if (r.error) console.warn('[Push] sync failed', r.error.message);
    } catch (e) { console.warn('[Push] sync error', e); }
  }
  var tries = 0, iv = setInterval(function () { tries++; var b = window.PromoMRFeatureBridge; if (b && b.tenant && b.tenant.id) { clearInterval(iv); setTimeout(syncPush, 1500); } else if (tries > 80) clearInterval(iv); }, 500);
  if ('serviceWorker' in navigator) navigator.serviceWorker.addEventListener('message', function (e) { if (e.data && e.data.type === 'pm-push-resubscribed') { synced = false; syncPush(); } });
})();
