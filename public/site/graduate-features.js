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
  if (new URLSearchParams(location.search).get('graduate') === '1') document.documentElement.classList.add('graduate-direct-pending');
  const css = `
    .graduate-entry{margin-inline-start:8px!important;border:1px solid rgba(197,162,83,.48)!important;color:var(--ink,#102744)!important;background:var(--surface-solid,#fffdf8)!important;text-decoration:none!important;white-space:nowrap}
    .graduate-entry:hover{border-color:var(--accent,#c5a253)!important;box-shadow:0 8px 20px -12px var(--ink,#102744)!important;transform:translateY(-1px)}
    .dark .graduate-entry{color:#f3f7fb!important;background:#182435!important;border-color:#52657e!important}
    .dark .graduate-status.pending{background:#493817!important;color:#ffe29a!important}.dark .graduate-status.active,.dark .graduate-status.approved{background:#173d2c!important;color:#a9efc3!important}.dark .graduate-status.rejected{background:#4a2028!important;color:#ffc0c8!important}
    .dark .graduate-modal input,.dark .graduate-modal select,.dark .graduate-modal textarea{background:#111c2b!important;color:#edf3fa!important;border-color:#465a73!important}.dark .graduate-modal input::placeholder{color:#a9b8ca!important}
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
    .graduate-staff-note{padding:12px 14px;border-radius:13px;background:var(--violet-50);color:var(--text);font-size:13px;line-height:1.8}.graduate-bank-preview{display:flex;align-items:center;justify-content:space-between;gap:12px;margin:8px 0 14px;padding:14px 16px;border:1px solid color-mix(in srgb,var(--accent,#c5a253) 45%,var(--stroke));border-radius:14px;background:linear-gradient(120deg,var(--surface-solid),var(--violet-50));color:var(--text);overflow-wrap:anywhere}.graduate-bank-preview bdi{font-weight:900;letter-spacing:.03em}.graduate-bank-row,.graduate-staff-row{display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:center;gap:12px;margin-top:10px;padding:13px;border:1px solid var(--stroke);border-radius:15px;background:var(--bg)}.graduate-bank-row small,.graduate-staff-row small{display:block;color:var(--muted);font-size:12px;line-height:1.7}.graduate-request{margin-top:10px;border-color:var(--stroke)!important;background:var(--bg)!important}
    @media(max-width:560px){.graduate-modal{width:calc(100vw - 14px)!important;max-height:94dvh!important;border-radius:18px!important}.graduate-modal .modal-head{padding:16px!important}.graduate-modal .modal-body{max-height:calc(94dvh - 72px)!important;padding:14px!important}.graduate-intro{align-items:flex-start;padding:13px}.graduate-photo-list{grid-template-columns:repeat(3,minmax(0,1fr))}.graduate-actions .btn{flex:1 1 auto}.graduate-bank-row,.graduate-staff-row{grid-template-columns:1fr}.graduate-admin-hero{padding:18px}}
    .graduate-direct-pending #pagePublic,.graduate-direct-pending #pageDash{visibility:hidden}
    .dark .graduate-modal .modal-body{background:#101827!important;color:#e5edf7!important}.dark .graduate-card,.dark .graduate-auth-card,.dark .graduate-table td{background:#182435!important;color:#e5edf7!important;border-color:#33445c!important}.dark .graduate-card h4,.dark .graduate-card label,.dark .graduate-finance-stat b{color:#f3f7fb!important}.dark .graduate-muted,.dark .graduate-step span{color:#a9b8ca!important}.dark .graduate-admin-tabs button{background:#1b2a3e!important;color:#d8e5f2!important;border-color:#40546d!important}.dark .graduate-file,.dark .graduate-bank-row,.dark .graduate-staff-row{background:#111c2b!important;border-color:#33445c!important}
    @media(prefers-reduced-motion:reduce){.graduate-entry,.graduate-entry:hover{transition:none!important;transform:none!important}}
  `;
  const addStyle = () => { if (!document.getElementById('graduate-features-style')) { const s=document.createElement('style'); s.id='graduate-features-style'; s.textContent=css; document.head.appendChild(s); } };

  const FR = new Map(Object.entries({
    'مساحة الخريج':'Espace diplômé','إدارة العضويات':'Gestion des adhésions','لوحة مسؤول الدفعة':'Administration de la promotion','إدارة العضوية والفعاليات':'Administration des adhésions et événements',
    'أنشئ حسابًا مرتبطًا بهذه الدفعة أو سجّل الدخول لمتابعة اشتراكك وذكرياتك وبطاقاتك.':'Créez un compte lié à cette promotion ou connectez-vous pour suivre votre adhésion, vos souvenirs et vos cartes.',
    'دخول':'Connexion','إنشاء حساب':'Créer un compte','الاسم الكامل':'Nom complet','البريد الإلكتروني':'Adresse e-mail','كلمة المرور':'Mot de passe','متابعة':'Continuer','إلغاء':'Annuler',
    'أدخل الاسم الكامل والبريد وكلمة مرور من 6 أحرف على الأقل عند إنشاء الحساب.':'Saisissez votre nom complet, votre e-mail et un mot de passe d’au moins 6 caractères pour créer un compte.',
    'جارٍ إنشاء الحساب…':'Création du compte…','جارٍ تسجيل الدخول…':'Connexion…','تعذّر إنشاء الحساب.':'Impossible de créer le compte.','إرسال إثبات الدفع':'Envoyer une preuve de paiement','المبلغ المطلوب:':'Montant dû :','البنك':'Banque','المبلغ المدفوع':'Montant payé','صورة إثبات الدفع':'Preuve de paiement','إرسال الطلب':'Envoyer la demande','اختر البنك والمبلغ وارفع إثبات الدفع.':'Choisissez une banque, indiquez le montant et téléversez le justificatif.','تم إرسال طلب الاشتراك إلى مسؤول المالية.':'La demande d’adhésion a été envoyée au responsable financier.',
    'إضافة ذكرى':'Ajouter un souvenir','يمكنك رفع':'Vous pouvez ajouter','صورة إضافية.':'photo(s) supplémentaire(s).','الصورة':'Photo','الوصف':'Description','الخصوصية':'Confidentialité','المشتركون':'Membres','خاصة':'Privée','العامة':'Publique','حفظ':'Enregistrer','حفظ ومتابعة إلى الدفع':'Enregistrer et passer au paiement',
    'أكمل بياناتك واختر تخصصك قبل الانتقال إلى الدفع. ستُستخدم الأسماء كما كتبتها في ملف الخريج وقائمة التخصص.':'Complétez vos informations et choisissez votre spécialité avant le paiement. Les noms saisis seront utilisés dans votre profil et sur les documents.',
    'رقم التسجيل الجامعي':'Numéro d’inscription universitaire','رقم الهاتف':'Téléphone','الاسم على شهادة التكريم':'Nom sur le certificat de reconnaissance','الاسم على الوشاح':'Nom sur l’écharpe','التخصص':'Spécialité','اختر تخصصك':'Choisissez votre spécialité',
    'حفظ الأسماء':'Enregistrer les noms','ترتيبك في الدفعة':'Votre rang dans la promotion','التعديل مغلق من المشرف الرئيسي. يمكنك إضافة الصور فقط.':'Les modifications sont verrouillées par l’administrateur principal. Vous pouvez uniquement ajouter des photos.',
    'إعداد الاشتراك والبنوك':'Paramètres d’adhésion et banques','موعد بدء استقبال الدفع':'Date de début des paiements','تفويض رئيس الدفعة لتحديد الموعد':'Autoriser le président de la promotion à définir la date','يُطبّق الموعد على هذه الدفعة فقط، ولا يمكن إرسال دفعة قبل حلوله. اتركه فارغاً لفتح الدفع مباشرة.':'La date s’applique uniquement à cette promotion. Aucun paiement ne peut être envoyé avant cette date. Laissez vide pour ouvrir les paiements immédiatement.',
    'حفظ إعدادات الاشتراك':'Enregistrer les paramètres d’adhésion','إدارة اشتراكات وفعاليات الدفعة':'Gestion des adhésions et événements de la promotion','إعدادات الاشتراك، مراجعة الإثباتات، ومتابعة الإيرادات من مكان واحد. بيانات هذه الشاشة خاصة بالدفعة الحالية.':'Paramètres d’adhésion, vérification des justificatifs et suivi des recettes au même endroit. Ces données concernent uniquement la promotion actuelle.',
    'الملخص المالي':'Résumé financier','الاشتراكات المقبولة':'Adhésions approuvées','عدد الدافعين':'Nombre de payeurs','المداخيل الأخرى':'Autres recettes','المصاريف':'Dépenses','طلبات الاشتراك':'Demandes d’adhésion','مقبول':'Approuvé','مرفوض':'Refusé','قيد المراجعة':'En cours de vérification',
    'تعيين مسؤول للدفعة':'Désigner un responsable','مسؤول المالية والاشتراكات':'Responsable financier et des adhésions','مسؤول الحفل الليلي':'Responsable de la soirée','تعيين المسؤول':'Désigner le responsable','تحقق بطاقة الحفل الليلي':'Vérifier une carte de la soirée','فتح الكاميرا':'Ouvrir la caméra','تحقق واستخدام':'Vérifier et utiliser',
    'جاري التحميل...':'Chargement…','تعذر تحميل المساحة:':'Impossible de charger l’espace :','لم ترسل طلب اشتراك بعد.':'Vous n’avez pas encore envoyé de demande d’adhésion.','ألبوم ذكرياتي':'Mes souvenirs','إضافة صورة للذكرى':'Ajouter une photo souvenir','لم تضف صوراً بعد. احفظ لحظاتك المميزة مع دفعتك.':'Vous n’avez pas encore ajouté de photos. Partagez vos meilleurs souvenirs avec votre promotion.',
    'يجب تسجيل الدخول بحساب مسؤول الدفعة.':'Connectez-vous avec un compte de responsable de promotion.','لا تملك صلاحية إدارة هذه الدفعة.':'Vous n’êtes pas autorisé à gérer cette promotion.','تم قبول البطاقة وتسجيل استخدامها.':'Carte acceptée et utilisation enregistrée.','هذه البطاقة مستعملة مسبقًا.':'Cette carte a déjà été utilisée.','البطاقة غير صالحة.':'Carte invalide.',
    'مساحتك، وذكريات دفعتك':'Votre espace et les souvenirs de votre promotion','تابع عضويتك وطلبات الاشتراك وشارك أجمل لحظات التخرج.':'Suivez votre adhésion et vos demandes, et partagez vos plus beaux souvenirs de fin d’études.','ملفي وعضويتي':'Mon profil et mon adhésion','حالة العضوية:':'Statut de l’adhésion :','مفعّلة':'Active','موقوفة':'Suspendue','المبلغ المحدد:':'Montant fixé :','آخر طلب:':'Dernière demande :','سبب الرفض:':'Motif du refus :','تم قبول الدفع وتفعيل عضويتك؛ لا حاجة ولا يمكن إرسال طلب دفع آخر.':'Votre paiement est approuvé et votre adhésion est active. Aucun autre paiement ne peut être envoyé.','لديك طلب دفع قيد المراجعة. انتظر قرار مسؤول المالية قبل إرسال طلب آخر.':'Votre demande de paiement est en cours d’examen. Attendez la décision du responsable financier avant d’en envoyer une autre.','يفتح استقبال الدفع في':'Les paiements ouvrent le','لا توجد حسابات بنكية مفعّلة حالياً.':'Aucun compte bancaire actif pour le moment.','سبب رفض الطلب':'Motif du refus',
    'بيانات الخريج والتخصص':'Informations du diplômé et spécialité','استكمال بيانات الخريج':'Compléter le profil du diplômé','اسم شهادة التكريم':'Nom sur le certificat de reconnaissance','الاسم الكامل:':'Nom complet :','رقم التسجيل:':'Numéro d’inscription :','الهاتف:':'Téléphone :','الاشتراك المالي':'Adhésion financière','ألبوم ذكرياتي':'Mon album de souvenirs','إضافة صورة للذكرى':'Ajouter une photo souvenir','من':'sur','حالة':'Statut','اكتب سبب رفض الطلب:':'Saisissez le motif du refus :',
    'اسم البنك':'Nom de la banque','رقم الحساب':'Numéro de compte','العملة':'Devise','المبلغ':'Montant','معاينة الحساب البنكي':'Aperçu du compte bancaire','إضافة البنك':'Ajouter la banque','إلغاء التعديل':'Annuler la modification','لا توجد حسابات بنكية بعد.':'Aucun compte bancaire pour le moment.','تم تفعيل':'Activé','موقوف':'Désactivé','تعديل':'Modifier','حذف / إيقاف':'Supprimer / désactiver','حذف نهائي':'Suppression définitive','عرض الإثبات':'Voir le justificatif','قبول':'Approuver','رفض':'Refuser','لا توجد طلبات اشتراك حالياً.':'Aucune demande d’adhésion pour le moment.',
    'يجب أن يكون للشخص حساب مسجل مسبقاً في الموقع بهذا البريد الإلكتروني. اختر الصلاحية المناسبة؛ التعيين يخص هذه الدفعة فقط.':'La personne doit déjà avoir un compte avec cette adresse e-mail. Choisissez le rôle approprié ; la désignation concerne uniquement cette promotion.','بريد الحساب':'E-mail du compte','المسؤولية':'Responsabilité','معاينة المسؤول':'Aperçu du responsable','أدخل البريد الإلكتروني':'Saisissez une adresse e-mail','لم يتم تعيين مسؤولين لهذه الدفعة بعد.':'Aucun responsable n’a encore été désigné pour cette promotion.','حفظ الصلاحية':'Enregistrer le rôle','حذف المسؤول':'Retirer le responsable','رمز البطاقة':'Code de la carte','شغّل الكاميرا لمسح QR أو أدخل رمز البطاقة يدوياً؛ يتم التحقق داخل إجراء آمن على الخادم.':'Scannez le code QR avec la caméra ou saisissez le code manuellement. La vérification est effectuée de manière sécurisée sur le serveur.','إيقاف الكاميرا':'Arrêter la caméra','اسمح للمتصفح باستخدام الكاميرا ووجّهها إلى QR البطاقة.':'Autorisez l’accès à la caméra et dirigez-la vers le code QR de la carte.',
    'لم يبدأ استقبال الدفع لهذه الدفعة بعد.':'Les paiements n’ont pas encore commencé pour cette promotion.','تم حفظ الأسماء.':'Les noms ont été enregistrés.','تم حفظ الذكرى.':'Le souvenir a été enregistré.','تم رفض الطلب وإرسال السبب.':'La demande a été refusée et le motif a été envoyé.','تم قبول الطلب وتفعيل العضوية.':'La demande a été approuvée et l’adhésion activée.','يجب أن يكون طول كل اسم بين حرفين و160 حرفًا.':'Chaque nom doit comporter entre 2 et 160 caractères.'
  }));
  const isFrench = (bridge) => String(bridge?.lang || bridge?.state?.lang || document.documentElement.lang || '').toLowerCase().startsWith('fr');
  function translateElement(bridge, element) {
    if (!element) return;
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT), nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    const entries=[...FR.entries()];
    const pairs=isFrench(bridge)?entries:entries.map(([ar,fr])=>[fr,ar]);
    for (const node of nodes) for (const [ar, fr] of pairs) if (node.nodeValue.includes(ar)) node.nodeValue = node.nodeValue.split(ar).join(fr);
    element.querySelectorAll('[placeholder],[aria-label],[title]').forEach((el) => ['placeholder','aria-label','title'].forEach((attr) => { if (el.hasAttribute(attr)) for (const [ar,fr] of pairs) el.setAttribute(attr,el.getAttribute(attr).split(ar).join(fr)); }));
  }
  function translateMarkup(bridge, html) {
    if (!isFrench(bridge)) return html;
    const doc = new DOMParser().parseFromString(`<div>${html}</div>`, 'text/html');
    const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT);
    const nodes = []; while (walker.nextNode()) nodes.push(walker.currentNode);
    for (const node of nodes) for (const [ar, fr] of FR) if (node.nodeValue.includes(ar)) node.nodeValue=node.nodeValue.split(ar).join(fr);
    doc.body.querySelectorAll('[placeholder],[aria-label],[title]').forEach((el) => ['placeholder','aria-label','title'].forEach((attr) => { if (el.hasAttribute(attr)) for (const [ar,fr] of FR) el.setAttribute(attr,el.getAttribute(attr).split(ar).join(fr)); }));
    const wrapper=doc.body.firstElementChild; return wrapper ? wrapper.innerHTML : html;
  }
  function notify(bridge, message, type = 'info') { if (isFrench(bridge)) for (const [ar,fr] of FR) message=String(message).split(ar).join(fr); bridge.toast?.(message, type); }
  function modal(bridge, content) {
    const root = bridge.openModal(`<div class="modal graduate-modal" lang="${isFrench(bridge) ? 'fr' : 'ar'}" dir="${isFrench(bridge) ? 'ltr' : 'rtl'}">${translateMarkup(bridge, content)}</div>`);
    root.querySelectorAll('[data-close]').forEach((x) => x.addEventListener('click', () => { root.remove(); if (!document.querySelector('.graduate-modal')) clearGraduateRoute(); }));
    return root;
  }
  function graduateUrl() { const url = new URL(window.location.href); url.searchParams.set('graduate', '1'); return url; }
  function clearGraduateRoute() { const url = new URL(window.location.href); if (url.searchParams.has('graduate')) { url.searchParams.delete('graduate'); history.replaceState(history.state, '', url); const bridge = window.PromoMRFeatureBridge; setTimeout(() => bridge?.refresh?.().catch((error) => console.warn('[PROMO MR] batch refresh after alumni entry', error)), 0); } }
  async function session(bridge) { const { data } = await bridge.db.auth.getSession(); return data?.session || null; }
  async function account(bridge, userId) {
    const { data, error } = await bridge.db.from('graduate_accounts').select('*').eq('promotion_id', bridge.tenant.id).eq('user_id', userId).maybeSingle();
    if (error) throw error; return data;
  }
  async function signInOrUp(bridge, root) {
    const email = root.querySelector('#graduateEmail').value.trim();
    const password = root.querySelector('#graduatePassword').value;
    const fullName = root.querySelector('#graduateName').value.trim();
    const mode = root.querySelector('[name="graduateMode"]:checked')?.value || 'signin';
    if (!email || password.length < 6 || (mode === 'signup' && fullName.length < 2)) return notify(bridge, 'أدخل الاسم الكامل والبريد وكلمة مرور من 6 أحرف على الأقل عند إنشاء الحساب.', 'err');
    const submit = root.querySelector('#graduateAuthSubmit');
    submit.disabled = true; submit.textContent = mode === 'signup' ? 'جارٍ إنشاء الحساب…' : 'جارٍ تسجيل الدخول…';
    let result;
    if (mode === 'signup') {
      try {
        const response = await fetch('/api/public/graduate-signup', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, password, full_name: fullName, promotion_id: bridge.tenant.id, website: root.querySelector('#graduateWebsite').value }) });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok || !payload.session) throw new Error(payload.error || 'تعذّر إنشاء الحساب.');
        result = await bridge.db.auth.setSession({ access_token: payload.session.access_token, refresh_token: payload.session.refresh_token });
      } catch (error) { submit.disabled = false; submit.textContent = 'متابعة'; return notify(bridge, error.message || 'تعذّر إنشاء الحساب.', 'err'); }
    } else result = await bridge.db.auth.signInWithPassword({ email, password });
    if (result.error) { submit.disabled = false; submit.textContent = 'متابعة'; return notify(bridge, result.error.message, 'err'); }
    root.remove(); openGraduateSpace(bridge);
  }
  function authModal(bridge) {
    const root = modal(bridge, `<div class="modal-head"><h3>مساحة الخريج</h3><button class="icon-btn" data-close>×</button></div>
      <div class="modal-body"><p class="graduate-muted">أنشئ حسابًا مرتبطًا بهذه الدفعة أو سجّل الدخول لمتابعة اشتراكك وذكرياتك وبطاقاتك.</p>
      <label class="graduate-mode"><input type="radio" name="graduateMode" value="signin" checked> دخول</label>
      <label class="graduate-mode"><input type="radio" name="graduateMode" value="signup"> إنشاء حساب</label>
      <div id="graduateNameWrap" hidden><label>الاسم الكامل<input id="graduateName" class="input" autocomplete="name" maxlength="160"></label></div>
      <label>البريد الإلكتروني<input id="graduateEmail" class="input" type="email" autocomplete="email"></label>
      <label>كلمة المرور<input id="graduatePassword" class="input" type="password" autocomplete="current-password"></label>
      <input id="graduateWebsite" type="text" autocomplete="off" tabindex="-1" aria-hidden="true" style="position:absolute;inset-inline-start:-10000px" value="">
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
    const [settingsResult, banksResult, requestsResult, memoriesResult] = await Promise.all([
      bridge.db.from('subscription_settings').select('*').eq('promotion_id', promotionId).maybeSingle(),
      bridge.db.from('payment_banks').select('*').eq('promotion_id', promotionId).eq('is_active', true).order('bank_name'),
      bridge.db.from('subscription_requests').select('id,status,amount,rejection_reason,created_at,reviewed_at').eq('account_id', acc.id).order('created_at', { ascending: false }).limit(10),
      bridge.db.from('graduate_memories').select('*').eq('account_id', acc.id).order('created_at', { ascending: false })
    ]);
    if (settingsResult.error || banksResult.error || requestsResult.error || memoriesResult.error) throw settingsResult.error || banksResult.error || requestsResult.error || memoriesResult.error;
    const settings = settingsResult.data, banks = banksResult.data || [], requests = requestsResult.data || [], memories = await loadMemories(bridge, acc);
    let linkedStudent = null; if (acc.student_id) { const sr = await bridge.db.from('students').select('order_index').eq('id', acc.student_id).eq('promotion_id', promotionId).maybeSingle(); if (sr.error) throw sr.error; linkedStudent = sr.data; }
    const locked = bridge.state?.promo?.graduate_editing_locked === true;
    const latest = requests?.[0];
    const approved = (requests || []).some((request) => request.status === 'approved') || acc.membership_status === 'active';
    const pending = !approved && (requests || []).some((request) => request.status === 'pending');
    const startsAt = settings?.payment_starts_at ? new Date(settings.payment_starts_at) : null;
    const paymentWaiting = startsAt && startsAt.getTime() > Date.now();
    const startLabel = startsAt && !Number.isNaN(startsAt.getTime()) ? startsAt.toLocaleString(bridge.lang === 'fr' ? 'fr-FR' : 'ar') : '';
    const paymentAction = paymentWaiting
      ? `<p class="graduate-staff-note">يفتح استقبال الدفع في <b>${esc(startLabel)}</b>؛ لا يمكن الإرسال قبل ذلك الموعد.</p>`
      : `<div class="graduate-actions"><button class="btn btn-primary btn-sm" id="graduatePayBtn" ${banks.length ? '' : 'disabled'}>إرسال إثبات الدفع</button></div>${banks.length ? '' : '<p class="graduate-muted">لا توجد حسابات بنكية مفعّلة حالياً.</p>'}`;
    root.querySelector('.graduate-content').innerHTML = `<div class="graduate-intro"><span class="graduate-intro-mark" aria-hidden="true">✦</span><div><strong>مساحتك، وذكريات دفعتك</strong><p>تابع عضويتك وطلبات الاشتراك وشارك أجمل لحظات التخرج.</p></div></div><div class="graduate-grid">
      <section class="graduate-card"><h4>ملفي وعضويتي</h4><p>حالة العضوية: <span class="graduate-status ${esc(acc.membership_status)}">${esc(acc.membership_status === 'active' ? 'مفعّلة' : acc.membership_status === 'suspended' ? 'موقوفة' : 'قيد المراجعة')}</span></p><p class="graduate-muted">الاسم الكامل: ${esc(acc.full_name)} · رقم التسجيل: ${esc(acc.registration_number)}</p>${acc.phone ? `<p class="graduate-muted">الهاتف: ${esc(acc.phone)}</p>` : ''}${linkedStudent?.order_index != null ? `<p class="graduate-staff-note">${isFrench(bridge) ? 'Votre rang dans la promotion' : 'ترتيبك في الدفعة'} : <b>${Number(linkedStudent.order_index)}</b></p>` : ''}${acc.certificate_name ? `<p class="graduate-muted">اسم شهادة التكريم: ${esc(acc.certificate_name)}</p>` : ''}${acc.sash_name ? `<p class="graduate-muted">الاسم على الوشاح: ${esc(acc.sash_name)}</p>` : ''}${locked ? `<p class="graduate-staff-note">${isFrench(bridge) ? FR.get('التعديل مغلق من المشرف الرئيسي. يمكنك إضافة الصور فقط.') : 'التعديل مغلق من المشرف الرئيسي. يمكنك إضافة الصور فقط.'}</p>` : `<div class="graduate-actions"><button class="btn btn-ghost btn-sm" id="graduateEditNames">${isFrench(bridge) ? 'Modifier les noms du certificat et de l’écharpe' : 'تعديل اسمي الشهادة والوشاح'}</button></div>`}</section>
      <section class="graduate-card"><h4>الاشتراك المالي</h4><p class="graduate-muted">المبلغ المحدد: <b>${esc(settings?.amount ?? 0)} ${esc(settings?.currency || 'MRU')}</b></p>${latest ? `<p>آخر طلب: <span class="graduate-status ${esc(latest.status)}">${esc(latest.status === 'approved' ? 'مقبول' : latest.status === 'rejected' ? 'مرفوض' : 'قيد المراجعة')}</span></p>${latest.rejection_reason ? `<p class="graduate-muted">سبب الرفض: ${esc(latest.rejection_reason)}</p>` : ''}` : '<p class="graduate-muted">لم ترسل طلب اشتراك بعد.</p>'}${approved ? '<p class="graduate-staff-note">تم قبول الدفع وتفعيل عضويتك؛ لا حاجة ولا يمكن إرسال طلب دفع آخر.</p>' : pending ? '<p class="graduate-staff-note">لديك طلب دفع قيد المراجعة. انتظر قرار مسؤول المالية قبل إرسال طلب آخر.</p>' : paymentAction}</section>
      <section class="graduate-card"><h4>ألبوم ذكرياتي <span class="graduate-muted">${memories.length} من 5</span></h4><div class="graduate-photo-list" id="graduatePhotoList">${memories.length ? '<span class="graduate-muted">جاري تحميل الصور…</span>' : '<span class="graduate-muted">لم تضف صوراً بعد. احفظ لحظاتك المميزة مع دفعتك.</span>'}</div><div class="graduate-actions"><button class="btn btn-ghost btn-sm" id="graduateMemoryBtn" ${memories.length >= 5 ? 'disabled' : ''}>إضافة صورة للذكرى</button></div></section>
    </div>`;
    translateElement(bridge, root.querySelector('.graduate-content'));
    root.querySelector('#graduateEditNames')?.addEventListener('click', () => editDisplayNames(bridge, acc, root));
    root.querySelector('#graduatePayBtn')?.addEventListener('click', () => paymentModal(bridge, acc, settings, banks, root));
    root.querySelector('#graduateMemoryBtn')?.addEventListener('click', () => memoryModal(bridge, acc, memories.length, root));
    if (memories.length) Promise.all(memories.map(async (item) => { const signed = await bridge.db.storage.from('graduate-private').createSignedUrl(item.storage_path, 900); return { ...item, url: signed.data?.signedUrl || '' }; })).then((items) => { const target = root.querySelector('#graduatePhotoList'); if (target) target.innerHTML = items.map((m) => m.url ? `<img src="${esc(m.url)}" alt="${esc(m.caption || 'ذكرى')}" title="${esc(m.caption || '')}">` : '').join('') || '<span class="graduate-muted">تعذر تحميل الصور حالياً.</span>'; }).catch(() => {});
  }
  function editDisplayNames(bridge, acc, parent) {
    const root=modal(bridge, `<div class="modal-head"><h3>${isFrench(bridge) ? 'Modifier les noms sur les documents' : 'تعديل أسماء شهادة التكريم والوشاح'}</h3><button class="icon-btn" data-close>×</button></div><div class="modal-body"><label>${isFrench(bridge) ? 'Nom sur le certificat de reconnaissance' : 'الاسم على شهادة التكريم'}<input id="graduateCertificateName" class="input" maxlength=160 value="${esc(acc.certificate_name || '')}"></label><label>${isFrench(bridge) ? 'Nom sur l’écharpe' : 'الاسم على الوشاح'}<input id="graduateSashName" class="input" maxlength=160 value="${esc(acc.sash_name || '')}"></label><div class="graduate-actions"><button id="graduateNamesSave" class="btn btn-primary">${isFrench(bridge) ? 'Enregistrer' : 'حفظ الأسماء'}</button></div></div>`);
    root.querySelector('#graduateNamesSave').addEventListener('click', async () => {
      const certificate=root.querySelector('#graduateCertificateName').value.trim(), sash=root.querySelector('#graduateSashName').value.trim();
      if (certificate.length<2 || certificate.length>160 || sash.length<2 || sash.length>160) return notify(bridge,isFrench(bridge)?'Chaque nom doit contenir entre 2 et 160 caractères.':'يجب أن يكون طول كل اسم بين حرفين و160 حرفًا.','err');
      const {data,error}=await bridge.db.rpc('update_graduate_display_names',{_certificate_name:certificate,_sash_name:sash});
      if(error) return notify(bridge,error.message.includes('GRADUATE_EDITING_LOCKED')?(isFrench(bridge)?FR.get('التعديل مغلق من المشرف الرئيسي. يمكنك إضافة الصور فقط.'):'التعديل مغلق من المشرف الرئيسي. يمكنك إضافة الصور فقط.'):error.message,'err');
      root.remove(); notify(bridge,isFrench(bridge)?'Les noms ont été enregistrés.':'تم حفظ الأسماء.','success'); await renderSpace(bridge,parent,dataAccount(data,acc));
    });
  }
  function dataAccount(data, fallback) { return data && typeof data==='object' ? data : fallback; }
  function paymentModal(bridge, acc, settings, banks, parent) {
    if (settings?.payment_starts_at && new Date(settings.payment_starts_at).getTime() > Date.now()) return notify(bridge, `يفتح استقبال الدفع في ${new Date(settings.payment_starts_at).toLocaleString(isFrench(bridge) ? 'fr-FR' : 'ar')}.`, 'info');
    if (!banks.length) return notify(bridge, 'لا توجد حسابات بنكية مفعّلة لاستقبال الدفع حالياً.', 'err');
    const root = modal(bridge, `<div class="modal-head"><h3>إرسال إثبات الدفع</h3><button class="icon-btn" data-close>×</button></div><div class="modal-body"><p class="graduate-muted">المبلغ المطلوب: <b>${esc(settings?.amount || 0)} ${esc(settings?.currency || 'MRU')}</b></p><label>البنك<select id="graduateBank" class="input">${banks.map((b) => `<option value="${esc(b.id)}" data-bank="${esc(b.bank_name)}" data-account="${esc(b.account_number)}">${esc(b.bank_name)} — ${esc(b.account_number)}</option>`).join('')}</select></label><div id="graduateBankPreview" class="graduate-bank-preview" aria-live="polite"></div><label>المبلغ المدفوع<input id="graduateAmount" class="input" type="number" min="1" step="0.01" value="${esc(settings?.amount || '')}"></label><label>صورة إثبات الدفع<input id="graduateProof" class="graduate-file" type="file" accept="image/*,application/pdf"></label><div class="graduate-actions"><button id="graduatePaySubmit" class="btn btn-primary">إرسال الطلب</button><button class="btn btn-ghost" data-close>إلغاء</button></div></div>`);
    const showBankPreview = () => { const option = root.querySelector('#graduateBank').selectedOptions[0]; root.querySelector('#graduateBankPreview').innerHTML = option ? `<strong>${esc(option.dataset.bank)}</strong><bdi dir="ltr">${esc(option.dataset.account)}</bdi>` : ''; };
    root.querySelector('#graduateBank').addEventListener('change', showBankPreview);
    showBankPreview();
    root.querySelector('#graduatePaySubmit').addEventListener('click', async () => {
      const file = root.querySelector('#graduateProof').files[0]; const amount = Number(root.querySelector('#graduateAmount').value);
      if (!file || !amount || !root.querySelector('#graduateBank').value) return notify(bridge, 'اختر البنك والمبلغ وارفع إثبات الدفع.', 'err');
      const submit = root.querySelector('#graduatePaySubmit'); submit.disabled = true; submit.textContent = 'جارٍ إرسال الطلب…';
      let path = '';
      try {
        if (settings?.payment_starts_at && new Date(settings.payment_starts_at).getTime() > Date.now()) throw new Error('PAYMENT_NOT_OPEN');
        path = `proofs/${bridge.tenant.id}/${acc.user_id}/${uuid()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
        await upload(bridge, file, path);
        const { error } = await bridge.db.from('subscription_requests').insert({ promotion_id: bridge.tenant.id, account_id: acc.id, bank_id: root.querySelector('#graduateBank').value, amount, proof_path: path });
        if (error) throw error;
      } catch (e) {
        if (path) await bridge.db.storage.from('graduate-private').remove([path]).catch(() => {});
        submit.disabled = false; submit.textContent = 'إرسال الطلب';
        notify(bridge, /SUBSCRIPTION_ALREADY_APPROVED/.test(e.message) ? 'تم قبول دفعة سابقة لهذا الحساب، ولا يمكن الدفع مرة أخرى.' : /SUBSCRIPTION_PENDING/.test(e.message) ? 'لديك طلب دفع قيد المراجعة بالفعل.' : /PAYMENT_NOT_OPEN/.test(e.message) ? 'لم يبدأ استقبال الدفع لهذه الدفعة بعد.' : e.message, 'err');
        return;
      }
      root.remove(); notify(bridge, 'تم إرسال طلب الاشتراك إلى مسؤول المالية.', 'success');
      try { await renderSpace(bridge, parent, acc); } catch (_) {}
    });
  }
  function memoryModal(bridge, acc, count, parent) {
    const root = modal(bridge, `<div class="modal-head"><h3>إضافة ذكرى</h3><button class="icon-btn" data-close>×</button></div><div class="modal-body"><p class="graduate-muted">يمكنك رفع ${Math.max(0, 5-count)} صورة إضافية.</p><label>الصورة<input id="graduateMemoryFile" class="graduate-file" type="file" accept="image/*"></label><label>الوصف<input id="graduateMemoryCaption" class="input" maxlength="180"></label><label>الخصوصية<select id="graduateMemoryVisibility" class="input"><option value="members">المشتركون</option><option value="private">خاصة</option><option value="public">العامة</option></select></label><div class="graduate-actions"><button id="graduateMemorySubmit" class="btn btn-primary">حفظ</button><button class="btn btn-ghost" data-close>إلغاء</button></div></div>`);
    root.querySelector('#graduateMemorySubmit').addEventListener('click', async () => { const file=root.querySelector('#graduateMemoryFile').files[0]; if (!file) return notify(bridge,'اختر صورة أولًا.','err'); try { const path=`memories/${bridge.tenant.id}/${acc.user_id}/${uuid()}-${file.name.replace(/[^a-zA-Z0-9._-]/g,'_')}`; await upload(bridge,file,path); const {error}=await bridge.db.from('graduate_memories').insert({promotion_id:bridge.tenant.id,account_id:acc.id,storage_path:path,caption:root.querySelector('#graduateMemoryCaption').value.trim(),visibility:root.querySelector('#graduateMemoryVisibility').value}); if(error) throw error; root.remove(); notify(bridge,'تم حفظ الذكرى.','success'); await renderSpace(bridge,parent,acc); } catch(e){ notify(bridge,e.message,'err'); } });
  }
  function localDateTimeInput(value) {
    if (!value) return '';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  }
  async function openGraduateSpace(bridge) {
    const s = await session(bridge); if (!s) return authModal(bridge);
    let acc, specialtyResult; try { [acc, specialtyResult] = await Promise.all([account(bridge, s.user.id), bridge.db.from('specialties').select('id,name,name_fr').eq('promotion_id', bridge.tenant.id).order('name').limit(50)]); } catch (e) { return notify(bridge, e.message, 'err'); }
    if (specialtyResult.error) return notify(bridge, specialtyResult.error.message, 'err');
    if (!acc) { const scope=await bridge.db.rpc('graduate_account_is_elsewhere'); if(scope.error) return notify(bridge,scope.error.message,'err'); if(scope.data===true) return notify(bridge,isFrench(bridge)?'Ce compte est déjà associé à une autre promotion.':'هذا الحساب مرتبط مسبقًا بدفعة أخرى.','err'); }
    const specialties = specialtyResult.data || [];
    const requiresSpecialty = (specialties || []).length > 1 && !acc?.specialty_id && acc?.membership_status !== 'active';
    const profileIncomplete = !acc || (acc.membership_status !== 'active' && (!acc.registration_number || !acc.phone || !acc.certificate_name || !acc.sash_name));
    if (profileIncomplete || requiresSpecialty) {
      const list = specialties || [];
      const specialtyField = list.length > 1 ? `<label>التخصص<select id="graduateLinkSpecialty" class="input" required><option value="">اختر تخصصك</option>${list.map((sp) => `<option value="${esc(sp.id)}" ${acc?.specialty_id === sp.id ? 'selected' : ''}>${esc(isFrench(bridge) ? (sp.name_fr || sp.name) : sp.name)}</option>`).join('')}</select></label>` : '';
      const fullName = acc?.full_name || s.user.user_metadata?.full_name || '';
      const root = modal(bridge, `<div class="modal-head"><h3>${acc ? 'استكمال بيانات الخريج' : 'بيانات الخريج والتخصص'}</h3><button class="icon-btn" data-close>×</button></div><div class="modal-body"><p class="graduate-muted">أكمل بياناتك واختر تخصصك قبل الانتقال إلى الدفع. ستُستخدم الأسماء كما كتبتها في ملف الخريج وقائمة التخصص.</p><label>الاسم الكامل<input id="graduateLinkName" class="input" value="${esc(fullName)}" autocomplete="name" maxlength="160" required></label><label>البريد الإلكتروني<input class="input" type="email" value="${esc(s.user.email || '')}" dir="ltr" disabled></label><label>رقم التسجيل الجامعي<input id="graduateLinkReg" class="input" dir="ltr" value="${esc(acc?.registration_number || '')}" maxlength="40" required></label><label>رقم الهاتف<input id="graduateLinkPhone" class="input" type="tel" dir="ltr" value="${esc(acc?.phone || '')}" autocomplete="tel" maxlength="30" required></label><label>الاسم على شهادة التكريم<input id="graduateLinkCertificate" class="input" value="${esc(acc?.certificate_name || '')}" maxlength="160" required></label><label>الاسم على الوشاح<input id="graduateLinkSash" class="input" value="${esc(acc?.sash_name || '')}" maxlength="160" required></label>${specialtyField}<div class="graduate-actions"><button id="graduateLinkSubmit" class="btn btn-primary">حفظ ومتابعة إلى الدفع</button></div></div>`);
      root.querySelector('#graduateLinkSubmit').addEventListener('click', async () => {
        const selectedSpecialty = list.length === 1 ? list[0].id : root.querySelector('#graduateLinkSpecialty')?.value || null;
        const full_name = root.querySelector('#graduateLinkName').value.trim(), registration_number = root.querySelector('#graduateLinkReg').value.trim(), phone = root.querySelector('#graduateLinkPhone').value.trim(), certificate_name = root.querySelector('#graduateLinkCertificate').value.trim(), sash_name = root.querySelector('#graduateLinkSash').value.trim();
        if (full_name.length < 2 || !registration_number || phone.length < 6 || phone.length > 30 || certificate_name.length < 2 || sash_name.length < 2) return notify(bridge, 'أكمل الاسم ورقم التسجيل والهاتف واسمي الشهادة والوشاح قبل المتابعة.', 'err');
        if (list.length > 1 && !selectedSpecialty) return notify(bridge, 'اختر تخصصك قبل المتابعة.', 'err');
        const { error } = await bridge.db.rpc('register_graduate', { _promotion_id: bridge.tenant.id, _full_name: full_name, _registration_number: registration_number, _phone: phone, _specialty_id: selectedSpecialty, _certificate_name: certificate_name, _sash_name: sash_name });
        if (error) return notify(bridge, error.message.includes('SPECIALTY_NOT_IN_PROMOTION') ? 'التخصص المختار لا يتبع هذه الدفعة.' : error.message.includes('ACCOUNT_PROMOTION_MISMATCH') ? 'هذا الحساب مرتبط بدفعة أخرى.' : error.message, 'err');
        root.remove(); openGraduateSpace(bridge);
      });
      return;
    }
    const root = modal(bridge, `<div class="modal-head"><h3>مساحة الخريج</h3><button class="icon-btn" aria-label="إغلاق" data-close>×</button></div><div class="modal-body graduate-content"><p class="graduate-muted">جاري التحميل...</p></div>`);
    try { await renderSpace(bridge, root, acc); } catch (e) { root.querySelector('.graduate-content').innerHTML = `<p class="graduate-muted">تعذر تحميل المساحة: ${esc(e.message)}</p>`; }
  }
  async function openGraduateAdmin(bridge) {
    const s = await session(bridge);
    if (!s) return notify(bridge, 'يجب تسجيل الدخول بحساب مسؤول الدفعة.', 'err');
    const [head, finance, night] = await Promise.all([
      bridge.db.rpc('can_manage_graduate_role', { _promotion_id: bridge.tenant.id, _role: 'super_admin' }),
      bridge.db.rpc('can_manage_graduate_role', { _promotion_id: bridge.tenant.id, _role: 'finance' }),
      bridge.db.rpc('can_manage_graduate_role', { _promotion_id: bridge.tenant.id, _role: 'night_event' })
    ]);
    const isHead = head.data === true, financePermission = finance.data === true, nightPermission = night.data === true;
    if (!isHead && !financePermission && !(bridge.state?.promo?.night_event_enabled !== false && nightPermission)) return notify(bridge, 'لا تملك صلاحية إدارة هذه الدفعة.', 'err');
    const canManageFinance = isHead || financePermission;
    const nightEnabled = bridge.state?.promo?.night_event_enabled !== false;
    const canManageNight = nightEnabled && (isHead || nightPermission);
    const root = modal(bridge, `<div class="modal-head"><h3>إدارة العضوية والفعاليات</h3><button class="icon-btn" aria-label="إغلاق" data-close>×</button></div><div class="modal-body graduate-content"><p class="graduate-muted">جاري التحميل...</p></div>`);
    const promotionId = bridge.tenant.id;
    const canAssignStaff = isHead;
    const [financeData, staffResult] = await Promise.all([
      canManageFinance ? Promise.all([
        bridge.db.from('subscription_requests').select('id,account_id,amount,status,proof_path,rejection_reason,created_at').eq('promotion_id', promotionId).order('created_at', { ascending: false }).limit(50),
        bridge.db.from('promotion_financial_totals').select('*').eq('promotion_id', promotionId).maybeSingle(),
        bridge.db.from('subscription_settings').select('*').eq('promotion_id', promotionId).maybeSingle(),
        bridge.db.from('payment_banks').select('*').eq('promotion_id', promotionId).order('is_active', { ascending: false }).order('bank_name')
      ]) : Promise.resolve([{ data: [] }, { data: null }, { data: null }, { data: [] }]),
      canAssignStaff ? bridge.db.rpc('platform_list_promotion_staff', { _promotion_id: promotionId }) : Promise.resolve({ data: [] })
    ]);
    const [requestsResult, totalsResult, settingsResult, banksResult] = financeData;
    const requests = requestsResult.data || [], totals = totalsResult.data, settings = settingsResult.data, banks = banksResult.data || [], staff = (staffResult.data || []).filter((item) => nightEnabled || item.role !== 'night_event');
    root.querySelector('.graduate-content').innerHTML = `<div class="graduate-admin-hero"><h4>إدارة اشتراكات وفعاليات الدفعة</h4><p>إعدادات الاشتراك، مراجعة الإثباتات، ومتابعة الإيرادات من مكان واحد. بيانات هذه الشاشة خاصة بالدفعة الحالية.</p></div><div class="graduate-admin-stack">${canManageFinance ? `<section class="graduate-card"><h4>إعداد الاشتراك والبنوك</h4><div class="graduate-grid"><label>المبلغ<input id="graduateSettingsAmount" class="input" type="number" min="0" step="0.01" value="${esc(settings?.amount ?? 0)}"></label><label>العملة<input id="graduateSettingsCurrency" class="input" maxlength="8" value="${esc(settings?.currency || 'MRU')}"></label></div>${isHead ? `<div class="graduate-grid"><label>موعد بدء استقبال الدفع<input id="graduatePaymentStartsAt" class="input" type="datetime-local" value="${esc(localDateTimeInput(settings?.payment_starts_at))}"></label></div>${bridge.state?.me?.is_platform ? `<label><input id="graduatePaymentDelegated" type="checkbox" ${settings?.payment_start_delegated ? 'checked' : ''}> تفويض رئيس الدفعة لتحديد الموعد</label>` : ''}<p class="graduate-muted">يُطبّق الموعد على هذه الدفعة فقط، ولا يمكن إرسال دفعة قبل حلوله. اتركه فارغاً لفتح الدفع مباشرة.</p>` : ''}<div class="graduate-actions"><button id="graduateSettingsSave" class="btn btn-primary btn-sm">حفظ إعدادات الاشتراك</button></div><hr><div class="graduate-grid"><label>اسم البنك<input id="graduateBankName" class="input" maxlength="120" autocomplete="organization"></label><label>رقم الحساب<input id="graduateBankAccount" class="input" dir="ltr" maxlength="120" autocomplete="off"></label></div><div id="graduateBankPreview" class="graduate-bank-preview" aria-live="polite"><strong>معاينة الحساب البنكي</strong><bdi dir="ltr">—</bdi></div><div class="graduate-actions"><button id="graduateBankAdd" class="btn btn-primary btn-sm">إضافة البنك</button><button id="graduateBankCancelEdit" class="btn btn-ghost btn-sm" hidden>إلغاء التعديل</button></div><div id="graduateBankList">${banks.map((b) => `<div class="graduate-bank-row" data-bank-row="${esc(b.id)}"><div><b>${esc(b.bank_name)}</b><small dir="ltr">${esc(b.account_number)}</small><span class="graduate-status ${b.is_active ? 'active' : 'pending'}">${b.is_active ? 'مفعّل' : 'موقوف'}</span></div><div class="graduate-actions"><button class="btn btn-ghost btn-sm" data-bank-edit="${esc(b.id)}">تعديل</button><button class="btn btn-danger btn-sm" data-bank-delete="${esc(b.id)}">${b.is_active ? 'حذف / إيقاف' : 'حذف نهائي'}</button></div></div>`).join('') || '<p class="graduate-muted">لا توجد حسابات بنكية بعد.</p>'}</div></section><section class="graduate-card"><h4>الملخص المالي</h4><div class="graduate-finance-summary"><div class="graduate-finance-stat"><span>الاشتراكات المقبولة</span><b>${esc(totals?.confirmed_subscriptions ?? 0)}</b></div><div class="graduate-finance-stat"><span>عدد الدافعين</span><b>${esc(totals?.confirmed_payers ?? 0)}</b></div><div class="graduate-finance-stat"><span>المداخيل الأخرى</span><b>${esc(totals?.other_income ?? 0)}</b></div><div class="graduate-finance-stat"><span>المصاريف</span><b>${esc(totals?.expenses ?? 0)}</b></div></div></section><section class="graduate-card"><h4>طلبات الاشتراك</h4><div id="graduateRequests">${(requests || []).map((r) => `<div class="graduate-card graduate-request" data-request="${esc(r.id)}"><p><b>${esc(r.amount)}</b> · <span class="graduate-status ${esc(r.status)}">${esc(r.status === 'approved' ? 'مقبول' : r.status === 'rejected' ? 'مرفوض' : 'قيد المراجعة')}</span></p><p class="graduate-muted">${esc(new Date(r.created_at).toLocaleString())}</p><div class="graduate-actions">${r.proof_path ? `<button class="btn btn-ghost btn-sm" data-proof="${esc(r.proof_path)}">عرض الإثبات</button>` : ''}${r.status === 'pending' ? `<button class="btn btn-primary btn-sm" data-approve="${esc(r.id)}">قبول</button><button class="btn btn-danger btn-sm" data-reject="${esc(r.id)}">رفض</button>` : ''}</div></div>`).join('') || '<p class="graduate-muted">لا توجد طلبات اشتراك حالياً.</p>'}</div></section>` : ''}${canAssignStaff ? `<section class="graduate-card"><h4>تعيين مسؤول للدفعة</h4><p class="graduate-staff-note">يجب أن يكون للشخص حساب مسجل مسبقاً في الموقع بهذا البريد الإلكتروني. اختر الصلاحية المناسبة؛ التعيين يخص هذه الدفعة فقط.</p><div class="graduate-grid"><label>بريد الحساب<input id="graduateStaffEmail" class="input" type="email" dir="ltr" autocomplete="email" placeholder="name@example.com"></label><label>المسؤولية<select id="graduateStaffRole" class="input"><option value="finance">مسؤول المالية والاشتراكات</option>${nightEnabled ? '<option value="night_event">مسؤول الحفل الليلي</option>' : ''}</select></label></div><div id="graduateStaffPreview" class="graduate-bank-preview" aria-live="polite"><strong>معاينة المسؤول</strong><bdi dir="ltr">أدخل البريد الإلكتروني</bdi></div><div class="graduate-actions"><button id="graduateStaffAssign" class="btn btn-primary btn-sm">تعيين المسؤول</button></div><div id="graduateStaffList">${staff.map((item) => `<div class="graduate-staff-row" data-staff-row="${esc(item.user_id)}" data-role="${esc(item.role)}"><div><b>${esc(item.full_name || item.email || 'مسؤول')}</b><small dir="ltr">${esc(item.email || '')}</small><span class="graduate-status ${item.is_active ? 'active' : 'pending'}">${item.role === 'finance' ? 'مسؤول المالية' : 'مسؤول الحفل الليلي'}${item.is_active ? '' : ' — غير نشط'}</span></div>${item.is_active ? `<div class="graduate-actions"><select class="input" data-staff-role="${esc(item.user_id)}" aria-label="تغيير صلاحية ${esc(item.full_name || item.email)}"><option value="finance" ${item.role === 'finance' ? 'selected' : ''}>مسؤول المالية</option>${nightEnabled ? `<option value="night_event" ${item.role === 'night_event' ? 'selected' : ''}>مسؤول الحفل الليلي</option>` : ''}</select><button class="btn btn-ghost btn-sm" data-staff-update="${esc(item.user_id)}" data-current-role="${esc(item.role)}">حفظ الصلاحية</button><button class="btn btn-danger btn-sm" data-staff-remove="${esc(item.user_id)}" data-current-role="${esc(item.role)}">حذف المسؤول</button></div>` : ''}</div>`).join('') || '<p class="graduate-muted">لم يتم تعيين مسؤولين لهذه الدفعة بعد.</p>'}</div></section>` : ''}${canManageNight ? `<section class="graduate-card"><h4>تحقق بطاقة الحفل الليلي</h4><p class="graduate-muted">شغّل الكاميرا لمسح QR أو أدخل رمز البطاقة يدوياً؛ يتم التحقق داخل إجراء آمن على الخادم.</p><input id="graduateNightToken" class="input" dir="ltr" placeholder="رمز البطاقة"><div class="graduate-actions"><button id="graduateNightScan" class="btn btn-ghost">فتح الكاميرا</button><button class="btn btn-primary" id="graduateNightRedeem">تحقق واستخدام</button></div><p id="graduateNightResult" class="graduate-muted" aria-live="polite"></p></section>` : ''}</div>`;
    root.querySelector('#graduateSettingsSave')?.addEventListener('click', async () => { const payload = { promotion_id: promotionId, amount: Number(root.querySelector('#graduateSettingsAmount').value || 0), currency: root.querySelector('#graduateSettingsCurrency').value.trim().toUpperCase(), updated_by: s.user.id }; const { error:settingsError } = await bridge.db.from('subscription_settings').upsert(payload, { onConflict: 'promotion_id' }); if (settingsError) return notify(bridge, settingsError.message, 'err'); const startField=root.querySelector('#graduatePaymentStartsAt'); if (startField) { const starts_at=startField.value ? new Date(startField.value).toISOString() : null; const schedule=bridge.state?.me?.is_platform ? await bridge.db.rpc('update_payment_schedule',{_promotion_id:promotionId,_starts_at:starts_at,_delegate_to_batch:!!root.querySelector('#graduatePaymentDelegated')?.checked}) : await bridge.db.rpc('update_payment_start_by_batch',{_promotion_id:promotionId,_starts_at:starts_at}); if(schedule.error) return notify(bridge,schedule.error.message.includes('PAYMENT_SCHEDULE_NOT_DELEGATED')?'لم يمنح المشرف الرئيسي صلاحية تحديد الموعد.':schedule.error.message,'err'); } notify(bridge, 'تم حفظ إعدادات الاشتراك وموعد الدفع.', 'success'); });
    translateElement(bridge, root.querySelector('.graduate-content'));
    let editingBankId = null;
    const bankNameInput = root.querySelector('#graduateBankName'), bankAccountInput = root.querySelector('#graduateBankAccount');
    const showBankPreview = () => { root.querySelector('#graduateBankPreview').innerHTML = `<strong>${esc(bankNameInput.value.trim() || 'معاينة الحساب البنكي')}</strong><bdi dir="ltr">${esc(bankAccountInput.value.trim() || '—')}</bdi>`; };
    bankNameInput.addEventListener('input', showBankPreview); bankAccountInput.addEventListener('input', showBankPreview);
    root.querySelector('#graduateBankCancelEdit').addEventListener('click', () => { editingBankId = null; bankNameInput.value = ''; bankAccountInput.value = ''; root.querySelector('#graduateBankAdd').textContent = 'إضافة البنك'; root.querySelector('#graduateBankCancelEdit').hidden = true; showBankPreview(); });
    root.querySelector('#graduateBankAdd')?.addEventListener('click', async () => { const bank_name=bankNameInput.value.trim(), account_number=bankAccountInput.value.trim(); if (bank_name.length < 2 || account_number.length < 3) return notify(bridge, 'أدخل اسم بنك ورقم حساب صحيحين؛ تتم معاينتهما قبل الحفظ.', 'err'); const query = editingBankId ? bridge.db.from('payment_banks').update({ bank_name, account_number, updated_at: new Date().toISOString() }).eq('id', editingBankId).eq('promotion_id', promotionId) : bridge.db.from('payment_banks').insert({ promotion_id: promotionId, bank_name, account_number }); const { error } = await query; if (error) notify(bridge, error.message, 'err'); else { notify(bridge, editingBankId ? 'تم تحديث بيانات البنك.' : 'تمت إضافة البنك.', 'success'); root.remove(); openGraduateAdmin(bridge); } });
    root.querySelectorAll('[data-bank-edit]').forEach((button) => button.addEventListener('click', () => { const bank = banks.find((item) => item.id === button.dataset.bankEdit); if (!bank) return; editingBankId = bank.id; bankNameInput.value = bank.bank_name; bankAccountInput.value = bank.account_number; root.querySelector('#graduateBankAdd').textContent = 'حفظ تعديل البنك'; root.querySelector('#graduateBankCancelEdit').hidden = false; showBankPreview(); bankNameInput.focus(); }));
    root.querySelectorAll('[data-bank-delete]').forEach((button) => button.addEventListener('click', async () => { const bankId = button.dataset.bankDelete; if (!window.confirm('تأكيد حذف / إيقاف هذا الحساب البنكي؟')) return; const { count, error: usageError } = await bridge.db.from('subscription_requests').select('id', { count: 'exact', head: true }).eq('bank_id', bankId).limit(1); if (usageError) return notify(bridge, usageError.message, 'err'); const result = count ? await bridge.db.from('payment_banks').update({ is_active: false, updated_at: new Date().toISOString() }).eq('id', bankId).eq('promotion_id', promotionId) : await bridge.db.from('payment_banks').delete().eq('id', bankId).eq('promotion_id', promotionId); if (result.error) return notify(bridge, result.error.message, 'err'); notify(bridge, count ? 'أوقف البنك مع حفظ مرجعه في سجل المدفوعات السابقة.' : 'تم حذف الحساب البنكي.', 'success'); root.remove(); openGraduateAdmin(bridge); }));
    const updateStaffPreview = () => { const role = root.querySelector('#graduateStaffRole').value, email = root.querySelector('#graduateStaffEmail').value.trim(); root.querySelector('#graduateStaffPreview').innerHTML = `<strong>${role === 'finance' ? 'مسؤول المالية' : 'مسؤول الحفل الليلي'}</strong><bdi dir="ltr">${esc(email || 'أدخل البريد الإلكتروني')}</bdi>`; };
    root.querySelector('#graduateStaffEmail')?.addEventListener('input', updateStaffPreview); root.querySelector('#graduateStaffRole')?.addEventListener('change', updateStaffPreview);
    root.querySelector('#graduateStaffAssign')?.addEventListener('click', async () => { const email=root.querySelector('#graduateStaffEmail').value.trim(); const role=root.querySelector('#graduateStaffRole').value; if (!email) return notify(bridge, 'أدخل البريد الإلكتروني للحساب المسجل.', 'err'); const { error }=await bridge.db.rpc('platform_assign_promotion_staff', { _promotion_id: promotionId, _email: email, _role: role, _specialty_id: null }); if (error) return notify(bridge, error.message.includes('USER_NOT_FOUND') ? 'لم يُعثر على حساب بهذا البريد. اطلب من الشخص إنشاء حساب أولاً.' : error.message, 'err'); notify(bridge, role === 'finance' ? 'تم تعيين مسؤول المالية لهذه الدفعة.' : 'تم تعيين مسؤول الحفل الليلي لهذه الدفعة.', 'success'); root.remove(); openGraduateAdmin(bridge); });
    root.querySelectorAll('[data-staff-update]').forEach((button) => button.addEventListener('click', async () => { const newRole = root.querySelector(`[data-staff-role="${button.dataset.staffUpdate}"]`).value; const { error } = await bridge.db.rpc('platform_update_promotion_staff', { _promotion_id: promotionId, _user_id: button.dataset.staffUpdate, _current_role: button.dataset.currentRole, _new_role: newRole }); if (error) return notify(bridge, error.message, 'err'); notify(bridge, 'تم تحديث صلاحية المسؤول.', 'success'); root.remove(); openGraduateAdmin(bridge); }));
    root.querySelectorAll('[data-staff-remove]').forEach((button) => button.addEventListener('click', async () => { if (!window.confirm('تأكيد حذف صلاحية هذا المسؤول من الدفعة؟')) return; const { error } = await bridge.db.rpc('platform_remove_promotion_staff', { _promotion_id: promotionId, _user_id: button.dataset.staffRemove, _role: button.dataset.currentRole }); if (error) return notify(bridge, error.message, 'err'); notify(bridge, 'تم حذف صلاحية المسؤول عن هذه الدفعة.', 'success'); root.remove(); openGraduateAdmin(bridge); }));
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
    const button = document.createElement('a'); button.id='graduateEntryButton'; button.className='btn btn-ghost btn-sm graduate-entry'; button.textContent=isFrench(bridge)?'Espace diplômé':'مساحة الخريج'; button.href=graduateUrl().toString(); button.setAttribute('aria-label',isFrench(bridge)?'Accéder à l’espace diplômé':'الانتقال مباشرة إلى مساحة الخريج'); button.addEventListener('click', (event) => { if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return; event.preventDefault(); history.pushState(history.state, '', button.href); openGraduateSpace(bridge); });
    const anchor = document.getElementById('btnLoginText'); anchor?.parentNode?.insertBefore(button, anchor); if (!anchor) header.appendChild(button);
    const adminButton = document.createElement('button'); adminButton.id='graduateAdminButton'; adminButton.type='button'; adminButton.className='btn btn-ghost btn-sm graduate-entry'; adminButton.textContent='إدارة العضويات'; adminButton.hidden = true; adminButton.addEventListener('click', () => openGraduateAdmin(bridge));
    adminButton.textContent=isFrench(bridge)?'Administration de la promotion':'لوحة مسؤول الدفعة'; adminButton.setAttribute('aria-label',isFrench(bridge)?'Gérer les fonctions autorisées de la promotion':'إدارة وظائف الدفعة بحسب الصلاحية');
    anchor?.parentNode?.insertBefore(adminButton, anchor);
    const sync = async () => {
      adminButton.hidden = true;
      try {
        const s = await session(bridge); if (!s) return;
        const [head, finance, night] = await Promise.all([
          bridge.db.rpc('can_manage_graduate_role', { _promotion_id: bridge.tenant.id, _role: 'super_admin' }),
          bridge.db.rpc('can_manage_graduate_role', { _promotion_id: bridge.tenant.id, _role: 'finance' }),
          bridge.db.rpc('can_manage_graduate_role', { _promotion_id: bridge.tenant.id, _role: 'night_event' })
        ]);
        const isHead = head.data === true;
        const permitted = isHead || finance.data === true || (bridge.state?.promo?.night_event_enabled !== false && night.data === true);
        adminButton.hidden = !permitted;
        if (head.error || finance.error || night.error) adminButton.hidden = true;
      } catch (_) { adminButton.hidden = true; }
    };
    sync();
    const syncLanguage=()=>{ button.textContent=isFrench(bridge)?'Espace diplômé':'مساحة الخريج'; button.setAttribute('aria-label',isFrench(bridge)?'Accéder à l’espace diplômé':'الانتقال مباشرة إلى مساحة الخريج'); adminButton.textContent=isFrench(bridge)?'Administration de la promotion':'لوحة مسؤول الدفعة'; adminButton.setAttribute('aria-label',isFrench(bridge)?'Gérer les fonctions autorisées de la promotion':'إدارة وظائف الدفعة بحسب الصلاحية'); document.querySelectorAll('.graduate-modal').forEach((node)=>translateElement(bridge,node)); };
    new MutationObserver(syncLanguage).observe(document.documentElement,{attributes:true,attributeFilter:['lang']});
    bridge.db.auth.onAuthStateChange(() => setTimeout(sync, 0));
    const syncRoute = () => {
      const active = new URLSearchParams(location.search).get('graduate') === '1';
      if (!active) { document.querySelectorAll('.graduate-modal').forEach((node) => node.remove()); return; }
      if (!document.querySelector('.graduate-modal')) openGraduateSpace(bridge);
    };
    window.addEventListener('popstate', syncRoute);
    if (new URLSearchParams(location.search).get('graduate') === '1') { document.documentElement.classList.remove('graduate-direct-pending'); openGraduateSpace(bridge); }
  }
  addStyle(); wait((bridge) => { addEntry(bridge); });
})();
