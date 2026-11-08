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
    .graduate-entry{margin-inline-start:8px!important;border:1px solid rgba(245,158,11,.5)!important;color:#b45309!important;background:rgba(255,251,235,.92)!important}
    .graduate-modal{max-width:760px!important}.graduate-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:14px}.graduate-card{border:1px solid var(--stroke);border-radius:18px;padding:16px;background:var(--surface-solid)}.graduate-card h4{margin:0 0 8px}.graduate-muted{color:var(--muted);font-size:13px}.graduate-actions{display:flex;flex-wrap:wrap;gap:8px;margin-top:12px}.graduate-status{border-radius:999px;padding:4px 10px;font-size:12px;font-weight:700;display:inline-block}.graduate-status.pending{background:#fef3c7;color:#92400e}.graduate-status.active{background:#dcfce7;color:#166534}.graduate-status.rejected{background:#fee2e2;color:#991b1b}.graduate-photo-list{display:grid;grid-template-columns:repeat(5,1fr);gap:8px}.graduate-photo-list img{width:100%;aspect-ratio:1;object-fit:cover;border-radius:12px}.graduate-file{width:100%;padding:10px;border:1px dashed var(--stroke);border-radius:12px;background:var(--bg)}
  `;
  const addStyle = () => { if (!document.getElementById('graduate-features-style')) { const s=document.createElement('style'); s.id='graduate-features-style'; s.textContent=css; document.head.appendChild(s); } };

  function notify(bridge, message, type = 'info') { bridge.toast?.(message, type); }
  function modal(bridge, content) {
    const root = bridge.openModal(`<div class="modal graduate-modal">${content}</div>`);
    root.querySelectorAll('[data-close]').forEach((x) => x.addEventListener('click', () => root.remove()));
    return root;
  }
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
  async function renderSpace(bridge, root, acc) {
    const promotionId = bridge.tenant.id;
    const [{ data: settings }, { data: banks }, memories] = await Promise.all([
      bridge.db.from('subscription_settings').select('*').eq('promotion_id', promotionId).maybeSingle(),
      bridge.db.from('payment_banks').select('*').eq('promotion_id', promotionId).eq('is_active', true).order('bank_name'),
      loadMemories(bridge, acc)
    ]);
    const { data: requests } = await bridge.db.from('subscription_requests').select('id,status,amount,rejection_reason,created_at,reviewed_at').eq('account_id', acc.id).order('created_at', { ascending: false }).limit(10);
    const latest = requests?.[0];
    root.querySelector('.graduate-content').innerHTML = `<div class="graduate-grid">
      <section class="graduate-card"><h4>العضوية</h4><p>الحالة: <span class="graduate-status ${esc(acc.membership_status)}">${esc(acc.membership_status === 'active' ? 'مفعّلة' : 'قيد المراجعة')}</span></p><p class="graduate-muted">${esc(acc.full_name)} · ${esc(acc.registration_number)}</p></section>
      <section class="graduate-card"><h4>الاشتراك</h4><p class="graduate-muted">المبلغ المحدد: <b>${esc(settings?.amount ?? 0)} ${esc(settings?.currency || 'MRU')}</b></p>${latest ? `<p>آخر طلب: <span class="graduate-status ${esc(latest.status)}">${esc(latest.status)}</span></p>${latest.rejection_reason ? `<p class="graduate-muted">سبب الرفض: ${esc(latest.rejection_reason)}</p>` : ''}` : '<p class="graduate-muted">لم ترسل طلبًا بعد.</p>'}<div class="graduate-actions"><button class="btn btn-primary btn-sm" id="graduatePayBtn">إرسال إثبات دفع</button></div></section>
      <section class="graduate-card"><h4>ذكرياتي <span class="graduate-muted">(${memories.length}/5)</span></h4><div class="graduate-photo-list">${memories.map((m) => m.url ? `<img src="${esc(m.url)}" alt="${esc(m.caption || 'ذكرى')}" title="${esc(m.caption || '')}">` : '').join('')}</div><div class="graduate-actions"><button class="btn btn-ghost btn-sm" id="graduateMemoryBtn">إضافة صورة</button></div></section>
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
    const root = modal(bridge, `<div class="modal-head"><h3>مساحة الخريج</h3><button class="icon-btn" data-close>×</button></div><div class="modal-body graduate-content"><p class="graduate-muted">جاري التحميل...</p></div>`);
    try { await renderSpace(bridge, root, acc); } catch (e) { root.querySelector('.graduate-content').innerHTML = `<p class="graduate-muted">تعذر تحميل المساحة: ${esc(e.message)}</p>`; }
  }
  async function openGraduateAdmin(bridge) {
    const s = await session(bridge);
    if (!s || !bridge.state?.me) return notify(bridge, 'يجب تسجيل الدخول بحساب مسؤول الدفعة.', 'err');
    const root = modal(bridge, `<div class="modal-head"><h3>إدارة اشتراكات وفعاليات الخريجين</h3><button class="icon-btn" data-close>×</button></div><div class="modal-body graduate-content"><p class="graduate-muted">جاري التحميل...</p></div>`);
    const promotionId = bridge.tenant.id;
    const [{ data: requests }, { data: totals }] = await Promise.all([
      bridge.db.from('subscription_requests').select('id,account_id,amount,status,proof_path,rejection_reason,created_at').eq('promotion_id', promotionId).order('created_at', { ascending: false }).limit(50),
      bridge.db.from('promotion_financial_totals').select('*').eq('promotion_id', promotionId).maybeSingle()
    ]);
    root.querySelector('.graduate-content').innerHTML = `<section class="graduate-card"><h4>ملخص مالي تلقائي</h4><div class="graduate-grid"><p>الاشتراكات المقبولة: <b>${esc(totals?.confirmed_subscriptions ?? 0)}</b></p><p>عدد الدافعين: <b>${esc(totals?.confirmed_payers ?? 0)}</b></p><p>المداخيل الأخرى: <b>${esc(totals?.other_income ?? 0)}</b></p><p>المصاريف: <b>${esc(totals?.expenses ?? 0)}</b></p></div></section><section class="graduate-card"><h4>طلبات الاشتراك</h4><div id="graduateRequests">${(requests || []).map((r) => `<div class="graduate-card" data-request="${esc(r.id)}"><p><b>${esc(r.amount)}</b> · <span class="graduate-status ${esc(r.status)}">${esc(r.status)}</span></p><p class="graduate-muted">${esc(new Date(r.created_at).toLocaleString())}</p><div class="graduate-actions">${r.proof_path ? `<button class="btn btn-ghost btn-sm" data-proof="${esc(r.proof_path)}">عرض الإثبات</button>` : ''}${r.status === 'pending' ? `<button class="btn btn-primary btn-sm" data-approve="${esc(r.id)}">قبول</button><button class="btn btn-danger btn-sm" data-reject="${esc(r.id)}">رفض</button>` : ''}</div></div>`).join('') || '<p class="graduate-muted">لا توجد طلبات.</p>'}</div></section><section class="graduate-card"><h4>تحقق بطاقة الحفل الليلي</h4><p class="graduate-muted">أدخل القيمة المقروءة من QR؛ التحقق يتم داخل RPC ذرية على الخادم.</p><input id="graduateNightToken" class="input" dir="ltr" placeholder="Token البطاقة"><div class="graduate-actions"><button id="graduateNightRedeem" class="btn btn-primary">تحقق واستخدام</button></div><p id="graduateNightResult" class="graduate-muted"></p></section>`;
    root.querySelectorAll('[data-proof]').forEach((button) => button.addEventListener('click', async () => { const signed = await bridge.db.storage.from('graduate-private').createSignedUrl(button.dataset.proof, 600); if (signed.data?.signedUrl) window.open(signed.data.signedUrl, '_blank', 'noopener'); else notify(bridge, signed.error?.message || 'تعذر فتح الإثبات.', 'err'); }));
    root.querySelectorAll('[data-approve]').forEach((button) => button.addEventListener('click', () => reviewRequest(bridge, root, button.dataset.approve, 'approved')));
    root.querySelectorAll('[data-reject]').forEach((button) => button.addEventListener('click', async () => { const reason = window.prompt('اكتب سبب رفض الطلب:'); if (reason) await reviewRequest(bridge, root, button.dataset.reject, 'rejected', reason); }));
    root.querySelector('#graduateNightRedeem').addEventListener('click', async () => { const token = root.querySelector('#graduateNightToken').value.trim(); if (!token) return; const { data, error } = await bridge.db.rpc('redeem_night_event_card', { _token: token }); root.querySelector('#graduateNightResult').textContent = error ? error.message : (data?.status === 'accepted' ? 'تم قبول البطاقة وتسجيل استخدامها.' : data?.status === 'used' ? 'هذه البطاقة مستعملة مسبقًا.' : 'البطاقة غير صالحة.'); });
  }
  async function reviewRequest(bridge, root, id, status, reason = null) { const { error } = await bridge.db.rpc('review_subscription_request', { _request_id: id, _status: status, _reason: reason }); if (error) return notify(bridge, error.message, 'err'); notify(bridge, status === 'approved' ? 'تم قبول الطلب وتفعيل العضوية.' : 'تم رفض الطلب وإرسال السبب.', 'success'); root.remove(); openGraduateAdmin(bridge); }
  function addEntry(bridge) {
    if (document.getElementById('graduateEntryButton')) return;
    const header = document.querySelector('header .topbar') || document.querySelector('header'); if (!header) return;
    const button = document.createElement('button'); button.id='graduateEntryButton'; button.type='button'; button.className='btn btn-ghost btn-sm graduate-entry'; button.textContent='مساحة الخريج'; button.addEventListener('click', () => openGraduateSpace(bridge));
    const anchor = document.getElementById('btnLoginText'); anchor?.parentNode?.insertBefore(button, anchor); if (!anchor) header.appendChild(button);
    const adminButton = document.createElement('button'); adminButton.id='graduateAdminButton'; adminButton.type='button'; adminButton.className='btn btn-ghost btn-sm graduate-entry'; adminButton.textContent='إدارة العضويات'; adminButton.addEventListener('click', () => openGraduateAdmin(bridge));
    anchor?.parentNode?.insertBefore(adminButton, anchor);
  }
  addStyle(); wait((bridge) => { addEntry(bridge); });
})();
