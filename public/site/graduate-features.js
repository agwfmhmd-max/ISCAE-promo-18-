(() => {
  'use strict';
  const wait = (fn, tries = 80) => {
    const bridge = window.PromoMRFeatureBridge;
    if (bridge?.db && bridge?.tenant?.id) return fn(bridge);
    if (tries > 0) return setTimeout(() => wait(fn, tries - 1), 250);
    console.warn('[PROMO MR] graduate features unavailable: tenant not resolved');
  };
  const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
  const uuid = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`);
  const css = `
    .graduate-entry{margin-inline-start:8px!important;border:1px solid rgba(197,162,83,.48)!important;color:var(--ink,#102744)!important;background:var(--surface-solid,#fffdf8)!important;text-decoration:none!important;white-space:nowrap}
    .graduate-entry:hover{border-color:var(--accent,#c5a253)!important;box-shadow:0 8px 20px -12px var(--ink,#102744)!important;transform:translateY(-1px)}
    .graduate-modal{width:min(920px,calc(100vw - 24px))!important;max-width:920px!important;max-height:min(92dvh,900px)!important;overflow:hidden!important;border:1px solid color-mix(in srgb,var(--accent,#c5a253) 28%,var(--stroke))!important;border-radius:24px!important;box-shadow:0 30px 90px -34px rgba(10,25,45,.58)!important}
    .graduate-modal .modal-head{position:relative;padding:22px 24px!important;color:#fff!important;background:linear-gradient(120deg,var(--ink,#102744),var(--ink-2,#1d456d))!important;border-bottom:2px solid var(--accent,#c5a253)!important}
    .graduate-modal .modal-head h3{margin:0!important;font-size:clamp(20px,4vw,27px)!important;font-weight:900!important;line-height:1.45!important}
    .graduate-modal .modal-head .icon-btn{flex:none!important;width:42px!important;height:42px!important;border:1px solid rgba(255,255,255,.24)!important;border-radius:14px!important;background:rgba(255,255,255,.12)!important;color:#fff!important}
    .graduate-modal .modal-body{max-height:calc(min(92dvh,900px) - 86px)!important;overflow:auto!important;padding:clamp(16px,4vw,28px)!important;background:var(--bg,#f7f5ef)!important}
    .graduate-intro{display:flex;align-items:center;gap:14px;margin:0 0 18px;padding:16px 18px;border:1px solid var(--stroke);border-radius:18px;background:linear-gradient(120deg,var(--surface-solid),var(--violet-50));color:var(--text)}
    .graduate-intro-mark{display:grid;place-items:center;width:46px;height:46px;flex:none;border-radius:15px;background:var(--grad-primary);color:#fff;font-size:21px;font-weight:900;box-shadow:0 10px 24px -14px var(--primary)}
    .graduate-intro strong{display:block;font-size:15px}.graduate-intro p{margin:3px 0 0;color:var(--muted);font-size:13px;line-height:1.7}
    .graduate-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,250px),1fr));gap:16px;align-items:stretch}
    .graduate-card{min-width:0;border:1px solid var(--stroke);border-radius:20px;padding:clamp(16px,3vw,22px);background:var(--surface-solid);box-shadow:0 10px 30px -26px rgba(16,39,68,.4)}
    .graduate-card h4{display:flex;align-items:center;gap:9px;margin:0 0 14px;color:var(--text);font-size:17px;font-weight:900;line-height:1.5}
    .graduate-card p{line-height:1.8;overflow-wrap:anywhere}.graduate-card .input,.graduate-modal .input{min-width:0;width:100%;min-height:46px;margin-top:6px;border-radius:12px}
    .graduate-card label,.graduate-modal label{display:block;margin:10px 0;color:var(--text);font-size:14px;font-weight:750;line-height:1.8}
    .graduate-muted{color:var(--muted);font-size:13px;line-height:1.75}.graduate-actions{display:flex;flex-wrap:wrap;gap:9px;margin-top:14px}.graduate-actions .btn{min-height:42px;border-radius:12px}
    .graduate-status{border-radius:999px;padding:5px 11px;font-size:12px;font-weight:800;display:inline-flex;align-items:center;gap:5px}.graduate-status.pending{background:#fff3ce;color:#805600}.graduate-status.active,.graduate-status.approved{background:#ddf5e8;color:#166534}.graduate-status.rejected{background:#fee2e2;color:#991b1b}
    .graduate-photo-list{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:8px}.graduate-photo-list img{width:100%;aspect-ratio:1;object-fit:cover;border-radius:13px;border:1px solid var(--stroke)}
    .graduate-file{width:100%;padding:12px;border:1px dashed var(--stroke);border-radius:12px;background:var(--bg)}
    .graduate-qr-reader{width:100%;max-width:420px;margin:12px auto;border-radius:16px;overflow:hidden;background:#111}.graduate-qr-reader video{width:100%!important}.graduate-qr-help{text-align:center;font-size:12px;color:var(--muted)}
    .graduate-admin-stack{display:grid;gap:16px}.graduate-admin-hero{margin-bottom:16px;padding:22px;border-radius:20px;color:#fff;background:radial-gradient(120% 130% at 0 0,rgba(197,162,83,.35),transparent 58%),linear-gradient(120deg,var(--ink,#102744),var(--ink-2,#1d456d));box-shadow:0 18px 40px -28px rgba(16,39,68,.7)}
    .graduate-admin-hero h4{margin:0 0 7px;font-size:20px;font-weight:900}.graduate-admin-hero p{margin:0;color:rgba(255,255,255,.8);font-size:13px;line-height:1.8}
    .graduate-finance-summary{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:10px}.graduate-finance-stat{padding:14px;border-radius:15px;background:var(--bg);border:1px solid var(--stroke)}.graduate-finance-stat span{display:block;color:var(--muted);font-size:12px}.graduate-finance-stat b{display:block;margin-top:6px;color:var(--text);font-size:20px}
    .graduate-staff-note{padding:12px 14px;border-radius:13px;background:var(--violet-50);color:var(--text);font-size:13px;line-height:1.8}.graduate-request{margin-top:10px;border-color:var(--stroke)!important;background:var(--bg)!important}
    @media(max-width:560px){.graduate-modal{width:calc(100vw - 14px)!important;max-height:94dvh!important;border-radius:18px!important}.graduate-modal .modal-head{padding:16px!important}.graduate-modal .modal-body{max-height:calc(94dvh - 72px)!important;padding:14px!important}.graduate-intro{align-items:flex-start;padding:13px}.graduate-photo-list{grid-template-columns:repeat(3,minmax(0,1fr))}.graduate-actions .btn{flex:1 1 auto}.graduate-admin-hero{padding:18px}}
    @media(prefers-reduced-motion:reduce){.graduate-entry,.graduate-entry:hover{transition:none!important;transform:none!important}}
  `;
  const addStyle = () => { if (!document.getElementById('graduate-features-style')) { const s=document.createElement('style'); s.id='graduate-features-style'; s.textContent=css; document.head.appendChild(s); } };

  function notify(bridge, message, type = 'info') { bridge.toast?.(message, type); }
  function modal(bridge, content) {
    const root = bridge.openModal(`<div class="modal graduate-modal">${content}</div>`);
    root.querySelectorAll('[data-close]').forEach((x) => x.addEventListener('click', () => { root.remove(); clearGraduateRoute(); }));
    return root;
  }
  function graduateUrl() { const url = new URL(window.location.href); url.searchParams.set('graduate', '1'); return url; }
  function clearGraduateRoute() { const url = new URL(window.location.href); if (url.searchParams.has('graduate')) { url.searchParams.delete('graduate'); history.replaceState(history.state, '', url); } }
  async function session(bridge) { const { data } = await bridge.db.auth.getSession(); return data?.session || null; }
  async function account(bridge, userId) {
    const { data, error } = await bridge.db.from('graduate_accounts').select('*').eq('user_id', userId).maybeSingle();
    if (error) throw error; return data;
  }
  async function signInOrUp(bridge, root) {
    const email = root.querySelector('#graduateEmail').value.trim();
    const password = root.querySelector('#graduatePassword').value;
    if (!email || password.length < 6) return notify(bridge, 'أدخل بريدًا صحيحًا وكلمة مرور من 6 أحرف على الأقل.', 'err');
    const mode = root.querySelector('[name="graduateMode"]:checked')?.value || 'signin';
    let result = mode === 'signup'
      ? await bridge.db.auth.signUp({ email, password, options: { data: { full_name: root.querySelector('#graduateName').value.trim() } } })
      : await bridge.db.auth.signInWithPassword({ email, password });
    if (result.error) return notify(bridge, result.error.message, 'err');
    if (mode === 'signup' && !result.data?.session) return notify(bridge, 'تم إنشاء الحساب. تحقق من بريدك ثم افتح مساحة الخريج.', 'info');
    root.remove(); openGraduateSpace(bridge);
  }
  function authModal(bridge) {
    const root = modal(bridge, `<div class="modal-head"><h3>مساحة الخريج</h3><button class="icon-btn" data-close>×</button></div>
      <div class="modal-body"><p class="graduate-muted">أنشئ حسابًا مرتبطًا بهذه الدفعة أو سجّل الدخول لمتابعة اشتراكك وذكرياتك وبطاقاتك.</p>
      <label class="graduate-mode"><input type="radio" name="graduateMode" value="signin" checked> دخول</label>
      <label class="graduate-mode"><input type="radio" name="graduateMode" value="signup"> إنشاء حساب</label>
      <div id="graduateNameWrap" hidden><label>الاسم الكامل<input id="graduateName" class="input" autocomplete="name"></label></div>
      <label>البريد الإلكتروني<input id="graduateEmail" class="input" type="email" autocomplete="email"></label>
      <label>كلمة المرور<input id="graduatePassword" class="input" type="password" autocomplete="current-password"></label>
      <div class="graduate-actions"><button class="btn btn-primary" id="graduateAuthSubmit">متابعة</button><button class="btn btn-ghost" data-close>إلغاء</button></div></div>`);
    const toggle = () => { root.querySelector('#graduateNameWrap').hidden = root.querySelector('[name="graduateMode"]:checked').value !== 'signup'; };
    root.querySelectorAll('[name="graduateMode"]').forEach((x) => x.addEventListener('change', toggle));
    root.querySelector('#graduateAuthSubmit').addEventListener('click', () => signInOrUp(bridge, root));
  }
  async function upload(bridge, file, path) {
    const { error } = await bridge.db.storage.from('graduate-private').upload(path, file, { upsert: false, contentType: file.type || 'application/octet-stream' });
    if (error) throw error; return path;
  }
  async function loadMemories(bridge, acc) {
    const { data, error } = await bridge.db.from('graduate_memories').select('*').eq('account_id', acc.id).order('created_at', { ascending: false });
    if (error) throw error;
    return Promise.all((data || []).map(async (item) => { const signed = await bridge.db.storage.from('graduate-private').createSignedUrl(item.storage_path, 900); return { ...item, url: signed.data?.signedUrl || '' }; }));
  }
  async function qrScannerModal(bridge, onToken) {
    if (!window.Html5Qrcode) return notify(bridge, 'تعذر تحميل مكتبة قراءة QR. استخدم الإدخال اليدوي.', 'err');
    const root = modal(bridge, `<div class="modal-head"><h3>مسح بطاقة الحفل الليلي</h3><button class="icon-btn" data-close>×</button></div><div class="modal-body"><div id="graduateQrReader" class="graduate-qr-reader"></div><p class="graduate-qr-help">اسمح للمتصفح باستخدام الكاميرا ووجّهها إلى QR البطاقة.</p><div class="graduate-actions"><button id="graduateQrStop" class="btn btn-ghost">إيقاف الكاميرا</button></div></div>`);
    const reader = new Html5Qrcode('graduateQrReader');
    let stopped = false;
    const stop = async () => { if (stopped) return; stopped = true; try { await reader.stop(); } catch (_) {} try { reader.clear(); } catch (_) {} };
    root.querySelector('#graduateQrStop').addEventListener('click', async () => { await stop(); root.remove(); });
    root.querySelector('[data-close]').addEventListener('click', stop);
    try {
      await reader.start({ facingMode: { exact: 'environment' } }, { fps: 10, qrbox: { width: 240, height: 240 } }, async (decoded) => { await stop(); onToken(decoded); root.remove(); }, () => {});
    } catch (e) {
      try { await reader.start({ facingMode: 'environment' }, { fps: 10, qrbox: { width: 240, height: 240 } }, async (decoded) => { await stop(); onToken(decoded); root.remove(); }, () => {}); }
      catch (err) { await stop(); notify(bridge, 'تعذر فتح الكاميرا. تحقق من إذن الكاميرا أو استخدم الإدخال اليدوي.', 'err'); }
    }
  }
  async function renderSpace(bridge, root, acc) {
    const promotionId = bridge.tenant.id;
    const [{ data: settings }, { data: banks }, memories] = await Promise.all([
      bridge.db.from('subscription_settings').select('*').eq('promotion_id', promotionId).maybeSingle(),
      bridge.db.from('payment_banks').select('*').eq('promotion_id', promotionId).eq('is_active', true).order('bank_name'),
      loadMemories(bridge, acc)
    ]);
    const { data: requests } = await bridge.db.from('subscription_requests').select('id,status,amount,rejection_reason,created_at,reviewed_at').eq('account_id', acc.id).order('created_at', { ascending: false }).limit(10);
    const latest = requests?.[0];
    root.querySelector('.graduate-content').innerHTML = `<div class="graduate-intro"><span class="graduate-intro-mark" aria-hidden="true">✦</span><div><strong>مساحتك، وذكريات دفعتك</strong><p>تابع عضويتك وطلبات الاشتراك وشارك أجمل لحظات التخرج.</p></div></div><div class="graduate-grid">
      <section class="graduate-card"><h4>عضويتي</h4><p>حالة العضوية: <span class="graduate-status ${esc(acc.membership_status)}">${esc(acc.membership_status === 'active' ? 'مفعّلة' : acc.membership_status === 'suspended' ? 'موقوفة' : 'قيد المراجعة')}</span></p><p class="graduate-muted">${esc(acc.full_name)} · ${esc(acc.registration_number)}</p></section>
      <section class="graduate-card"><h4>الاشتراك المالي</h4><p class="graduate-muted">المبلغ المحدد: <b>${esc(settings?.amount ?? 0)} ${esc(settings?.currency || 'MRU')}</b></p>${latest ? `<p>آخر طلب: <span class="graduate-status ${esc(latest.status)}">${esc(latest.status === 'approved' ? 'مقبول' : latest.status === 'rejected' ? 'مرفوض' : 'قيد المراجعة')}</span></p>${latest.rejection_reason ? `<p class="graduate-muted">سبب الرفض: ${esc(latest.rejection_reason)}</p>` : ''}` : '<p class="graduate-muted">لم ترسل طلب اشتراك بعد.</p>'}<div class="graduate-actions"><button class="btn btn-primary btn-sm" id="graduatePayBtn">إرسال إثبات الدفع</button></div></section>
      <section class="graduate-card"><h4>ألبوم ذكرياتي <span class="graduate-muted">${memories.length} من 5</span></h4>${memories.length ? `<div class="graduate-photo-list">${memories.map((m) => m.url ? `<img src="${esc(m.url)}" alt="${esc(m.caption || 'ذكرى')}" title="${esc(m.caption || '')}">` : '').join('')}</div>` : '<p class="graduate-muted">لم تضف صوراً بعد. احفظ لحظاتك المميزة مع دفعتك.</p>'}<div class="graduate-actions"><button class="btn btn-ghost btn-sm" id="graduateMemoryBtn">إضافة صورة للذكرى</button></div></section>
    </div>`;
    root.querySelector('#graduatePayBtn')?.addEventListener('click', () => paymentModal(bridge, acc, settings, banks || [], root));
    root.querySelector('#graduateMemoryBtn')?.addEventListener('click', () => memoryModal(bridge, acc, memories.length, root));
  }
  function paymentModal(bridge, acc, settings, banks, parent) {
    const root = modal(bridge, `<div class="modal-head"><h3>إرسال إثبات الدفع</h3><button class="icon-btn" data-close>×</button></div><div class="modal-body"><p class="graduate-muted">المبلغ المطلوب: <b>${esc(settings?.amount || 0)} ${esc(settings?.currency || 'MRU')}</b></p><label>البنك<select id="graduateBank" class="input">${banks.map((b) => `<option value="${esc(b.id)}">${esc(b.bank_name)} — ${esc(b.account_number)}</option>`).join('')}</select></label><label>المبلغ المدفوع<input id="graduateAmount" class="input" type="number" min="1" step="0.01" value="${esc(settings?.amount || '')}"></label><label>صورة إثبات الدفع<input id="graduateProof" class="graduate-file" type="file" accept="image/*,application/pdf"></label><div class="graduate-actions"><button id="graduatePaySubmit" class="btn btn-primary">إرسال الطلب</button><button class="btn btn-ghost" data-close>إلغاء</button></div></div>`);
    root.querySelector('#graduatePaySubmit').addEventListener('click', async () => {
      const file = root.querySelector('#graduateProof').files[0]; const amount = Number(root.querySelector('#graduateAmount').value);
      if (!file || !amount || !root.querySelector('#graduateBank').value) return notify(bridge, 'اختر البنك والمبلغ وارفع إثبات الدفع.', 'err');
      try { const path = `proofs/${bridge.tenant.id}/${acc.user_id}/${uuid()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`; await upload(bridge, file, path); const { error } = await bridge.db.from('subscription_requests').insert({ promotion_id: bridge.tenant.id, account_id: acc.id, bank_id: root.querySelector('#graduateBank').value, amount, proof_path: path }); if (error) throw error; root.remove(); notify(bridge, 'تم إرسال طلب الاشتراك إلى مسؤول المالية.', 'success'); await renderSpace(bridge, parent, acc); } catch (e) { notify(bridge, e.message, 'err'); }
    });
  }
  function memoryModal(bridge, acc, count, parent) {
    const root = modal(bridge, `<div class="modal-head"><h3>إضافة ذكرى</h3><button class="icon-btn" data-close>×</button></div><div class="modal-body"><p class="graduate-muted">يمكنك رفع ${Math.max(0, 5-count)} صورة إضافية.</p><label>الصورة<input id="graduateMemoryFile" class="graduate-file" type="file" accept="image/*"></label><label>الوصف<input id="graduateMemoryCaption" class="input" maxlength="180"></label><label>الخصوصية<select id="graduateMemoryVisibility" class="input"><option value="members">المشتركون</option><option value="private">خاصة</option><option value="public">العامة</option></select></label><div class="graduate-actions"><button id="graduateMemorySubmit" class="btn btn-primary">حفظ</button><button class="btn btn-ghost" data-close>إلغاء</button></div></div>`);
    root.querySelector('#graduateMemorySubmit').addEventListener('click', async () => { const file=root.querySelector('#graduateMemoryFile').files[0]; if (!file) return notify(bridge,'اختر صورة أولًا.','err'); try { const path=`memories/${bridge.tenant.id}/${acc.user_id}/${uuid()}-${file.name.replace(/[^a-zA-Z0-9._-]/g,'_')}`; await upload(bridge,file,path); const {error}=await bridge.db.from('graduate_memories').insert({promotion_id:bridge.tenant.id,account_id:acc.id,storage_path:path,caption:root.querySelector('#graduateMemoryCaption').value.trim(),visibility:root.querySelector('#graduateMemoryVisibility').value}); if(error) throw error; root.remove(); notify(bridge,'تم حفظ الذكرى.','success'); await renderSpace(bridge,parent,acc); } catch(e){ notify(bridge,e.message,'err'); } });
  }
  async function openGraduateSpace(bridge) {
    const s = await session(bridge); if (!s) return authModal(bridge);
    let acc; try { acc = await account(bridge, s.user.id); } catch (e) { return notify(bridge, e.message, 'err'); }
    if (!acc) {
      const root = modal(bridge, `<div class="modal-head"><h3>ربط حساب الخريج</h3><button class="icon-btn" data-close>×</button></div><div class="modal-body"><p class="graduate-muted">أدخل الاسم ورقم التسجيل لربط الحساب بهذه الدفعة.</p><label>الاسم الكامل<input id="graduateLinkName" class="input"></label><label>رقم التسجيل الجامعي<input id="graduateLinkReg" class="input" dir="ltr"></label><label>الهاتف<input id="graduateLinkPhone" class="input" dir="ltr"></label><div class="graduate-actions"><button id="graduateLinkSubmit" class="btn btn-primary">حفظ</button></div></div>`);
      root.querySelector('#graduateLinkSubmit').addEventListener('click', async () => { const { data, error } = await bridge.db.rpc('register_graduate', { _promotion_id: bridge.tenant.id, _full_name: root.querySelector('#graduateLinkName').value.trim(), _registration_number: root.querySelector('#graduateLinkReg').value.trim(), _phone: root.querySelector('#graduateLinkPhone').value.trim() }); if (error) return notify(bridge,error.message,'err'); root.remove(); openGraduateSpace(bridge); }); return;
    }
    const root = modal(bridge, `<div class="modal-head"><h3>مساحة الخريج</h3><button class="icon-btn" aria-label="إغلاق" data-close>×</button></div><div class="modal-body graduate-content"><p class="graduate-muted">جاري التحميل...</p></div>`);
    try { await renderSpace(bridge, root, acc); } catch (e) { root.querySelector('.graduate-content').innerHTML = `<p class="graduate-muted">تعذر تحميل المساحة: ${esc(e.message)}</p>`; }
  }
  async function openGraduateAdmin(bridge) {
    const s = await session(bridge);
    if (!s) return notify(bridge, 'يجب تسجيل الدخول بحساب مسؤول الدفعة.', 'err');
    const isHead = bridge.canManageGraduates?.() === true;
    let financePermission = false, nightPermission = false;
    if (!isHead) {
      const [finance, night] = await Promise.all([
        bridge.db.rpc('mp_feature_admin', { _promotion_id: bridge.tenant.id, _roles: ['finance'] }),
        bridge.db.rpc('mp_feature_admin', { _promotion_id: bridge.tenant.id, _roles: ['night_event'] })
      ]);
      financePermission = finance.data === true;
      nightPermission = night.data === true;
      if (!financePermission && !nightPermission) return notify(bridge, 'لا تملك صلاحية إدارة هذه الدفعة.', 'err');
    }
    const canManageFinance = isHead || financePermission;
    const canManageNight = isHead || nightPermission;
    const root = modal(bridge, `<div class="modal-head"><h3>إدارة العضوية والفعاليات</h3><button class="icon-btn" aria-label="إغلاق" data-close>×</button></div><div class="modal-body graduate-content"><p class="graduate-muted">جاري التحميل...</p></div>`);
    const promotionId = bridge.tenant.id;
    const [requestsResult, totalsResult, settingsResult, banksResult] = canManageFinance ? await Promise.all([
      bridge.db.from('subscription_requests').select('id,account_id,amount,status,proof_path,rejection_reason,created_at').eq('promotion_id', promotionId).order('created_at', { ascending: false }).limit(50),
      bridge.db.from('promotion_financial_totals').select('*').eq('promotion_id', promotionId).maybeSingle(),
      bridge.db.from('subscription_settings').select('*').eq('promotion_id', promotionId).maybeSingle(),
      bridge.db.from('payment_banks').select('*').eq('promotion_id', promotionId).eq('is_active', true).order('bank_name')
    ]) : [{ data: [] }, { data: null }, { data: null }, { data: [] }];
    const requests = requestsResult.data, totals = totalsResult.data, settings = settingsResult.data, banks = banksResult.data;
    const canAssignStaff = bridge.canAssignGraduateStaff?.() === true;
    root.querySelector('.graduate-content').innerHTML = `<div class="graduate-admin-hero"><h4>إدارة اشتراكات وفعاليات الدفعة</h4><p>إعدادات الاشتراك، مراجعة الإثباتات، ومتابعة الإيرادات من مكان واحد. بيانات هذه الشاشة خاصة بالدفعة الحالية.</p></div><div class="graduate-admin-stack">${canManageFinance ? `<section class="graduate-card"><h4>إعداد الاشتراك والبنوك</h4><div class="graduate-grid"><label>المبلغ<input id="graduateSettingsAmount" class="input" type="number" min="0" step="0.01" value="${esc(settings?.amount ?? 0)}"></label><label>العملة<input id="graduateSettingsCurrency" class="input" maxlength="8" value="${esc(settings?.currency || 'MRU')}"></label></div><div class="graduate-actions"><button id="graduateSettingsSave" class="btn btn-primary btn-sm">حفظ مبلغ الاشتراك</button></div><hr><div class="graduate-grid"><label>اسم البنك<input id="graduateBankName" class="input"></label><label>رقم الحساب<input id="graduateBankAccount" class="input" dir="ltr"></label></div><div class="graduate-actions"><button id="graduateBankAdd" class="btn btn-ghost btn-sm">إضافة بنك</button></div><p class="graduate-muted">${(banks || []).map((b) => `${esc(b.bank_name)} — ${esc(b.account_number)}`).join(' · ') || 'لا توجد بنوك مضافة بعد.'}</p></section><section class="graduate-card"><h4>الملخص المالي</h4><div class="graduate-finance-summary"><div class="graduate-finance-stat"><span>الاشتراكات المقبولة</span><b>${esc(totals?.confirmed_subscriptions ?? 0)}</b></div><div class="graduate-finance-stat"><span>عدد الدافعين</span><b>${esc(totals?.confirmed_payers ?? 0)}</b></div><div class="graduate-finance-stat"><span>المداخيل الأخرى</span><b>${esc(totals?.other_income ?? 0)}</b></div><div class="graduate-finance-stat"><span>المصاريف</span><b>${esc(totals?.expenses ?? 0)}</b></div></div></section><section class="graduate-card"><h4>طلبات الاشتراك</h4><div id="graduateRequests">${(requests || []).map((r) => `<div class="graduate-card graduate-request" data-request="${esc(r.id)}"><p><b>${esc(r.amount)}</b> · <span class="graduate-status ${esc(r.status)}">${esc(r.status === 'approved' ? 'مقبول' : r.status === 'rejected' ? 'مرفوض' : 'قيد المراجعة')}</span></p><p class="graduate-muted">${esc(new Date(r.created_at).toLocaleString())}</p><div class="graduate-actions">${r.proof_path ? `<button class="btn btn-ghost btn-sm" data-proof="${esc(r.proof_path)}">عرض الإثبات</button>` : ''}${r.status === 'pending' ? `<button class="btn btn-primary btn-sm" data-approve="${esc(r.id)}">قبول</button><button class="btn btn-danger btn-sm" data-reject="${esc(r.id)}">رفض</button>` : ''}</div></div>`).join('') || '<p class="graduate-muted">لا توجد طلبات اشتراك حالياً.</p>'}</div></section>` : ''}${canAssignStaff ? `<section class="graduate-card"><h4>تعيين مسؤول للدفعة</h4><p class="graduate-staff-note">يجب أن يكون للشخص حساب مسجل مسبقاً في الموقع بهذا البريد الإلكتروني. اختر الصلاحية المناسبة؛ التعيين يخص هذه الدفعة فقط.</p><div class="graduate-grid"><label>بريد الحساب<input id="graduateStaffEmail" class="input" type="email" dir="ltr" autocomplete="email" placeholder="name@example.com"></label><label>المسؤولية<select id="graduateStaffRole" class="input"><option value="finance">مسؤول المالية والاشتراكات</option><option value="night_event">مسؤول الحفل الليلي</option></select></label></div><div class="graduate-actions"><button id="graduateStaffAssign" class="btn btn-primary btn-sm">تعيين المسؤول</button></div></section>` : ''}${canManageNight ? `<section class="graduate-card"><h4>تحقق بطاقة الحفل الليلي</h4><p class="graduate-muted">شغّل الكاميرا لمسح QR أو أدخل رمز البطاقة يدوياً؛ يتم التحقق داخل إجراء آمن على الخادم.</p><input id="graduateNightToken" class="input" dir="ltr" placeholder="رمز البطاقة"><div class="graduate-actions"><button id="graduateNightScan" class="btn btn-ghost">فتح الكاميرا</button><button id="graduateNightRedeem" class="btn btn-primary">تحقق واستخدام</button></div><p id="graduateNightResult" class="graduate-muted" aria-live="polite"></p></section>` : ''}</div>`;
    root.querySelector('#graduateSettingsSave')?.addEventListener('click', async () => { const { error } = await bridge.db.from('subscription_settings').upsert({ promotion_id: promotionId, amount: Number(root.querySelector('#graduateSettingsAmount').value || 0), currency: root.querySelector('#graduateSettingsCurrency').value.trim().toUpperCase(), updated_by: s.user.id }, { onConflict: 'promotion_id' }); if (error) notify(bridge, error.message, 'err'); else notify(bridge, 'تم حفظ مبلغ الاشتراك.', 'success'); });
    root.querySelector('#graduateBankAdd')?.addEventListener('click', async () => { const bank_name=root.querySelector('#graduateBankName').value.trim(), account_number=root.querySelector('#graduateBankAccount').value.trim(); if (!bank_name || !account_number) return notify(bridge, 'أدخل اسم البنك ورقم الحساب.', 'err'); const { error } = await bridge.db.from('payment_banks').insert({ promotion_id: promotionId, bank_name, account_number }); if (error) notify(bridge, error.message, 'err'); else { notify(bridge, 'تمت إضافة البنك.', 'success'); root.remove(); openGraduateAdmin(bridge); } });
    root.querySelector('#graduateStaffAssign')?.addEventListener('click', async () => { const email=root.querySelector('#graduateStaffEmail').value.trim(); const role=root.querySelector('#graduateStaffRole').value; if (!email) return notify(bridge, 'أدخل البريد الإلكتروني للحساب المسجل.', 'err'); const { error }=await bridge.db.rpc('platform_assign_promotion_staff', { _promotion_id: promotionId, _email: email, _role: role, _specialty_id: null }); if (error) return notify(bridge, error.message.includes('USER_NOT_FOUND') ? 'لم يُعثر على حساب بهذا البريد. اطلب من الشخص إنشاء حساب أولاً.' : error.message, 'err'); notify(bridge, role === 'finance' ? 'تم تعيين مسؤول المالية لهذه الدفعة.' : 'تم تعيين مسؤول الحفل الليلي لهذه الدفعة.', 'success'); });
    root.querySelectorAll('[data-proof]').forEach((button) => button.addEventListener('click', async () => { const signed = await bridge.db.storage.from('graduate-private').createSignedUrl(button.dataset.proof, 600); if (signed.data?.signedUrl) window.open(signed.data.signedUrl, '_blank', 'noopener'); else notify(bridge, signed.error?.message || 'تعذر فتح الإثبات.', 'err'); }));
    root.querySelectorAll('[data-approve]').forEach((button) => button.addEventListener('click', () => reviewRequest(bridge, root, button.dataset.approve, 'approved')));
    root.querySelectorAll('[data-reject]').forEach((button) => button.addEventListener('click', async () => { const reason = window.prompt('اكتب سبب رفض الطلب:'); if (reason) await reviewRequest(bridge, root, button.dataset.reject, 'rejected', reason); }));
    root.querySelector('#graduateNightScan')?.addEventListener('click', () => qrScannerModal(bridge, (token) => { root.querySelector('#graduateNightToken').value = token; root.querySelector('#graduateNightRedeem').click(); }));
    root.querySelector('#graduateNightRedeem')?.addEventListener('click', async () => { const token = root.querySelector('#graduateNightToken').value.trim(); if (!token) return; const { data, error } = await bridge.db.rpc('redeem_night_event_card', { _token: token }); root.querySelector('#graduateNightResult').textContent = error ? error.message : (data?.status === 'accepted' ? 'تم قبول البطاقة وتسجيل استخدامها.' : data?.status === 'used' ? 'هذه البطاقة مستعملة مسبقًا.' : 'البطاقة غير صالحة.'); });
  }
  async function reviewRequest(bridge, root, id, status, reason = null) { const { error } = await bridge.db.rpc('review_subscription_request', { _request_id: id, _status: status, _reason: reason }); if (error) return notify(bridge, error.message, 'err'); notify(bridge, status === 'approved' ? 'تم قبول الطلب وتفعيل العضوية.' : 'تم رفض الطلب وإرسال السبب.', 'success'); root.remove(); openGraduateAdmin(bridge); }
  function addEntry(bridge) {
    if (document.getElementById('graduateEntryButton')) return;
    const header = document.querySelector('header .topbar') || document.querySelector('header'); if (!header) return;
    const button = document.createElement('a'); button.id='graduateEntryButton'; button.className='btn btn-ghost btn-sm graduate-entry'; button.textContent='مساحة الخريج'; button.href=graduateUrl().toString(); button.setAttribute('aria-label','الانتقال مباشرة إلى مساحة الخريج');
    const anchor = document.getElementById('btnLoginText'); anchor?.parentNode?.insertBefore(button, anchor); if (!anchor) header.appendChild(button);
    const adminButton = document.createElement('button'); adminButton.id='graduateAdminButton'; adminButton.type='button'; adminButton.className='btn btn-ghost btn-sm graduate-entry'; adminButton.textContent='إدارة العضويات'; adminButton.hidden = !bridge.canManageGraduates?.(); adminButton.addEventListener('click', () => openGraduateAdmin(bridge));
    anchor?.parentNode?.insertBefore(adminButton, anchor);
    const sync = async () => { if (bridge.canManageGraduates?.()) { adminButton.hidden = false; return; } const s = await session(bridge); if (!s) { adminButton.hidden = true; return; } const [finance, night] = await Promise.all([bridge.db.rpc('mp_feature_admin', { _promotion_id: bridge.tenant.id, _roles: ['finance'] }), bridge.db.rpc('mp_feature_admin', { _promotion_id: bridge.tenant.id, _roles: ['night_event'] })]); adminButton.hidden = finance.data !== true && night.data !== true; };
    sync();
    bridge.db.auth.onAuthStateChange(() => setTimeout(sync, 0));
    if (new URLSearchParams(location.search).get('graduate') === '1') openGraduateSpace(bridge);
  }
  addStyle(); wait((bridge) => { addEntry(bridge); });
})();
