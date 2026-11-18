  /* ===== PROMO MR: دخول الخريج المبسّط — إنشاء الحساب مرة واحدة ثم دخول مباشر، بلا تأكيد كلمة المرور ===== */
  const GRAD_RETURNING_KEY = 'pm-graduate-returning';
  const GRAD_LAST_ID_KEY = 'pm-graduate-last-id';
  const GRAD_EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const gradStore = {
    get(key) { try { return localStorage.getItem(key); } catch (_) { return null; } },
    set(key, value) { try { localStorage.setItem(key, value); } catch (_) {} }
  };
  async function gradLogin(bridge, identifier, password) {
    const id = String(identifier || '').trim();
    if (GRAD_EMAIL_RE.test(id)) return bridge.db.auth.signInWithPassword({ email: id.toLowerCase(), password });
    const registration = id.toUpperCase();
    if (!/^[A-Z0-9-]{1,64}$/.test(registration)) return { error: new Error('INVALID_CREDENTIALS') };
    let response;
    try {
      response = await fetch(`${bridge.db.supabaseUrl}/functions/v1/graduate-login`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', apikey: bridge.db.supabaseKey, Authorization: `Bearer ${bridge.db.supabaseKey}` },
        body: JSON.stringify({ promotion_id: bridge.tenant.id, registration_number: registration, password })
      });
    } catch (_) { return { error: new Error('NETWORK') }; }
    if (response.status === 404) return { error: new Error('REG_LOGIN_UNAVAILABLE') };
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || !payload.session) return { error: new Error(response.status === 429 ? 'TOO_MANY' : 'INVALID_CREDENTIALS') };
    return bridge.db.auth.setSession({ access_token: payload.session.access_token, refresh_token: payload.session.refresh_token });
  }
  function gradLoginError(bridge, error) {
    const fr = isFrench(bridge), code = String(error?.message || '');
    if (code === 'REG_LOGIN_UNAVAILABLE') return fr ? 'La connexion par numéro d’inscription n’est pas encore activée. Utilisez votre e-mail.' : 'تسجيل الدخول برقم التسجيل غير مفعّل بعد. استخدم بريدك الإلكتروني.';
    if (code === 'TOO_MANY') return fr ? 'Trop de tentatives. Réessayez dans quelques minutes.' : 'محاولات كثيرة. انتظر بضع دقائق ثم أعد المحاولة.';
    if (code === 'NETWORK') return fr ? 'Problème de connexion. Réessayez.' : 'مشكلة في الاتصال. أعد المحاولة.';
    return fr ? 'Identifiants incorrects. Vérifiez votre e-mail / numéro d’inscription et votre mot de passe.' : 'بيانات الدخول غير صحيحة. تحقق من البريد أو رقم التسجيل وكلمة المرور.';
  }
  function authModal(bridge) {
    const L = (ar, fr) => (isFrench(bridge) ? fr : ar);
    const rosterMode = bridge.state?.promo?.graduate_roster_uploaded === true;
    const eye = `<button type="button" class="btn btn-ghost btn-sm" data-pw-toggle aria-label="${L('إظهار/إخفاء كلمة المرور', 'Afficher/masquer le mot de passe')}" style="min-width:46px">👁</button>`;
    const pwField = (id, auto) => `<div style="display:flex;gap:6px;align-items:center"><input id="${id}" class="input" type="password" autocomplete="${auto}" style="flex:1">${eye}</div>`;
    const detailsFields = rosterMode
      ? `<label>${L('رقم الهاتف', 'Téléphone')}<input id="gPhone" class="input" type="tel" dir="ltr" autocomplete="tel" maxlength="30"></label><label>${L('الاسم على شهادة التكريم', 'Nom sur le certificat de reconnaissance')}<input id="gCert" class="input" maxlength="160"></label><label>${L('الاسم على الوشاح', 'Nom sur l’écharpe')}<input id="gSash" class="input" maxlength="160"></label>`
      : `<label>${L('الاسم الكامل', 'Nom complet')}<input id="gName" class="input" autocomplete="name" maxlength="160"></label>`;
    const root = modal(bridge, `<div class="modal-head"><h3>${L('مساحة الخريج', 'Espace diplômé')}</h3><button class="icon-btn" data-close aria-label="${L('إغلاق', 'Fermer')}">×</button></div>
      <div class="modal-body">
        <div class="graduate-actions" role="tablist" style="margin:0 0 14px"><button type="button" class="btn" id="gTabLogin" role="tab">${L('دخول', 'Connexion')}</button><button type="button" class="btn" id="gTabSignup" role="tab">${L('إنشاء حساب (أول مرة فقط)', 'Créer un compte (première fois)')}</button></div>
        <section id="gLogin">
          <p class="graduate-muted">${L('سجّل دخولك ببريدك الإلكتروني (أو رقم التسجيل) وكلمة المرور.', 'Connectez-vous avec votre e-mail (ou numéro d’inscription) et votre mot de passe.')}</p>
          <label>${L('البريد الإلكتروني أو رقم التسجيل', 'E-mail ou numéro d’inscription')}<input id="gLoginId" class="input" dir="ltr" autocomplete="username" autocapitalize="off" spellcheck="false"></label>
          <label>${L('كلمة المرور', 'Mot de passe')}${pwField('gLoginPass', 'current-password')}</label>
          <div class="graduate-actions"><button type="button" class="btn btn-primary" id="gLoginBtn">${L('دخول', 'Connexion')}</button></div>
          <button type="button" class="btn btn-ghost btn-sm" id="gForgot">${L('نسيت كلمة المرور؟', 'Mot de passe oublié ?')}</button>
          <p class="graduate-muted">${L('أول مرة؟ أنشئ حسابك من تبويب «إنشاء حساب»، وبعدها تدخل مباشرة في كل مرة.', 'Première visite ? Créez votre compte dans l’onglet « Créer un compte » ; ensuite vous vous connectez directement.')}</p>
        </section>
        <section id="gSignup" hidden>
          <p class="graduate-muted">${rosterMode ? L('ابدأ بإدخال رقم التسجيل للتحقق من وجودك في القائمة الرسمية للدفعة.', 'Commencez par saisir votre numéro d’inscription pour vous retrouver dans la liste officielle de la promotion.') : L('أدخل رقم التسجيل الجامعي ثم أكمل بياناتك.', 'Saisissez votre numéro d’inscription universitaire puis complétez vos informations.')}</p>
          <label>${L('رقم التسجيل الجامعي', 'Numéro d’inscription universitaire')}<input id="gRegNo" class="input" dir="ltr" maxlength="64" autocomplete="off" autocapitalize="characters"></label>
          <div class="graduate-actions"><button type="button" class="btn btn-ghost" id="gVerify">${L('التحقق من رقم التسجيل', 'Vérifier le numéro d’inscription')}</button></div>
          <p id="gRegMsg" class="graduate-muted" aria-live="polite"></p>
          <div id="gIdentity" class="graduate-staff-note" hidden></div>
          <div id="gDetails" hidden>
            ${detailsFields}
            <label>${L('البريد الإلكتروني', 'Adresse e-mail')}<input id="gEmail" class="input" type="email" dir="ltr" autocomplete="email" autocapitalize="off"></label>
            <label>${L('كلمة المرور (6 أحرف على الأقل)', 'Mot de passe (6 caractères minimum)')}${pwField('gPass', 'new-password')}</label>
            <input id="gWebsite" type="text" autocomplete="off" tabindex="-1" aria-hidden="true" style="position:absolute;inset-inline-start:-10000px" value="">
            <div class="graduate-actions"><button type="button" class="btn btn-primary" id="gCreate">${L('إنشاء الحساب', 'Créer mon compte')}</button></div>
          </div>
        </section>
        <div class="graduate-actions"><button type="button" class="btn btn-ghost" data-close>${L('إلغاء', 'Annuler')}</button></div>
      </div>`);
    const $ = (selector) => root.querySelector(selector);
    let verified = null;
    const showTab = (tab) => {
      const login = tab === 'login';
      $('#gLogin').hidden = !login; $('#gSignup').hidden = login;
      $('#gTabLogin').className = 'btn ' + (login ? 'btn-primary' : 'btn-ghost'); $('#gTabSignup').className = 'btn ' + (login ? 'btn-ghost' : 'btn-primary');
      $('#gTabLogin').setAttribute('aria-selected', String(login)); $('#gTabSignup').setAttribute('aria-selected', String(!login));
    };
    showTab(gradStore.get(GRAD_RETURNING_KEY) === '1' ? 'login' : 'signup');
    const lastId = gradStore.get(GRAD_LAST_ID_KEY); if (lastId) $('#gLoginId').value = lastId;
    $('#gTabLogin').addEventListener('click', () => showTab('login'));
    $('#gTabSignup').addEventListener('click', () => showTab('signup'));
    root.querySelectorAll('[data-pw-toggle]').forEach((button) => button.addEventListener('click', () => { const input = button.parentElement.querySelector('input'); input.type = input.type === 'password' ? 'text' : 'password'; }));

    const doLogin = async () => {
      const identifier = $('#gLoginId').value.trim(), password = $('#gLoginPass').value;
      if (!identifier || !password) return notify(bridge, L('أدخل البريد أو رقم التسجيل وكلمة المرور.', 'Saisissez votre e-mail ou numéro d’inscription et votre mot de passe.'), 'err');
      const button = $('#gLoginBtn'), label = button.textContent; button.disabled = true; button.textContent = L('جارٍ تسجيل الدخول…', 'Connexion…');
      const result = await gradLogin(bridge, identifier, password);
      button.disabled = false; button.textContent = label;
      if (result.error) return notify(bridge, gradLoginError(bridge, result.error), 'err');
      gradStore.set(GRAD_RETURNING_KEY, '1'); gradStore.set(GRAD_LAST_ID_KEY, identifier);
      root._graduateNotifCleanup?.(); root.remove(); openGraduateSpace(bridge);
    };
    $('#gLoginBtn').addEventListener('click', doLogin);
    $('#gForgot').addEventListener('click', () => { const id = $('#gLoginId').value.trim(); passwordResetRequestModal(bridge, GRAD_EMAIL_RE.test(id) ? '' : id.toUpperCase()); });

    const verify = async () => {
      const registration = $('#gRegNo').value.trim().toUpperCase();
      if (!/^[A-Z0-9-]{1,64}$/.test(registration)) return notify(bridge, L('أدخل رقم تسجيل صالحًا.', 'Saisissez un numéro d’inscription valide.'), 'err');
      if (verified?.registration === registration) return;
      const button = $('#gVerify'), label = button.textContent; button.disabled = true; button.textContent = L('جارٍ التحقق…', 'Vérification…');
      try {
        const response = await fetch('/api/public/graduate-registration-check', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ promotion_id: bridge.tenant.id, registration_number: registration }) });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok || (payload.eligible !== true && payload.existing_account !== true)) throw new Error(payload.message || payload.error || L('رقم التسجيل غير متاح لإنشاء الحساب. تحقق منه أو تواصل مع الإدارة.', 'Numéro d’inscription indisponible pour créer un compte. Vérifiez-le ou contactez l’administration.'));
        if (payload.existing_account === true) {
          verified = null; $('#gDetails').hidden = true; $('#gIdentity').hidden = true; $('#gRegMsg').textContent = '';
          showTab('login'); $('#gLoginId').value = registration; $('#gLoginPass').focus();
          return notify(bridge, L('لديك حساب بالفعل بهذا الرقم. سجّل دخولك مباشرة.', 'Vous avez déjà un compte avec ce numéro. Connectez-vous directement.'), 'info');
        }
        verified = { registration, student: payload.student || {} };
        const student = verified.student, identity = $('#gIdentity');
        identity.innerHTML = `<strong>${esc(isFrench(bridge) ? (student.full_name_fr || student.full_name || '') : (student.full_name || student.full_name_fr || ''))}</strong><br><span>${esc(isFrench(bridge) ? (student.specialty_name_fr || student.specialty_name || '') : (student.specialty_name || student.specialty_name_fr || ''))}</span><br><small dir="ltr">${esc(student.registration_number || registration)}</small>`;
        identity.hidden = !(student.full_name || student.full_name_fr);
        $('#gRegMsg').textContent = L('تم التحقق ✔ أكمل بياناتك لإنشاء الحساب.', 'Numéro vérifié ✔ Complétez vos informations pour créer le compte.');
        $('#gDetails').hidden = false;
      } catch (error) {
        verified = null; $('#gDetails').hidden = true; $('#gIdentity').hidden = true; $('#gRegMsg').textContent = error.message;
      } finally { button.disabled = false; button.textContent = label; }
    };
    $('#gVerify').addEventListener('click', verify);
    $('#gRegNo').addEventListener('input', () => { if (verified && verified.registration !== $('#gRegNo').value.trim().toUpperCase()) { verified = null; $('#gDetails').hidden = true; $('#gIdentity').hidden = true; $('#gRegMsg').textContent = ''; } });
    $('#gRegNo').addEventListener('change', () => { if ($('#gRegNo').value.trim().length >= 3) verify(); });

    $('#gCreate').addEventListener('click', async () => {
      if (!verified) return notify(bridge, L('تحقق من رقم التسجيل أولاً.', 'Vérifiez d’abord le numéro d’inscription.'), 'err');
      const email = $('#gEmail').value.trim().toLowerCase(), password = $('#gPass').value;
      const phone = $('#gPhone')?.value.trim() || '', certificateName = $('#gCert')?.value.trim() || '', sashName = $('#gSash')?.value.trim() || '';
      const fullName = rosterMode ? (verified.student.full_name || '') : ($('#gName')?.value.trim() || '');
      if (!GRAD_EMAIL_RE.test(email)) return notify(bridge, L('أدخل بريدًا إلكترونيًا صالحًا.', 'Saisissez une adresse e-mail valide.'), 'err');
      if (password.length < 6) return notify(bridge, L('كلمة المرور يجب ألا تقل عن 6 أحرف.', 'Le mot de passe doit contenir au moins 6 caractères.'), 'err');
      if (rosterMode && (phone.length < 6 || phone.length > 30 || certificateName.length < 2 || certificateName.length > 160 || sashName.length < 2 || sashName.length > 160)) return notify(bridge, L('أكمل رقم الهاتف واسمي شهادة التكريم والوشاح (2–160 حرفًا).', 'Renseignez le téléphone et les noms du certificat et de l’écharpe (2 à 160 caractères).'), 'err');
      if (!rosterMode && fullName.length < 2) return notify(bridge, L('أدخل الاسم الكامل.', 'Saisissez votre nom complet.'), 'err');
      const button = $('#gCreate'), label = button.textContent; button.disabled = true; button.textContent = L('جارٍ إنشاء الحساب…', 'Création du compte…');
      let result;
      try {
        const response = await fetch('/api/public/graduate-signup', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, password, full_name: fullName || verified.student.full_name || '', registration_number: verified.registration, promotion_id: bridge.tenant.id, ...(rosterMode ? { phone, certificate_name: certificateName, sash_name: sashName } : {}), website: $('#gWebsite').value }) });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok || !payload.session) throw new Error(payload.error || L('تعذّر إنشاء الحساب.', 'Impossible de créer le compte.'));
        result = await bridge.db.auth.setSession({ access_token: payload.session.access_token, refresh_token: payload.session.refresh_token });
      } catch (error) { button.disabled = false; button.textContent = label; return notify(bridge, error.message || L('تعذّر إنشاء الحساب.', 'Impossible de créer le compte.'), 'err'); }
      if (result.error) { button.disabled = false; button.textContent = label; return notify(bridge, result.error.message, 'err'); }
      gradStore.set(GRAD_RETURNING_KEY, '1'); gradStore.set(GRAD_LAST_ID_KEY, email);
      if (rosterMode) {
        const { error: profileError } = await bridge.db.rpc('register_graduate', { _promotion_id: bridge.tenant.id, _full_name: verified.student.full_name || '', _registration_number: verified.registration, _phone: phone, _specialty_id: verified.student.specialty_id, _certificate_name: certificateName, _sash_name: sashName });
        if (profileError) { root.remove(); try { await openGraduateSpace(bridge); } catch (_) {} return notify(bridge, L('تم إنشاء الحساب لكن تعذر حفظ بيانات الخريج تلقائيًا؛ أكملها في نموذج ملفك قبل الدفع.', 'Compte créé, mais les informations du diplômé n’ont pas pu être enregistrées automatiquement. Complétez votre profil avant le paiement.'), 'err'); }
      }
      root.remove(); openGraduateSpace(bridge);
    });
    root.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter' || event.target.closest('button, textarea')) return;
      if (!$('#gLogin').hidden) doLogin(); else if (!$('#gDetails').hidden && event.target.closest('#gDetails')) $('#gCreate').click(); else verify();
    });
  }
