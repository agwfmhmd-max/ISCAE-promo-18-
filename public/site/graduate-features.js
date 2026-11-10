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
    .graduate-report-item{margin-top:14px;padding:clamp(14px,3vw,22px);border:1px solid var(--stroke);border-radius:20px;background:linear-gradient(160deg,var(--surface-solid),var(--bg));box-shadow:0 18px 42px -34px rgba(16,39,68,.55)}
    .graduate-report-header{display:flex;align-items:center;justify-content:space-between;gap:12px;padding-bottom:14px;border-bottom:1px solid var(--stroke)}.graduate-report-header strong{display:block;margin-top:4px;font-size:18px;font-weight:900;color:var(--text)}.graduate-report-seal{padding:7px 11px;border-radius:999px;background:#ddf5e8;color:#166534;font-size:12px;font-weight:900;white-space:nowrap}.graduate-report-notes{padding:10px 13px;border-radius:13px;background:var(--violet-50);color:var(--text)}
    .graduate-report-kpis{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:9px;margin:14px 0}.graduate-report-kpis>div{min-width:0;padding:12px;border:1px solid var(--stroke);border-radius:14px;background:var(--surface-solid)}.graduate-report-kpis small{display:block;min-height:2.4em;color:var(--muted);font-size:11px;line-height:1.5}.graduate-report-kpis b{display:block;margin-top:6px;color:var(--text);font-size:clamp(14px,2.5vw,19px);overflow-wrap:anywhere}.graduate-report-kpis .net{border-color:color-mix(in srgb,var(--accent,#c5a253) 55%,var(--stroke));background:linear-gradient(135deg,var(--violet-50),var(--surface-solid))}
    .graduate-report-sections{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,290px),1fr));gap:14px}.graduate-report-sections>section{min-width:0}.graduate-report-sections h5{margin:8px 0;font-size:14px;font-weight:900;color:var(--text)}.graduate-report-line{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:10px;align-items:center;margin-top:8px;padding:12px;border:1px solid var(--stroke);border-inline-start:4px solid #24855b;border-radius:13px;background:var(--surface-solid)}.graduate-report-line.expense{border-inline-start-color:#d85858}.graduate-report-line-copy{min-width:0}.graduate-report-kind{display:inline-block;margin-inline-end:7px;padding:3px 8px;border-radius:999px;background:#ddf5e8;color:#166534;font-size:10px;font-weight:800}.graduate-report-line.expense .graduate-report-kind{background:#fee2e2;color:#991b1b}.graduate-report-line-copy>strong{font-size:13px}.graduate-report-line-copy p{margin:3px 0;font-size:12px}.graduate-report-line-copy small{color:var(--muted);font-size:11px}.graduate-report-amount{font-size:14px;white-space:nowrap;color:var(--text)}.graduate-invoice-link{grid-column:1/-1;display:flex;align-items:center;gap:9px;width:max-content;max-width:100%;color:var(--primary);font-size:12px;font-weight:800;text-decoration:none}.graduate-invoice-thumb{width:62px;height:62px;object-fit:cover;border:1px solid var(--stroke);border-radius:11px;transition:transform .18s ease}.graduate-invoice-link:hover .graduate-invoice-thumb{transform:scale(1.04)}.graduate-report-income-preview{margin:12px 0;padding:14px 16px;border:1px solid color-mix(in srgb,var(--accent,#c5a253) 55%,var(--stroke));border-radius:15px;background:linear-gradient(110deg,var(--violet-50),var(--surface-solid));color:var(--text);line-height:1.8}.graduate-report-income-preview b{font-size:18px}
    @media(max-width:700px){.graduate-report-kpis{grid-template-columns:repeat(2,minmax(0,1fr))}}
    .dark .graduate-report-item,.dark .graduate-report-kpis>div,.dark .graduate-report-line{background:#111c2b;border-color:#33445c}.dark .graduate-report-header strong,.dark .graduate-report-sections h5,.dark .graduate-report-amount{color:#f3f7fb}.dark .graduate-report-notes,.dark .graduate-report-income-preview{background:#1b2a3e;border-color:#40546d;color:#e5edf7}
    @media(max-width:560px){.graduate-modal{width:calc(100vw - 14px)!important;max-height:94dvh!important;border-radius:18px!important}.graduate-modal .modal-head{padding:16px!important}.graduate-modal .modal-body{max-height:calc(94dvh - 72px)!important;padding:14px!important}.graduate-intro{align-items:flex-start;padding:13px}.graduate-photo-list{grid-template-columns:repeat(3,minmax(0,1fr))}.graduate-actions .btn{flex:1 1 auto}.graduate-bank-row,.graduate-staff-row{grid-template-columns:1fr}.graduate-admin-hero{padding:18px}}
    .graduate-direct-pending #pagePublic,.graduate-direct-pending #pageDash{visibility:hidden}
    .dark .graduate-modal .modal-body{background:#101827!important;color:#e5edf7!important}.dark .graduate-card,.dark .graduate-auth-card,.dark .graduate-table td{background:#182435!important;color:#e5edf7!important;border-color:#33445c!important}.dark .graduate-card h4,.dark .graduate-card label,.dark .graduate-finance-stat b{color:#f3f7fb!important}.dark .graduate-muted,.dark .graduate-step span{color:#a9b8ca!important}.dark .graduate-admin-tabs button{background:#1b2a3e!important;color:#d8e5f2!important;border-color:#40546d!important}.dark .graduate-file,.dark .graduate-bank-row,.dark .graduate-staff-row{background:#111c2b!important;border-color:#33445c!important}
    @media(prefers-reduced-motion:reduce){.graduate-entry,.graduate-entry:hover{transition:none!important;transform:none!important}}
  `;
  const addStyle = () => { if (!document.getElementById('graduate-features-style')) { const s=document.createElement('style'); s.id='graduate-features-style'; s.textContent=css; document.head.appendChild(s); } };

  const FR = new Map(Object.entries({
    'مساحة الخريج':'Espace diplômé','إدارة العضويات':'Gestion des adhésions','لوحة مسؤول الدفعة':'Administration de la promotion','إدارة العضوية والفعاليات':'Administration des adhésions et événements',
    'أنشئ حسابًا مرتبطًا بهذه الدفعة أو سجّل الدخول لمتابعة اشتراكك وذكرياتك وبطاقاتك.':'Créez un compte lié à cette promotion ou connectez-vous pour suivre votre adhésion, vos souvenirs et vos cartes.',
    'دخول':'Connexion','إنشاء حساب':'Créer un compte','الاسم الكامل':'Nom complet','البريد الإلكتروني':'Adresse e-mail','كلمة المرور':'Mot de passe','متابعة':'Continuer','إلغاء':'Annuler','تأكيد كلمة المرور الجديدة':'Confirmez le nouveau mot de passe','تسجيل الدخول':'Connexion','تحقق من رقم التسجيل قبل متابعة إنشاء الحساب.':'Vérifiez votre numéro d’inscription avant de créer le compte.','أكمل رقم الهاتف واسمي شهادة التكريم والوشاح (2–160 حرفًا) قبل المتابعة.':'Renseignez le téléphone et les noms du certificat et de l’écharpe (2 à 160 caractères).','تأكيد كلمة المرور غير مطابق.':'La confirmation du mot de passe ne correspond pas.','أكمل رقم الهاتف واسمي شهادة التكريم والوشاح قبل إنشاء الحساب.':'Renseignez le téléphone et les noms du certificat et de l’écharpe avant de créer le compte.','تم إنشاء الحساب لكن تعذر حفظ بيانات الخريج تلقائيًا؛ أكملها في نموذج ملفك قبل الدفع.':'Compte créé, mais les informations du diplômé n’ont pas pu être enregistrées automatiquement. Complétez votre profil avant le paiement.',
    'أدخل الاسم الكامل والبريد وكلمة مرور من 6 أحرف على الأقل عند إنشاء الحساب.':'Saisissez votre nom complet, votre e-mail et un mot de passe d’au moins 6 caractères pour créer un compte.','ستُستخرج بيانات الاسم والتخصص من قائمة خريجي الدفعة بعد إدخال رقم التسجيل.':'Votre nom et votre spécialité seront extraits de la liste des diplômés après la saisie du numéro d’inscription.',
    'جارٍ إنشاء الحساب…':'Création du compte…','جارٍ تسجيل الدخول…':'Connexion…','تعذّر إنشاء الحساب.':'Impossible de créer le compte.','إرسال إثبات الدفع':'Envoyer une preuve de paiement','المبلغ المطلوب:':'Montant dû :','البنك':'Banque','المبلغ المدفوع':'Montant payé','صورة إثبات الدفع':'Preuve de paiement','إرسال الطلب':'Envoyer la demande','اختر البنك والمبلغ وارفع إثبات الدفع.':'Choisissez une banque, indiquez le montant et téléversez le justificatif.','تم إرسال طلب الاشتراك إلى مسؤول المالية.':'La demande d’adhésion a été envoyée au responsable financier.',
    'إضافة ذكرى':'Ajouter un souvenir','يمكنك رفع':'Vous pouvez ajouter','صورة إضافية.':'photo(s) supplémentaire(s).','الصورة':'Photo','الوصف':'Description','الخصوصية':'Confidentialité','المشتركون':'Membres','خاصة':'Privée','العامة':'Publique','حفظ':'Enregistrer','حفظ ومتابعة إلى الدفع':'Enregistrer et passer au paiement',
    'أكمل بياناتك واختر تخصصك قبل الانتقال إلى الدفع. ستُستخدم الأسماء كما كتبتها في ملف الخريج وقائمة التخصص.':'Complétez vos informations et choisissez votre spécialité avant le paiement. Les noms saisis seront utilisés dans votre profil et sur les documents.',
    'رقم التسجيل الجامعي':'Numéro d’inscription universitaire','رقم الهاتف':'Téléphone','الاسم على شهادة التكريم':'Nom sur le certificat de reconnaissance','الاسم على الوشاح':'Nom sur l’écharpe','التخصص':'Spécialité','اختر تخصصك':'Choisissez votre spécialité','التحقق من رقم التسجيل':'Vérifier le numéro d’inscription','أدخل رقم تسجيلك للتحقق من بياناتك وتخصصك المسجلين لدى الدفعة، ثم أكمل اسمي الشهادة والوشاح ورقم الهاتف.':'Saisissez votre numéro d’inscription pour vérifier votre identité et spécialité dans la liste, puis complétez les noms du certificat et de l’écharpe ainsi que votre téléphone.','لم نعثر على رقم التسجيل في قائمة خريجي هذه الدفعة. تحقق من الرقم أو تواصل مع الإدارة.':'Numéro introuvable dans la liste des diplômés de cette promotion. Vérifiez-le ou contactez l’administration.','التقارير المالية المنشورة':'Rapports financiers publiés','التقرير المالي':'Rapport financier','إنشاء مسودة التقرير':'Créer un brouillon de rapport','نشر المسودة':'Publier le brouillon','إضافة بند':'Ajouter une ligne','إضافة بند لمسودة':'Ajouter une ligne au brouillon','العنوان بالعربية':'Titre en arabe','العنوان بالفرنسية':'Titre en français','ملخص التقرير':'Résumé du rapport','إيراد':'Recette','مصروف':'Dépense','الفئة':'Catégorie','المبلغ':'Montant','التاريخ':'Date','الوصف':'Description','إيراد الاشتراكات المقبولة الحالي (يُحفظ تلقائيًا عند النشر):':'Recettes d’adhésions approuvées (enregistrées automatiquement à la publication) :','صورة فاتورة المصروف (اختياري)':'Photo du justificatif de dépense (facultatif)','إيراد الاشتراكات المدفوعة':'Recettes des adhésions payées','إيرادات أخرى':'Autres recettes','المصروفات والفواتير':'Dépenses et justificatifs','الإيرادات الإضافية':'Recettes supplémentaires','إيراد إضافي':'Autre recette','لا توجد مصروفات':'Aucune dépense','لا توجد إيرادات إضافية':'Aucune recette supplémentaire','عرض الفاتورة':'Voir le justificatif','معتمد':'Validé','الصافي':'Solde net',
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
    const rosterMode = bridge.state?.promo?.graduate_roster_uploaded === true;
    const mode = rosterMode ? (root.dataset.existingLogin === 'true' ? 'signin' : 'signup') : (root.querySelector('[name="graduateMode"]:checked')?.value || 'signin');
    const email = root.querySelector('#graduateEmail').value.trim();
    const password = root.querySelector('#graduatePassword').value;
    const fullName = root.querySelector('#graduateName')?.value.trim() || '';
    const phone = root.querySelector('#graduateSignupPhone')?.value.trim() || '';
    const certificateName = root.querySelector('#graduateSignupCertificate')?.value.trim() || '';
    const sashName = root.querySelector('#graduateSignupSash')?.value.trim() || '';
    let verifiedStudent = {};
    try { verifiedStudent = JSON.parse(root.dataset.verifiedStudent || '{}'); } catch (_) {}
    const registrationNumber = mode === 'signup' ? root.querySelector('#graduateSignupRegistration').value.trim().toUpperCase() : '';
    if (mode === 'signup' && (!registrationNumber || root.dataset.verifiedRegistration !== registrationNumber)) return notify(bridge, 'تحقق من رقم التسجيل قبل متابعة إنشاء الحساب.', 'err');
    const confirmation = root.querySelector('#graduatePasswordConfirm')?.value || '';
    if (mode === 'signup' && rosterMode && root.dataset.verifiedStudent === undefined) return notify(bridge, 'تحقق من رقم التسجيل قبل متابعة إنشاء الحساب.', 'err');
    if (mode === 'signup' && rosterMode && (phone.length < 6 || phone.length > 30 || certificateName.length < 2 || certificateName.length > 160 || sashName.length < 2 || sashName.length > 160)) return notify(bridge, 'أكمل رقم الهاتف واسمي شهادة التكريم والوشاح (2–160 حرفًا) قبل المتابعة.', 'err');
    if (mode === 'signup' && rosterMode && password !== confirmation) return notify(bridge, 'تأكيد كلمة المرور غير مطابق.', 'err');
    if (!email || password.length < 6 || (mode === 'signup' && !rosterMode && fullName.length < 2)) return notify(bridge, 'أدخل الاسم الكامل والبريد وكلمة مرور من 6 أحرف على الأقل عند إنشاء الحساب.', 'err');
    const submit = root.querySelector('#graduateAuthSubmit');
    const retryLabel = rosterMode ? (mode === 'signin' ? (isFrench(bridge) ? 'Connexion' : 'دخول') : (isFrench(bridge) ? 'Créer mon compte' : 'إنشاء الحساب')) : (isFrench(bridge) ? 'Continuer' : 'متابعة');
    submit.disabled = true; submit.textContent = mode === 'signup' ? (isFrench(bridge) ? 'Création du compte…' : 'جارٍ إنشاء الحساب…') : (isFrench(bridge) ? 'Connexion…' : 'جارٍ تسجيل الدخول…');
    let result;
    if (mode === 'signup') {
      try {
        const response = await fetch('/api/public/graduate-signup', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, password, full_name: fullName || verifiedStudent.full_name || '', registration_number: registrationNumber, promotion_id: bridge.tenant.id, ...(rosterMode ? { phone, certificate_name: certificateName, sash_name: sashName } : {}), website: root.querySelector('#graduateWebsite').value }) });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok || !payload.session) throw new Error(payload.error || 'تعذّر إنشاء الحساب.');
        result = await bridge.db.auth.setSession({ access_token: payload.session.access_token, refresh_token: payload.session.refresh_token });
      } catch (error) { submit.disabled = false; submit.textContent = retryLabel; return notify(bridge, error.message || 'تعذّر إنشاء الحساب.', 'err'); }
    } else result = await bridge.db.auth.signInWithPassword({ email, password });
    if (result.error) { submit.disabled = false; submit.textContent = retryLabel; return notify(bridge, result.error.message, 'err'); }
    if (mode === 'signup' && rosterMode) {
      const { error: profileError } = await bridge.db.rpc('register_graduate', { _promotion_id: bridge.tenant.id, _full_name: verifiedStudent.full_name || '', _registration_number: registrationNumber, _phone: phone, _specialty_id: verifiedStudent.specialty_id, _certificate_name: certificateName, _sash_name: sashName });
      if (profileError) {
        root.remove();
        try { await openGraduateSpace(bridge); } catch (_) {}
        return notify(bridge, 'تم إنشاء الحساب لكن تعذر حفظ بيانات الخريج تلقائيًا؛ أكملها في نموذج ملفك قبل الدفع.', 'err');
      }
    }
    root.remove(); openGraduateSpace(bridge);
  }
  function authModal(bridge) {
    const root = modal(bridge, `<div class="modal-head"><h3>مساحة الخريج</h3><button class="icon-btn" data-close>×</button></div>
      <div class="modal-body"><p class="graduate-muted">${bridge.state?.promo?.graduate_roster_uploaded === true ? (isFrench(bridge) ? "Commencez par vérifier votre numéro d’inscription dans la liste officielle de la promotion." : "ابدأ بإدخال رقم التسجيل للتحقق من وجودك في القائمة الرسمية للدفعة.") : (isFrench(bridge) ? "Créez un compte lié à cette promotion ou connectez-vous pour suivre votre adhésion et vos souvenirs." : "أنشئ حسابًا مرتبطًا بهذه الدفعة أو سجّل الدخول لمتابعة اشتراكك وذكرياتك وبطاقاتك.")}</p>
      <label class="graduate-mode"><input type="radio" name="graduateMode" value="signin" checked> دخول</label>
      <label class="graduate-mode"><input type="radio" name="graduateMode" value="signup"> إنشاء حساب</label>
      <div id="graduateRegistrationWrap" hidden><label>رقم التسجيل الجامعي<input id="graduateSignupRegistration" class="input" dir="ltr" maxlength="64" autocomplete="off" required></label><div class="graduate-actions"><button type="button" id="graduateCheckRegistration" class="btn btn-ghost">التحقق من رقم التسجيل</button></div><p id="graduateRegistrationCheckMessage" class="graduate-muted" aria-live="polite"></p><div id="graduateVerifiedIdentity" class="graduate-staff-note" hidden></div></div>
      <div id="graduateCredentialsWrap"><div id="graduateNameWrap" hidden><label>الاسم الكامل<input id="graduateName" class="input" autocomplete="name" maxlength="160"></label></div>${bridge.state?.promo?.graduate_roster_uploaded === true ? '<p class="graduate-muted">ستُستخرج بيانات الاسم والتخصص من القائمة الرسمية بعد التحقق من رقم التسجيل.</p><div id="graduateRosterProfileFields" hidden><label>رقم الهاتف<input id="graduateSignupPhone" class="input" type="tel" dir="ltr" autocomplete="tel" maxlength="30"></label><label>الاسم على شهادة التكريم<input id="graduateSignupCertificate" class="input" maxlength="160"></label><label>الاسم على الوشاح<input id="graduateSignupSash" class="input" maxlength="160"></label></div>' : ''}
      <label>البريد الإلكتروني<input id="graduateEmail" class="input" type="email" autocomplete="email"></label>
      <label>كلمة المرور<input id="graduatePassword" class="input" type="password" autocomplete="current-password"></label>
      <input id="graduateWebsite" type="text" autocomplete="off" tabindex="-1" aria-hidden="true" style="position:absolute;inset-inline-start:-10000px" value="">
      <div class="graduate-actions"><button type="button" class="btn btn-primary" id="graduateAuthSubmit">متابعة</button><button type="button" class="btn btn-ghost" data-close>إلغاء</button></div><button type="button" class="btn btn-ghost btn-sm" id="graduateForgotPassword">نسيت كلمة المرور؟</button></div></div>`);
    const rosterMode = bridge.state?.promo?.graduate_roster_uploaded === true;
    if (rosterMode) {
      root.querySelectorAll('.graduate-mode').forEach((node) => { node.hidden = true; });
      root.querySelector('[name=graduateMode][value=signup]').checked = true;
      const password = root.querySelector('#graduatePassword');
      password.setAttribute('autocomplete', 'new-password');
      password.insertAdjacentHTML('afterend', '<label id="graduatePasswordConfirmWrap">تأكيد كلمة المرور الجديدة<input id="graduatePasswordConfirm" class="input" type="password" autocomplete="new-password"></label>');
      root.querySelector('#graduateAuthSubmit').textContent = 'متابعة التحقق وإنشاء الحساب';
      root.querySelector('#graduateForgotPassword').hidden = true;
    }
    const toggle = () => {
      const existingLogin = rosterMode && root.dataset.existingLogin === 'true';
      const mode = existingLogin ? 'signin' : (root.querySelector('[name="graduateMode"]:checked')?.value || 'signin');
      const registration = root.querySelector('#graduateSignupRegistration').value.trim().toUpperCase();
      const verified = !!registration && root.dataset.verifiedRegistration === registration;
      root.querySelector('#graduateRegistrationWrap').hidden = rosterMode ? false : mode !== 'signup';
      root.querySelector('#graduateCredentialsWrap').hidden = rosterMode ? !verified : (mode === 'signup' && !verified);
      root.querySelector('#graduateNameWrap').hidden = rosterMode || mode !== 'signup';
      const profileFields = root.querySelector('#graduateRosterProfileFields');
      if (profileFields) profileFields.hidden = !verified || existingLogin;
      const confirmWrap = root.querySelector('#graduatePasswordConfirmWrap');
      if (confirmWrap) confirmWrap.hidden = existingLogin;
      const password = root.querySelector('#graduatePassword');
      if (password) password.setAttribute('autocomplete', existingLogin ? 'current-password' : 'new-password');
      root.querySelector('#graduateAuthSubmit').textContent = existingLogin ? (isFrench(bridge) ? 'Connexion' : 'دخول') : (rosterMode ? (isFrench(bridge) ? 'Créer mon compte' : 'إنشاء الحساب') : (isFrench(bridge) ? 'Continuer' : 'متابعة'));
      root.querySelector('#graduateForgotPassword').hidden = mode !== 'signin';
    };
    root.querySelectorAll('[name="graduateMode"]').forEach((x) => x.addEventListener('change', toggle));
    root.querySelector('#graduateSignupRegistration').addEventListener('input',()=>{root.dataset.verifiedRegistration='';delete root.dataset.verifiedStudent;root.dataset.existingLogin='false';root.querySelector('#graduateRegistrationCheckMessage').textContent='';root.querySelector('#graduateVerifiedIdentity').hidden=true;toggle();});
    root.querySelector('#graduateCheckRegistration').addEventListener('click',async()=>{
      const registration_number=root.querySelector('#graduateSignupRegistration').value.trim().toUpperCase();
      if(!/^[A-Z0-9-]{1,64}$/.test(registration_number))return notify(bridge,'أدخل رقم تسجيل صالحًا.','err');
      const button=root.querySelector('#graduateCheckRegistration');button.disabled=true;button.textContent='جارٍ التحقق…';
      try{
        const response=await fetch('/api/public/graduate-registration-check',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({promotion_id:bridge.tenant.id,registration_number})});
        const payload=await response.json().catch(()=>({}));
        if(!response.ok||(payload.eligible!==true&&payload.existing_account!==true))throw new Error(payload.message||payload.error||'رقم التسجيل غير متاح لإنشاء الحساب. تحقق منه أو تواصل مع الإدارة.');
        root.dataset.verifiedRegistration=registration_number;
        root.dataset.existingLogin=payload.existing_account===true?'true':'false';
        const student=payload.student||{}; root.dataset.verifiedStudent=JSON.stringify(student); const identity=root.querySelector('#graduateVerifiedIdentity');
        if (identity && rosterMode) { identity.innerHTML=`<strong>${esc(isFrench(bridge)?(student.full_name_fr||student.full_name||''):(student.full_name||student.full_name_fr||''))}</strong><br><span>${esc(isFrench(bridge)?(student.specialty_name_fr||student.specialty_name||''):(student.specialty_name||student.specialty_name_fr||''))}</span><br><small dir="ltr">${esc(student.registration_number||registration_number)}</small>`; identity.hidden=false; }
        root.querySelector('#graduateRegistrationCheckMessage').textContent=payload.existing_account===true?(isFrench(bridge)?'Numéro vérifié. Saisissez l’e-mail et le mot de passe de votre compte.':'تم التحقق؛ هذا الرقم مرتبط بحساب. أدخل البريد وكلمة مرور حسابك لتسجيل الدخول.'):(isFrench(bridge)?'Numéro vérifié. Complétez le téléphone, les noms du certificat et de l’écharpe, puis l’e-mail et un nouveau mot de passe.':'تم التحقق؛ أكمل الهاتف واسمي الشهادة والوشاح ثم البريد وكلمة المرور الجديدة.');toggle();
      }catch(error){root.dataset.verifiedRegistration='';delete root.dataset.verifiedStudent;root.dataset.existingLogin='false';root.querySelector('#graduateVerifiedIdentity').hidden=true;root.querySelector('#graduateRegistrationCheckMessage').textContent=error.message;toggle();}
      finally{button.disabled=false;button.textContent=isFrench(bridge)?'Vérifier le numéro d’inscription':'التحقق من رقم التسجيل';}
    });
    root.querySelector('#graduateAuthSubmit').addEventListener('click', () => signInOrUp(bridge, root));
    root.querySelector('#graduateForgotPassword').addEventListener('click', () => passwordResetRequestModal(bridge));
    toggle();
  }
  function passwordResetRequestModal(bridge, registration='') {
    const root=modal(bridge,`<div class="modal-head"><h3>استعادة كلمة المرور</h3><button class="icon-btn" data-close aria-label="إغلاق">×</button></div><div class="modal-body"><p class="graduate-muted">تتطلب هذه العملية تفعيلًا مسبقًا من المشرف الرئيسي. أدخل رقم التسجيل والبريد الإلكتروني المسجل؛ إذا تطابقت البيانات فسيصلك رابط تحقق، وبعد فتحه ستضع كلمة مرور جديدة وتؤكدها. لن تُحذف معلومات حسابك.</p><label>رقم التسجيل<input id="graduateResetRegistration" class="input" dir="ltr" maxlength="40" value="${esc(registration)}" required></label><label>البريد الإلكتروني المسجل<input id="graduateResetEmail" class="input" type="email" autocomplete="email" required></label><input id="graduateResetWebsite" type="text" autocomplete="off" tabindex="-1" aria-hidden="true" style="position:absolute;inset-inline-start:-10000px" value=""><div class="graduate-actions"><button id="graduateResetRequestSubmit" class="btn btn-primary">إرسال رابط الاستعادة</button><button class="btn btn-ghost" data-close>إلغاء</button></div></div>`);
    root.querySelectorAll('[data-close]').forEach(button=>button.addEventListener('click',()=>root.remove()));
    root.querySelector('#graduateResetRequestSubmit').addEventListener('click',async()=>{
      const registration_number=root.querySelector('#graduateResetRegistration').value.trim().toUpperCase();
      const email=root.querySelector('#graduateResetEmail').value.trim();
      if(!registration_number||!email)return notify(bridge,'أدخل رقم التسجيل والبريد الإلكتروني.','err');
      const button=root.querySelector('#graduateResetRequestSubmit');button.disabled=true;button.textContent='جارٍ التحقق…';
      try{
        const response=await fetch('/api/public/graduate-password-reset',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({promotion_id:bridge.tenant.id,registration_number,email,website:root.querySelector('#graduateResetWebsite').value})});
        const payload=await response.json().catch(()=>({}));
        if(!response.ok)throw new Error(payload.error||'تعذر إرسال الطلب مؤقتًا.');
        root.remove();notify(bridge,payload.message||'إذا كانت البيانات صحيحة فسيصل رابط آمن إلى بريدك المسجل.','success');
      }catch(error){button.disabled=false;button.textContent='إرسال رابط الاستعادة';notify(bridge,error.message||'تعذر إرسال الطلب مؤقتًا.','err');}
    });
  }
  let passwordRecoveryActive=false;
  function passwordRecoveryModal(bridge) {
    passwordRecoveryActive=true;
    document.querySelectorAll('.graduate-modal').forEach(node=>node.remove());
    const root=modal(bridge,`<div class="modal-head"><h3>تعيين كلمة مرور جديدة</h3></div><div class="modal-body"><p class="graduate-muted">تم التحقق من رابط البريد الإلكتروني. أدخل كلمة المرور الجديدة ثم أكدها؛ ستبقى جميع بيانات حسابك كما هي.</p><label>كلمة المرور الجديدة<input id="graduateNewPassword" class="input" type="password" autocomplete="new-password" minlength="8" required></label><label>تأكيد كلمة المرور<input id="graduateConfirmPassword" class="input" type="password" autocomplete="new-password" minlength="8" required></label><div class="graduate-actions"><button id="graduatePasswordSave" class="btn btn-primary">حفظ كلمة المرور</button></div></div>`);
    root.querySelector('#graduatePasswordSave').addEventListener('click',async()=>{
      const password=root.querySelector('#graduateNewPassword').value,confirm=root.querySelector('#graduateConfirmPassword').value;
      if(password.length<8)return notify(bridge,'استخدم كلمة مرور من 8 أحرف على الأقل.','err');
      if(password!==confirm)return notify(bridge,'تأكيد كلمة المرور غير مطابق.','err');
      const button=root.querySelector('#graduatePasswordSave');button.disabled=true;button.textContent='جارٍ الحفظ…';
      const {error:updateError}=await bridge.db.auth.updateUser({password});
      if(updateError){button.disabled=false;button.textContent='حفظ كلمة المرور';return notify(bridge,updateError.message,'err');}
      const {error:completeError}=await bridge.db.rpc('graduate_complete_password_reset');
      if(completeError){button.disabled=false;button.textContent='حفظ كلمة المرور';return notify(bridge,'تم تغيير كلمة المرور، لكن تعذر إنهاء التفويض. أعد المحاولة أو تواصل مع المشرف الرئيسي.','err');}
      passwordRecoveryActive=false;history.replaceState(history.state,'',location.pathname+location.search);
      root.remove();notify(bridge,'تم تحديث كلمة المرور بنجاح دون حذف بيانات الحساب.','success');openGraduateSpace(bridge);
    });
  }
  async function upload(bridge, file, path) {
    const { error } = await bridge.db.storage.from('graduate-private').upload(path, file, { upsert: false, contentType: file.type || 'application/octet-stream' });
    if (error) throw error; return path;
  }
  async function loadMemories(bridge, acc) {
    const { data, error } = await bridge.db.from('graduate_memories').select('*').eq('account_id', acc.id).order('created_at', { ascending: false }).limit(3);
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
    const [settingsResult, banksResult, requestsResult, memoriesResult, graduateNotificationsResult, publicNotificationsResult, cardsResult] = await Promise.all([
      bridge.db.from('subscription_settings').select('*').eq('promotion_id', promotionId).maybeSingle(),
      bridge.db.from('payment_banks').select('*').eq('promotion_id', promotionId).eq('is_active', true).order('bank_name'),
      bridge.db.from('subscription_requests').select('id,status,amount,rejection_reason,created_at,reviewed_at').eq('account_id', acc.id).order('created_at', { ascending: false }).limit(10),
      bridge.db.from('graduate_memories').select('*').eq('account_id', acc.id).order('created_at', { ascending: false }).limit(3),
      bridge.db.from('graduate_notifications').select('id,title,body,url,read_at,created_at').eq('promotion_id', promotionId).eq('user_id', acc.user_id).order('created_at', { ascending: false }).limit(30),
      bridge.db.from('notifications').select('id,title,body,url,created_at').eq('promotion_id', promotionId).order('created_at', { ascending: false }).limit(30),
      acc.student_id ? bridge.db.rpc('get_student_cards', { _student_id: acc.student_id }) : Promise.resolve({ data: [], error: null })
    ]);
    if (settingsResult.error || banksResult.error || requestsResult.error || memoriesResult.error || graduateNotificationsResult.error || publicNotificationsResult.error || cardsResult.error) throw settingsResult.error || banksResult.error || requestsResult.error || memoriesResult.error || graduateNotificationsResult.error || publicNotificationsResult.error || cardsResult.error;
    const settings = settingsResult.data, banks = banksResult.data || [], requests = requestsResult.data || [], memories = await loadMemories(bridge, acc);
    const notifications = [...(graduateNotificationsResult.data || []), ...(publicNotificationsResult.data || [])].sort((a,b) => new Date(b.created_at) - new Date(a.created_at)).slice(0, 30);
    const cards = (cardsResult.data || []).filter(card => card.ceremony_type !== 'night' || bridge.state?.promo?.night_event_enabled !== false);
    const reportsResult = await bridge.db.from('promotion_financial_reports').select('id,title_ar,title_fr,notes,published_at,subscription_income,subscription_currency').eq('promotion_id',promotionId).eq('status','published').order('published_at',{ascending:false}).limit(20);
    if (reportsResult.error) throw reportsResult.error;
    const publishedReports = reportsResult.data || [];
    let reportEntries = [];
    if (publishedReports.length) {
      const entryResult = await bridge.db.from('financial_report_entries').select('report_id,entry_type,category,description,amount,entry_date,invoice_path').in('report_id',publishedReports.map(report=>report.id)).order('entry_date',{ascending:true}).limit(500);
      if (entryResult.error) throw entryResult.error;
      reportEntries = await Promise.all((entryResult.data||[]).map(async entry => {
        if (!entry.invoice_path) return entry;
        const signed = await bridge.db.storage.from('graduate-private').createSignedUrl(entry.invoice_path,3600);
        return {...entry,invoice_url:signed.data?.signedUrl||null};
      }));
    }
    const reportsHtml = `<section class="graduate-card graduate-reports"><h4>${isFrench(bridge)?'Rapports financiers publiés':'التقارير المالية المنشورة'}</h4>${publishedReports.map(report=>{
      const rows=reportEntries.filter(entry=>entry.report_id===report.id);
      const income=rows.filter(entry=>entry.entry_type==='income'), expenses=rows.filter(entry=>entry.entry_type==='expense');
      const otherIncome=income.reduce((sum,entry)=>sum+Number(entry.amount||0),0), expenseTotal=expenses.reduce((sum,entry)=>sum+Number(entry.amount||0),0);
      const hasSubscriptionSnapshot=report.subscription_income!==null&&report.subscription_income!==undefined;
      const subscriptionIncome=Number(report.subscription_income||0), currency=report.subscription_currency||settings?.currency||'MRU';
      const net=subscriptionIncome+otherIncome-expenseTotal;
      const title=isFrench(bridge)?(report.title_fr||report.title_ar):report.title_ar;
      const renderEntry=entry=>`<div class="graduate-report-line ${entry.entry_type==='expense'?'expense':'income'}"><div class="graduate-report-line-copy"><span class="graduate-report-kind">${entry.entry_type==='expense'?(isFrench(bridge)?'Dépense':'مصروف'):(isFrench(bridge)?'Autre recette':'إيراد إضافي')}</span><strong>${esc(entry.category)}</strong>${entry.description?`<p>${esc(entry.description)}</p>`:''}<small>${esc(new Date(entry.entry_date+'T00:00:00').toLocaleDateString(isFrench(bridge)?'fr-FR':'ar'))}</small></div><b class="graduate-report-amount">${esc(entry.amount)} ${esc(currency)}</b>${entry.invoice_url?`<a class="graduate-invoice-link" href="${esc(entry.invoice_url)}" target="_blank" rel="noopener"><img class="graduate-invoice-thumb" src="${esc(entry.invoice_url)}" alt="${isFrench(bridge)?'Facture pour':'فاتورة مصروف'} ${esc(entry.category)}" loading="lazy"><span>${isFrench(bridge)?'Voir la facture':'عرض الفاتورة'}</span></a>`:''}</div>`;
      return `<article class="graduate-report-item"><header class="graduate-report-header"><div><small class="graduate-muted">${isFrench(bridge)?'Rapport publié':'تقرير منشور'} · ${esc(report.published_at?new Date(report.published_at).toLocaleDateString(isFrench(bridge)?'fr-FR':'ar'):'')}</small><strong>${esc(title)}</strong></div><span class="graduate-report-seal">${isFrench(bridge)?'Validé':'معتمد'}</span></header>${report.notes?`<p class="graduate-report-notes">${esc(report.notes)}</p>`:''}<div class="graduate-report-kpis"><div><small>${isFrench(bridge)?'Adhésions payées':'إيراد الاشتراكات المدفوعة'}</small><b>${hasSubscriptionSnapshot?`${esc(subscriptionIncome.toFixed(2))} ${esc(currency)}`:'—'}</b></div><div><small>${isFrench(bridge)?'Autres recettes':'إيرادات أخرى'}</small><b>${esc(otherIncome.toFixed(2))} ${esc(currency)}</b></div><div><small>${isFrench(bridge)?'Dépenses':'المصروفات'}</small><b>${esc(expenseTotal.toFixed(2))} ${esc(currency)}</b></div><div class="net"><small>${isFrench(bridge)?'Solde net':'الصافي'}</small><b>${hasSubscriptionSnapshot?`${esc(net.toFixed(2))} ${esc(currency)}`:'—'}</b></div></div><div class="graduate-report-sections"><section><h5>${isFrench(bridge)?'Recettes supplémentaires':'الإيرادات الإضافية'}</h5>${income.map(renderEntry).join('')||`<p class="graduate-muted">${isFrench(bridge)?'Aucune recette supplémentaire':'لا توجد إيرادات إضافية'}</p>`}</section><section><h5>${isFrench(bridge)?'Dépenses et justificatifs':'المصروفات والفواتير'}</h5>${expenses.map(renderEntry).join('')||`<p class="graduate-muted">${isFrench(bridge)?'Aucune dépense':'لا توجد مصروفات'}</p>`}</section></div></article>`;
    }).join('')||`<p class="graduate-muted">${isFrench(bridge)?'Aucun rapport publié pour le moment.':'لم ينشر رئيس الدفعة تقريرًا ماليًا بعد.'}</p>`}</section>`;
    let linkedStudent = null; if (acc.student_id) { const sr = await bridge.db.from('students').select('order_index,payment_order_index').eq('id', acc.student_id).eq('promotion_id', promotionId).maybeSingle(); if (sr.error) throw sr.error; linkedStudent = sr.data; }
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
      <section class="graduate-card"><h4>ملفي وعضويتي</h4><p>حالة العضوية: <span class="graduate-status ${esc(acc.membership_status)}">${esc(acc.membership_status === 'active' ? 'مفعّلة' : acc.membership_status === 'suspended' ? 'موقوفة' : 'قيد المراجعة')}</span></p><p class="graduate-muted">${isFrench(bridge) ? 'Nom complet' : 'الاسم الكامل'}: ${esc(isFrench(bridge) ? (acc.full_name_fr || acc.full_name) : (acc.full_name || acc.full_name_fr))} · ${isFrench(bridge) ? 'Numéro d’inscription' : 'رقم التسجيل'}: ${esc(acc.registration_number)}</p>${acc.phone ? `<p class="graduate-muted">الهاتف: ${esc(acc.phone)}</p>` : ''}${linkedStudent?.order_index != null ? `<p class="graduate-staff-note">${isFrench(bridge) ? 'Votre rang dans la promotion' : 'ترتيبك في الدفعة'} : <b>${Number(linkedStudent.payment_order_index ?? linkedStudent.order_index)}</b></p>` : ''}${acc.certificate_name ? `<p class="graduate-muted">اسم شهادة التكريم: ${esc(acc.certificate_name)}</p>` : ''}${acc.sash_name ? `<p class="graduate-muted">الاسم على الوشاح: ${esc(acc.sash_name)}</p>` : ''}${locked ? `<p class="graduate-staff-note">${isFrench(bridge) ? FR.get('التعديل مغلق من المشرف الرئيسي. يمكنك إضافة الصور فقط.') : 'التعديل مغلق من المشرف الرئيسي. يمكنك إضافة الصور فقط.'}</p>` : `<div class="graduate-actions"><button class="btn btn-ghost btn-sm" id="graduateEditNames">${isFrench(bridge) ? 'Modifier les noms du certificat et de l’écharpe' : 'تعديل اسمي الشهادة والوشاح'}</button></div>`}</section>
      <section class="graduate-card"><h4>الاشتراك المالي</h4><p class="graduate-muted">المبلغ المحدد: <b>${esc(settings?.amount ?? 0)} ${esc(settings?.currency || 'MRU')}</b></p>${latest ? `<p>آخر طلب: <span class="graduate-status ${esc(latest.status)}">${esc(latest.status === 'approved' ? 'مقبول' : latest.status === 'rejected' ? 'مرفوض' : 'قيد المراجعة')}</span></p>${latest.rejection_reason ? `<p class="graduate-muted">سبب الرفض: ${esc(latest.rejection_reason)}</p>` : ''}` : '<p class="graduate-muted">لم ترسل طلب اشتراك بعد.</p>'}${approved ? '<p class="graduate-staff-note">تم قبول الدفع وتفعيل عضويتك؛ لا حاجة ولا يمكن إرسال طلب دفع آخر.</p>' : pending ? '<p class="graduate-staff-note">لديك طلب دفع قيد المراجعة. انتظر قرار مسؤول المالية قبل إرسال طلب آخر.</p>' : paymentAction}</section>
      <section class="graduate-card"><h4>ألبوم ذكرياتي <span class="graduate-muted">${memories.length} من 3</span></h4><div class="graduate-photo-list" id="graduatePhotoList">${memories.length ? '<span class="graduate-muted">جاري تحميل الصور…</span>' : '<span class="graduate-muted">لم تضف صوراً بعد. احفظ لحظاتك المميزة مع دفعتك.</span>'}</div><div class="graduate-actions"><button class="btn btn-ghost btn-sm" id="graduateMemoryBtn" ${memories.length >= 3 ? 'disabled' : ''}>إضافة صورة للذكرى</button></div></section>
      <section class="graduate-card"><h4>${isFrench(bridge) ? 'Notifications de la promotion' : 'إشعارات الدفعة'}</h4>${notifications.length ? notifications.map(n => `<article class="graduate-request"><strong>${esc(n.title)}</strong><p class="graduate-muted">${esc(n.body)}</p><small class="graduate-muted">${esc(new Date(n.created_at).toLocaleString(isFrench(bridge) ? 'fr-FR' : 'ar'))}</small></article>`).join('') : `<p class="graduate-muted">${isFrench(bridge) ? 'Aucune notification pour le moment.' : 'لا توجد إشعارات جديدة حالياً.'}</p>`}</section>
      ${cards.length ? `<section class="graduate-card"><h4>${isFrench(bridge) ? 'Mes cartes d’événements' : 'بطاقات فعالياتي'}</h4>${cards.map(card => `<article class="graduate-bank-row"><div><b>${esc(isFrench(bridge) ? (card.ceremony_name_fr || card.ceremony_name || '') : (card.ceremony_name || card.ceremony_name_fr || ''))}</b><small>${esc(isFrench(bridge) ? (card.card_type_name_fr || card.card_type_name || 'Carte') : (card.card_type_name || card.card_type_name_fr || 'بطاقة'))}</small></div><strong>${esc(card.quantity)} ×</strong></article>`).join('')}</section>` : ''}${reportsHtml}
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
    const root = modal(bridge, `<div class="modal-head"><h3>إرسال إثبات الدفع</h3><button class="icon-btn" data-close>×</button></div><div class="modal-body"><p class="graduate-muted">المبلغ المطلوب: <b>${esc(settings?.amount || 0)} ${esc(settings?.currency || 'MRU')}</b></p><label>رقم الهاتف الذي أُرسل منه الاشتراك<input id="graduateSenderPhone" class="input" type="tel" dir="ltr" inputmode="tel" autocomplete="tel" maxlength="30" value="${esc(acc.phone || '')}" required></label><label>البنك<select id="graduateBank" class="input">${banks.map((b) => `<option value="${esc(b.id)}" data-bank="${esc(b.bank_name)}" data-account="${esc(b.account_number)}">${esc(b.bank_name)} — ${esc(b.account_number)}</option>`).join('')}</select></label><div id="graduateBankPreview" class="graduate-bank-preview" aria-live="polite"></div><label>المبلغ المدفوع<input id="graduateAmount" class="input" type="text" inputmode="none" value="${esc(settings?.amount ?? 0)} ${esc(settings?.currency || 'MRU')}" readonly aria-readonly="true"></label><label>صورة إثبات الدفع<input id="graduateProof" class="graduate-file" type="file" accept="image/*,application/pdf"></label><div class="graduate-actions"><button id="graduatePaySubmit" class="btn btn-primary">إرسال الطلب</button><button class="btn btn-ghost" data-close>إلغاء</button></div></div>`);
    const showBankPreview = () => { const option = root.querySelector('#graduateBank').selectedOptions[0]; root.querySelector('#graduateBankPreview').innerHTML = option ? `<strong>${esc(option.dataset.bank)}</strong><bdi dir="ltr">${esc(option.dataset.account)}</bdi>` : ''; };
    root.querySelector('#graduateBank').addEventListener('change', showBankPreview);
    showBankPreview();
    root.querySelector('#graduatePaySubmit').addEventListener('click', async () => {
      const file = root.querySelector('#graduateProof').files[0]; const amount = Number(settings?.amount || 0);
      const senderPhone=root.querySelector('#graduateSenderPhone').value.trim();
      if (!file || amount <= 0 || !root.querySelector('#graduateBank').value || senderPhone.length<6 || senderPhone.length>30) return notify(bridge, 'أدخل رقم الهاتف الذي أُرسل منه الاشتراك، واختر البنك وارفع إثبات الدفع.', 'err');
      const submit = root.querySelector('#graduatePaySubmit'); submit.disabled = true; submit.textContent = 'جارٍ إرسال الطلب…';
      let path = '';
      try {
        if (settings?.payment_starts_at && new Date(settings.payment_starts_at).getTime() > Date.now()) throw new Error('PAYMENT_NOT_OPEN');
        path = `proofs/${bridge.tenant.id}/${acc.user_id}/${uuid()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
        await upload(bridge, file, path);
        const { error } = await bridge.db.from('subscription_requests').insert({ promotion_id: bridge.tenant.id, account_id: acc.id, bank_id: root.querySelector('#graduateBank').value, amount, sender_phone: senderPhone, proof_path: path });
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
    const root = modal(bridge, `<div class="modal-head"><h3>إضافة ذكرى</h3><button class="icon-btn" data-close>×</button></div><div class="modal-body"><p class="graduate-muted">يمكنك رفع ${Math.max(0, 3-count)} صورة إضافية.</p><label>الصورة<input id="graduateMemoryFile" class="graduate-file" type="file" accept="image/*"></label><label>الوصف<input id="graduateMemoryCaption" class="input" maxlength="180"></label><label>الخصوصية<select id="graduateMemoryVisibility" class="input"><option value="members">المشتركون</option><option value="private">خاصة</option><option value="public">العامة</option></select></label><div class="graduate-actions"><button id="graduateMemorySubmit" class="btn btn-primary">حفظ</button><button class="btn btn-ghost" data-close>إلغاء</button></div></div>`);
    root.querySelector('#graduateMemorySubmit').addEventListener('click', async () => { const file=root.querySelector('#graduateMemoryFile').files[0]; if (!file) return notify(bridge,'اختر صورة أولًا.','err'); try { const path=`memories/${bridge.tenant.id}/${acc.user_id}/${uuid()}-${file.name.replace(/[^a-zA-Z0-9._-]/g,'_')}`; if (count >= 3) throw new Error('MEMORY_LIMIT_REACHED'); await upload(bridge,file,path); const {error}=await bridge.db.from('graduate_memories').insert({promotion_id:bridge.tenant.id,account_id:acc.id,storage_path:path,caption:root.querySelector('#graduateMemoryCaption').value.trim(),visibility:root.querySelector('#graduateMemoryVisibility').value}); if(error) throw error; root.remove(); notify(bridge,'تم حفظ الذكرى.','success'); await renderSpace(bridge,parent,acc); } catch(e){ notify(bridge,e.message,'err'); } });
  }
  function localDateTimeInput(value) {
    if (!value) return '';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  }
  async function openGraduateSpace(bridge) {
    if(passwordRecoveryActive || new URLSearchParams(location.hash.slice(1)).get('type')==='recovery') return;
    const s = await session(bridge); if (!s) return authModal(bridge);
    let acc, specialtyResult; try { [acc, specialtyResult] = await Promise.all([account(bridge, s.user.id), bridge.db.from('specialties').select('id,name,name_fr').eq('promotion_id', bridge.tenant.id).order('name').limit(50)]); } catch (e) { return notify(bridge, e.message, 'err'); }
    if (specialtyResult.error) return notify(bridge, specialtyResult.error.message, 'err');
    if (acc?.password_reset_required) { await bridge.db.auth.signOut(); notify(bridge,'فعّل المشرف الرئيسي استعادة هذا الحساب. أدخل البريد المسجل لطلب رابط التحقق ثم عيّن كلمة مرور جديدة.','info'); return passwordResetRequestModal(bridge,acc.registration_number); }
    if (!acc) { const scope=await bridge.db.rpc('graduate_account_is_elsewhere'); if(scope.error) return notify(bridge,scope.error.message,'err'); if(scope.data===true) return notify(bridge,isFrench(bridge)?'Ce compte est déjà associé à une autre promotion.':'هذا الحساب مرتبط مسبقًا بدفعة أخرى.','err'); }
    const specialties = specialtyResult.data || [];
    const requiresSpecialty = (specialties || []).length > 1 && !acc?.specialty_id && acc?.membership_status !== 'active';
    const profileIncomplete = !acc || (acc.membership_status !== 'active' && (!acc.registration_number || !acc.phone || !acc.certificate_name || !acc.sash_name));
    if (profileIncomplete || requiresSpecialty) {
      const list = specialties || [];
      const specialtyField = list.length > 1 ? `<label>التخصص<select id="graduateLinkSpecialty" class="input" required><option value="">اختر تخصصك</option>${list.map((sp) => `<option value="${esc(sp.id)}" ${acc?.specialty_id === sp.id ? 'selected' : ''}>${esc(isFrench(bridge) ? (sp.name_fr || sp.name) : sp.name)}</option>`).join('')}</select></label>` : '';
      const rosterMode = bridge.state?.promo?.graduate_roster_uploaded === true;
      const fullName = acc?.full_name || s.user.user_metadata?.full_name || '';
      const initialRegistration = acc?.registration_number || s.user.user_metadata?.registration_number || '';
      const identityFields = rosterMode
        ? `<label>رقم التسجيل الجامعي<input id="graduateLinkReg" class="input" dir="ltr" value="${esc(initialRegistration)}" maxlength="40" required></label><div class="graduate-actions"><button type="button" id="graduateVerifyRegistration" class="btn btn-ghost">التحقق من رقم التسجيل</button></div><div id="graduateRosterIdentity" class="graduate-staff-note" hidden></div><div id="graduateRosterDetails" hidden><label>رقم الهاتف<input id="graduateLinkPhone" class="input" type="tel" dir="ltr" value="${esc(acc?.phone || '')}" autocomplete="tel" maxlength="30" required></label><label>الاسم على شهادة التكريم<input id="graduateLinkCertificate" class="input" value="${esc(acc?.certificate_name || '')}" maxlength="160" required></label><label>الاسم على الوشاح<input id="graduateLinkSash" class="input" value="${esc(acc?.sash_name || '')}" maxlength="160" required></label></div>`
        : `<label>رقم التسجيل الجامعي<input id="graduateLinkReg" class="input" dir="ltr" value="${esc(initialRegistration)}" maxlength="40" required></label><label>رقم الهاتف<input id="graduateLinkPhone" class="input" type="tel" dir="ltr" value="${esc(acc?.phone || '')}" autocomplete="tel" maxlength="30" required></label><label>الاسم على شهادة التكريم<input id="graduateLinkCertificate" class="input" value="${esc(acc?.certificate_name || '')}" maxlength="160" required></label><label>الاسم على الوشاح<input id="graduateLinkSash" class="input" value="${esc(acc?.sash_name || '')}" maxlength="160" required></label>${specialtyField}`;
      const root = modal(bridge, `<div class="modal-head"><h3>${acc ? 'استكمال بيانات الخريج' : 'بيانات الخريج والتخصص'}</h3><button class="icon-btn" data-close>×</button></div><div class="modal-body"><p class="graduate-muted">${rosterMode ? 'أدخل رقم تسجيلك للتحقق من بياناتك وتخصصك المسجلين لدى الدفعة، ثم أكمل اسمي الشهادة والوشاح ورقم الهاتف.' : 'أكمل بياناتك واختر تخصصك قبل الانتقال إلى الدفع. ستُستخدم الأسماء كما كتبتها في ملف الخريج وقائمة التخصص.'}</p>${rosterMode ? '' : `<label>الاسم الكامل<input id="graduateLinkName" class="input" value="${esc(fullName)}" autocomplete="name" maxlength="160" required></label>`}<label>البريد الإلكتروني<input class="input" type="email" value="${esc(s.user.email || '')}" dir="ltr" disabled></label>${identityFields}<div class="graduate-actions"><button id="graduateLinkSubmit" class="btn btn-primary">حفظ ومتابعة إلى الدفع</button></div></div>`);
      let verifiedStudent = null;
      const verifyRosterStudent = async () => {
        const reg = root.querySelector('#graduateLinkReg').value.trim();
        if (!reg) return notify(bridge, 'أدخل رقم التسجيل أولاً.', 'err');
        const verify = root.querySelector('#graduateVerifyRegistration'); verify.disabled = true;
        const { data, error } = await bridge.db.rpc('lookup_graduate_registration', { _promotion_id: bridge.tenant.id, _registration_number: reg });
        verify.disabled = false;
        if (error) return notify(bridge, error.message, 'err');
        if (!data) { verifiedStudent = null; root.querySelector('#graduateRosterDetails').hidden = true; root.querySelector('#graduateRosterIdentity').hidden = true; return notify(bridge, 'لم نعثر على رقم التسجيل في قائمة خريجي هذه الدفعة. تحقق من الرقم أو تواصل مع الإدارة.', 'err'); }
        verifiedStudent = data;
        const identity = root.querySelector('#graduateRosterIdentity');
        identity.innerHTML = `<strong>${esc(isFrench(bridge) ? (data.full_name_fr || data.full_name || '') : (data.full_name || data.full_name_fr || ''))}</strong><br><span>${esc(isFrench(bridge) ? (data.specialty_fr || data.specialty_ar || '') : (data.specialty_ar || data.specialty_fr || ''))}</span><br><small dir="ltr">${esc(data.registration_number || '')}</small>`;
        identity.hidden = false; root.querySelector('#graduateRosterDetails').hidden = false;
      };
      if (rosterMode) {
        root.querySelector('#graduateVerifyRegistration').addEventListener('click', verifyRosterStudent);
        root.querySelector('#graduateLinkReg').addEventListener('input', () => { verifiedStudent = null; root.querySelector('#graduateRosterIdentity').hidden = true; root.querySelector('#graduateRosterDetails').hidden = true; });
        if (initialRegistration) verifyRosterStudent();
      }
      root.querySelector('#graduateLinkSubmit').addEventListener('click', async () => {
        if (rosterMode && (!verifiedStudent || verifiedStudent.registration_number.toUpperCase() !== root.querySelector('#graduateLinkReg').value.trim().toUpperCase())) return notify(bridge, 'تحقق من رقم التسجيل قبل المتابعة.', 'err');
        const selectedSpecialty = rosterMode ? verifiedStudent.specialty_id : (list.length === 1 ? list[0].id : root.querySelector('#graduateLinkSpecialty')?.value || null);
        const full_name = rosterMode ? verifiedStudent.full_name : root.querySelector('#graduateLinkName').value.trim();
        const registration_number = root.querySelector('#graduateLinkReg').value.trim(), phone = root.querySelector('#graduateLinkPhone').value.trim(), certificate_name = root.querySelector('#graduateLinkCertificate').value.trim(), sash_name = root.querySelector('#graduateLinkSash').value.trim();
        if ((!rosterMode && full_name.length < 2) || !registration_number || phone.length < 6 || phone.length > 30 || certificate_name.length < 2 || sash_name.length < 2) return notify(bridge, 'أكمل رقم التسجيل والهاتف واسمي الشهادة والوشاح قبل المتابعة.', 'err');
        if (!rosterMode && list.length > 1 && !selectedSpecialty) return notify(bridge, 'اختر تخصصك قبل المتابعة.', 'err');
        const { error } = await bridge.db.rpc('register_graduate', { _promotion_id: bridge.tenant.id, _full_name: full_name, _registration_number: registration_number, _phone: phone, _specialty_id: selectedSpecialty, _certificate_name: certificate_name, _sash_name: sash_name });
        if (error) return notify(bridge, error.message.includes('STUDENT_NOT_FOUND_IN_PROMOTION') ? 'رقم التسجيل غير موجود ضمن قائمة الدفعة.' : error.message.includes('SPECIALTY_NOT_IN_PROMOTION') || error.message.includes('STUDENT_SPECIALTY_MISMATCH') ? 'بيانات التخصص المسجلة لا تطابق سجل الدفعة.' : error.message.includes('INVALID_REGISTRATION_NUMBER') ? 'تعذر التحقق من رقم التسجيل. راجع الرقم مع الإدارة.' : error.message, 'err');
        root.remove(); openGraduateSpace(bridge);
      });
      return;
    }
    const root = modal(bridge, `<div class="modal-head"><h3>مساحة الخريج</h3><button class="icon-btn" aria-label="إغلاق" data-close>×</button></div><div class="modal-body graduate-content"><p class="graduate-muted">جاري التحميل...</p></div>`);
    try { await renderSpace(bridge, root, acc); } catch (e) { root.querySelector('.graduate-content').innerHTML = `<p class="graduate-muted">تعذر تحميل المساحة: ${esc(e.message)}</p>`; }
  }
  async function loadPendingSubscriptionRequests(bridge, promotionId) {
    const rows=[]; let offset=0; const pageSize=1000;
    while (true) {
      const {data,error}=await bridge.db.from('subscription_requests').select('id,account_id,amount,sender_phone,status,proof_path,rejection_reason,created_at,account:graduate_accounts!subscription_requests_account_id_fkey(full_name,registration_number,phone)').eq('promotion_id',promotionId).eq('status','pending').order('created_at',{ascending:true}).order('id',{ascending:true}).range(offset,offset+pageSize-1);
      if(error) return {data:null,error};
      rows.push(...(data||[]));
      if((data||[]).length<pageSize) break;
      offset+=pageSize;
    }
    return {data:rows,error:null};
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
    const isPlatformAdmin = bridge.state?.me?.is_platform === true;
    if (!isHead && !financePermission && !(bridge.state?.promo?.night_event_enabled !== false && nightPermission) && !isPlatformAdmin) return notify(bridge, 'لا تملك صلاحية إدارة هذه الدفعة.', 'err');
    const canManageFinance = isHead || financePermission || isPlatformAdmin;
    const nightEnabled = bridge.state?.promo?.night_event_enabled !== false;
    const canManageNight = nightEnabled && (isHead || isPlatformAdmin || (nightPermission && !financePermission));
    const root = modal(bridge, `<div class="modal-head"><h3>${isHead || isPlatformAdmin ? 'إدارة العضوية والفعاليات' : financePermission ? 'طلبات الاشتراك المالية' : 'مسح بطاقات الحفل الليلي'}</h3><button class="icon-btn" aria-label="إغلاق" data-close>×</button></div><div class="modal-body graduate-content"><p class="graduate-muted">جاري التحميل...</p></div>`);
    const promotionId = bridge.tenant.id;
    const canAssignStaff = isHead || isPlatformAdmin;
    const [financeData, staffResult] = await Promise.all([
      canManageFinance ? Promise.all([
        loadPendingSubscriptionRequests(bridge, promotionId),
        bridge.db.from('subscription_requests').select('id,account_id,amount,sender_phone,status,proof_path,rejection_reason,created_at,account:graduate_accounts!subscription_requests_account_id_fkey(full_name,registration_number,phone)').eq('promotion_id', promotionId).neq('status','pending').order('created_at', { ascending: false }).order('id', { ascending: false }).limit(20),
        bridge.db.from('promotion_financial_totals').select('*').eq('promotion_id', promotionId).maybeSingle(),
        bridge.db.from('subscription_settings').select('*').eq('promotion_id', promotionId).maybeSingle(),
        bridge.db.from('payment_banks').select('*').eq('promotion_id', promotionId).order('is_active', { ascending: false }).order('bank_name')
      ]) : Promise.resolve([{ data: [] }, { data: [] }, { data: null }, { data: null }, { data: [] }]),
      canAssignStaff ? bridge.db.rpc('platform_list_promotion_staff', { _promotion_id: promotionId }) : Promise.resolve({ data: [] })
    ]);
    const [requestsResult, historyResult, totalsResult, settingsResult, banksResult] = financeData;
    const requests = [...(requestsResult.data || []), ...(historyResult.data || [])], totals = totalsResult.data, settings = settingsResult.data, banks = banksResult.data || [], staff = (staffResult.data || []).filter((item) => nightEnabled || item.role !== 'night_event');
    const firstPendingRequestId = requests.find((request) => request.status === 'pending')?.id;
    root.querySelector('.graduate-content').innerHTML = `<div class="graduate-admin-hero"><h4>إدارة اشتراكات وفعاليات الدفعة</h4><p>إعدادات الاشتراك، مراجعة الإثباتات، ومتابعة الإيرادات من مكان واحد. بيانات هذه الشاشة خاصة بالدفعة الحالية.</p></div><div class="graduate-admin-stack">${canManageFinance ? `<section class="graduate-card"><h4>إعداد الاشتراك والبنوك</h4><div class="graduate-grid"><label>المبلغ<input id="graduateSettingsAmount" class="input" type="number" min="0" step="0.01" value="${esc(settings?.amount ?? 0)}"></label><label>العملة<input id="graduateSettingsCurrency" class="input" maxlength="8" value="${esc(settings?.currency || 'MRU')}"></label></div>${isHead ? `<div class="graduate-grid"><label>موعد بدء استقبال الدفع<input id="graduatePaymentStartsAt" class="input" type="datetime-local" value="${esc(localDateTimeInput(settings?.payment_starts_at))}"></label></div>${bridge.state?.me?.is_platform ? `<label><input id="graduatePaymentDelegated" type="checkbox" ${settings?.payment_start_delegated ? 'checked' : ''}> تفويض رئيس الدفعة لتحديد الموعد</label>` : ''}<p class="graduate-muted">يُطبّق الموعد على هذه الدفعة فقط، ولا يمكن إرسال دفعة قبل حلوله. اتركه فارغاً لفتح الدفع مباشرة.</p>` : ''}<div class="graduate-actions"><button id="graduateSettingsSave" class="btn btn-primary btn-sm">حفظ إعدادات الاشتراك</button></div><hr><div class="graduate-grid"><label>اسم البنك<input id="graduateBankName" class="input" maxlength="120" autocomplete="organization"></label><label>رقم الحساب<input id="graduateBankAccount" class="input" dir="ltr" maxlength="120" autocomplete="off"></label></div><div id="graduateBankPreview" class="graduate-bank-preview" aria-live="polite"><strong>معاينة الحساب البنكي</strong><bdi dir="ltr">—</bdi></div><div class="graduate-actions"><button id="graduateBankAdd" class="btn btn-primary btn-sm">إضافة البنك</button><button id="graduateBankCancelEdit" class="btn btn-ghost btn-sm" hidden>إلغاء التعديل</button></div><div id="graduateBankList">${banks.map((b) => `<div class="graduate-bank-row" data-bank-row="${esc(b.id)}"><div><b>${esc(b.bank_name)}</b><small dir="ltr">${esc(b.account_number)}</small><span class="graduate-status ${b.is_active ? 'active' : 'pending'}">${b.is_active ? 'مفعّل' : 'موقوف'}</span></div><div class="graduate-actions"><button class="btn btn-ghost btn-sm" data-bank-edit="${esc(b.id)}">تعديل</button><button class="btn btn-danger btn-sm" data-bank-delete="${esc(b.id)}">${b.is_active ? 'حذف / إيقاف' : 'حذف نهائي'}</button></div></div>`).join('') || '<p class="graduate-muted">لا توجد حسابات بنكية بعد.</p>'}</div></section><section class="graduate-card"><h4>الملخص المالي</h4><div class="graduate-finance-summary"><div class="graduate-finance-stat"><span>الاشتراكات المقبولة</span><b>${esc(totals?.confirmed_subscriptions ?? 0)}</b></div><div class="graduate-finance-stat"><span>عدد الدافعين</span><b>${esc(totals?.confirmed_payers ?? 0)}</b></div><div class="graduate-finance-stat"><span>المداخيل الأخرى</span><b>${esc(totals?.other_income ?? 0)}</b></div><div class="graduate-finance-stat"><span>المصاريف</span><b>${esc(totals?.expenses ?? 0)}</b></div></div></section><section class="graduate-card"><h4>طلبات الاشتراك</h4><div id="graduateRequests">${(requests || []).map((r) => `<div class="graduate-card graduate-request" data-request="${esc(r.id)}"><p><strong>${esc(r.account?.full_name || 'خريج')}</strong> · <bdi dir="ltr">${esc(r.account?.registration_number || '')}</bdi><br><span class="graduate-muted">${isFrench(bridge)?'Téléphone du transfert':'رقم التحويل المرسل منه'}: <bdi dir="ltr">${esc(r.sender_phone || '—')}</bdi></span><br><b>${esc(r.amount)}</b> · <span class="graduate-status ${esc(r.status)}">${esc(r.status === 'approved' ? 'مقبول' : r.status === 'rejected' ? 'مرفوض' : 'قيد المراجعة')}</span></p><p class="graduate-muted">${esc(new Date(r.created_at).toLocaleString())}</p><div class="graduate-actions">${r.proof_path ? `<button class="btn btn-ghost btn-sm" data-proof="${esc(r.proof_path)}">عرض الإثبات</button>` : ''}${r.status === 'pending' && r.id === firstPendingRequestId ? `<button class="btn btn-primary btn-sm" data-approve="${esc(r.id)}">قبول</button><button class="btn btn-danger btn-sm" data-reject="${esc(r.id)}">رفض</button>` : r.status === 'pending' ? '<small class="graduate-muted">يجب التحقق من الطلب السابق أولاً.</small>' : ''}</div></div>`).join('') || '<p class="graduate-muted">لا توجد طلبات اشتراك حالياً.</p>'}</div></section>` : ''}${canAssignStaff ? `<section class="graduate-card"><h4>تعيين مسؤول للدفعة</h4><p class="graduate-staff-note">يجب أن يكون للشخص حساب مسجل مسبقاً في الموقع بهذا البريد الإلكتروني. اختر الصلاحية المناسبة؛ التعيين يخص هذه الدفعة فقط.</p><div class="graduate-grid"><label>بريد الحساب<input id="graduateStaffEmail" class="input" type="email" dir="ltr" autocomplete="email" placeholder="name@example.com"></label><label>المسؤولية<select id="graduateStaffRole" class="input"><option value="finance">مسؤول المالية والاشتراكات</option>${nightEnabled ? '<option value="night_event">مسؤول الحفل الليلي</option>' : ''}</select></label></div><div id="graduateStaffPreview" class="graduate-bank-preview" aria-live="polite"><strong>معاينة المسؤول</strong><bdi dir="ltr">أدخل البريد الإلكتروني</bdi></div><div class="graduate-actions"><button id="graduateStaffAssign" class="btn btn-primary btn-sm">تعيين المسؤول</button></div><div id="graduateStaffList">${staff.map((item) => `<div class="graduate-staff-row" data-staff-row="${esc(item.user_id)}" data-role="${esc(item.role)}"><div><b>${esc(item.full_name || item.email || 'مسؤول')}</b><small dir="ltr">${esc(item.email || '')}</small><span class="graduate-status ${item.is_active ? 'active' : 'pending'}">${item.role === 'finance' ? 'مسؤول المالية' : 'مسؤول الحفل الليلي'}${item.is_active ? '' : ' — غير نشط'}</span></div>${item.is_active ? `<div class="graduate-actions"><select class="input" data-staff-role="${esc(item.user_id)}" aria-label="تغيير صلاحية ${esc(item.full_name || item.email)}"><option value="finance" ${item.role === 'finance' ? 'selected' : ''}>مسؤول المالية</option>${nightEnabled ? `<option value="night_event" ${item.role === 'night_event' ? 'selected' : ''}>مسؤول الحفل الليلي</option>` : ''}</select><button class="btn btn-ghost btn-sm" data-staff-update="${esc(item.user_id)}" data-current-role="${esc(item.role)}">حفظ الصلاحية</button><button class="btn btn-danger btn-sm" data-staff-remove="${esc(item.user_id)}" data-current-role="${esc(item.role)}">حذف المسؤول</button></div>` : ''}</div>`).join('') || '<p class="graduate-muted">لم يتم تعيين مسؤولين لهذه الدفعة بعد.</p>'}</div></section>` : ''}${canManageNight ? `<section class="graduate-card"><h4>تحقق بطاقة الحفل الليلي</h4><p class="graduate-muted">شغّل الكاميرا لمسح QR أو أدخل رمز البطاقة يدوياً؛ يتم التحقق داخل إجراء آمن على الخادم.</p><input id="graduateNightToken" class="input" dir="ltr" placeholder="رمز البطاقة"><div class="graduate-actions"><button id="graduateNightScan" class="btn btn-ghost">فتح الكاميرا</button><button class="btn btn-primary" id="graduateNightRedeem">تحقق واستخدام</button></div><p id="graduateNightResult" class="graduate-muted" aria-live="polite"></p></section>` : ''}</div>`;
    if (!isHead) root.querySelectorAll('.graduate-card').forEach((card) => { if (card.querySelector('#graduateSettingsSave') || card.querySelector('.graduate-finance-summary')) card.remove(); });
    if (isPlatformAdmin) {
      const {data:promotionsData,error:promotionsError}=await bridge.db.from('promotions').select('id,number,name_ar,domain').order('number',{ascending:false}).limit(200);
      if (promotionsError) notify(bridge,promotionsError.message,'err');
      else {
        const promotions=promotionsData||[];
        root.querySelector('.graduate-admin-stack').insertAdjacentHTML('afterbegin',`<section class="graduate-card"><h4>استعادة كلمة مرور خريج</h4><p class="graduate-muted">اختر الدفعة وأدخل رقم التسجيل. لن تُحذف أي معلومات؛ سيتطلب الحساب البريد المسجل ورابط التحقق ثم كلمة مرور جديدة وتأكيدها. الأرقام المكررة لا تُفعّل حتى تُراجع يدويًا.</p><div class="graduate-grid"><label>الدفعة<select id="graduateResetPromotion" class="input">${promotions.map(p=>`<option value="${esc(p.id)}" ${p.id===bridge.tenant.id?'selected':''}>${esc(p.number)} — ${esc(p.name_ar||p.domain||p.id.slice(0,8))}</option>`).join('')}</select></label><label>رقم التسجيل<input id="graduateResetRegistrationAdmin" class="input" dir="ltr" maxlength="64" autocomplete="off"></label></div><div class="graduate-actions"><button id="graduateResetEnable" class="btn btn-primary btn-sm" ${promotions.length?'':'disabled'}>السماح باستعادة كلمة المرور</button></div><p id="graduateResetAdminResult" class="graduate-muted" aria-live="polite"></p></section>`);
        root.querySelector('#graduateResetEnable')?.addEventListener('click',async()=>{
          const registration=root.querySelector('#graduateResetRegistrationAdmin').value.trim().toUpperCase();
          if(!registration)return notify(bridge,'أدخل رقم التسجيل.','err');
          const button=root.querySelector('#graduateResetEnable');button.disabled=true;button.textContent='جارٍ التفعيل…';
          const {error}=await bridge.db.rpc('platform_enable_graduate_password_reset',{_promotion_id:root.querySelector('#graduateResetPromotion').value,_registration_number:registration});
          button.disabled=false;button.textContent='السماح باستعادة كلمة المرور';
          if(error){const message=error.message.includes('DUPLICATE_REGISTRATION_ACCOUNT')?'يوجد أكثر من حساب بهذا الرقم؛ لم يتم تفعيل الاستعادة لحماية البيانات. يلزم مراجعة التكرار يدويًا.':error.message.includes('GRADUATE_ACCOUNT_NOT_FOUND')?'لا يوجد حساب خريج بهذا الرقم في الدفعة المختارة.':error.message;root.querySelector('#graduateResetAdminResult').textContent=message;return notify(bridge,message,'err');}
          root.querySelector('#graduateResetAdminResult').textContent='فُعّلت الاستعادة لهذا الحساب. سيحتاج الخريج إلى بريده المسجل ورابط التحقق ثم كلمة مرور جديدة.';root.querySelector('#graduateResetRegistrationAdmin').value='';notify(bridge,'تم تفعيل استعادة كلمة المرور دون حذف الحساب.','success');
        });
      }
    }
    translateElement(bridge, root.querySelector('.graduate-content'));
    if (canManageFinance) {
      const {data:draftsData,error:draftsError}=await bridge.db.from('promotion_financial_reports').select('id,title_ar,title_fr,created_at').eq('promotion_id',promotionId).eq('status','draft').order('created_at',{ascending:false}).limit(20);
      if (draftsError) notify(bridge,draftsError.message,'err');
      const drafts=draftsData||[];
      root.querySelector('.graduate-admin-stack').insertAdjacentHTML('beforeend',`<section class="graduate-card"><h4>التقرير المالي</h4><p class="graduate-muted">يمكن للرئيس أو مسؤول المالية إعداد المسودة وإضافة بنودها. النشر متاح لرئيس الدفعة فقط ويظهر للخريجين في مساحتهم.</p><div class="graduate-grid"><label>العنوان بالعربية<input id="graduateReportTitleAr" class="input" value="التقرير المالي" maxlength="160"></label><label>العنوان بالفرنسية<input id="graduateReportTitleFr" class="input" value="Rapport financier" maxlength="160"></label></div><label>ملخص التقرير<textarea id="graduateReportNotes" class="input" maxlength="2000"></textarea></label><div class="graduate-report-income-preview"><span>إيراد الاشتراكات المقبولة الحالي (يُحفظ تلقائيًا عند النشر):</span><br><bdi><b>${esc(totals?.confirmed_subscriptions ?? 0)} ${esc(settings?.currency || 'MRU')}</bdi></b></div><div class="graduate-actions"><button id="graduateReportCreate" class="btn btn-primary btn-sm">إنشاء مسودة التقرير</button></div>${drafts.length?`<hr><label>إضافة بند لمسودة<select id="graduateReportDraft" class="input">${drafts.map(d=>`<option value="${esc(d.id)}">${esc(d.title_ar)}</option>`).join('')}</select></label><div class="graduate-grid"><label>نوع البند<select id="graduateEntryType" class="input"><option value="income">إيراد</option><option value="expense">مصروف</option></select></label><label>الفئة<input id="graduateEntryCategory" class="input" maxlength="120"></label><label>المبلغ<input id="graduateEntryAmount" class="input" type="number" min="0" step="0.01"></label><label>التاريخ<input id="graduateEntryDate" class="input" type="date" value="${new Date().toISOString().slice(0,10)}"></label></div><label>الوصف<input id="graduateEntryDescription" class="input" maxlength="500"></label><label id="graduateInvoiceWrap" hidden>صورة فاتورة المصروف (اختياري)<input id="graduateInvoiceFile" class="graduate-file" type="file" accept="image/png,image/jpeg,image/webp"></label><div class="graduate-actions"><button id="graduateEntryAdd" class="btn btn-ghost btn-sm">إضافة البند</button>${isHead?'<button id="graduateReportPublish" class="btn btn-primary btn-sm">نشر المسودة</button>':''}</div>`:''}</section>`);
      translateElement(bridge, root.querySelector('.graduate-content'));
      root.querySelector('#graduateReportCreate')?.addEventListener('click',async()=>{const title_ar=root.querySelector('#graduateReportTitleAr').value.trim(),title_fr=root.querySelector('#graduateReportTitleFr').value.trim();if(title_ar.length<2||title_fr.length<2)return notify(bridge,'أدخل عنوان التقرير بالعربية والفرنسية.','err');const {error}=await bridge.db.from('promotion_financial_reports').insert({promotion_id:promotionId,title_ar,title_fr,notes:root.querySelector('#graduateReportNotes').value.trim()||null,created_by:s.user.id,status:'draft'});if(error)return notify(bridge,error.message,'err');notify(bridge,'تم إنشاء مسودة التقرير.','success');root.remove();openGraduateAdmin(bridge);});
      root.querySelector('#graduateEntryType')?.addEventListener('change',()=>{const isExpense=root.querySelector('#graduateEntryType').value==='expense';root.querySelector('#graduateInvoiceWrap').hidden=!isExpense;if(!isExpense)root.querySelector('#graduateInvoiceFile').value='';});
      root.querySelector('#graduateEntryAdd')?.addEventListener('click',async()=>{
        const amount=Number(root.querySelector('#graduateEntryAmount').value),category=root.querySelector('#graduateEntryCategory').value.trim(),entryType=root.querySelector('#graduateEntryType').value,file=entryType==='expense'?root.querySelector('#graduateInvoiceFile').files[0]:null;
        if(!category||amount<=0||!Number.isFinite(amount))return notify(bridge,'أدخل فئة ومبلغًا أكبر من صفر.','err');
        if(file&&(!['image/png','image/jpeg','image/webp'].includes(file.type)||file.size>8*1024*1024))return notify(bridge,'ارفع صورة PNG أو JPG أو WEBP لا يتجاوز حجمها 8 ميغابايت.','err');
        let invoice_path=null;
        try {
          if(file){const extension=file.type==='image/jpeg'?'jpg':file.type==='image/png'?'png':'webp';invoice_path=`financial-reports/${promotionId}/${root.querySelector('#graduateReportDraft').value}/${uuid()}.${extension}`;await upload(bridge,file,invoice_path);}
          const {error}=await bridge.db.from('financial_report_entries').insert({report_id:root.querySelector('#graduateReportDraft').value,promotion_id:promotionId,entry_type:entryType,category,description:root.querySelector('#graduateEntryDescription').value.trim()||null,amount,entry_date:root.querySelector('#graduateEntryDate').value||new Date().toISOString().slice(0,10),invoice_path,created_by:s.user.id});
          if(error)throw error;
        } catch(error){if(invoice_path)await bridge.db.storage.from('graduate-private').remove([invoice_path]).catch(()=>{});return notify(bridge,error.message,'err');}
        notify(bridge,'تمت إضافة بند التقرير.','success');root.remove();openGraduateAdmin(bridge);
      });
      root.querySelector('#graduateReportPublish')?.addEventListener('click',async()=>{const reportId=root.querySelector('#graduateReportDraft')?.value;if(!reportId)return notify(bridge,'أنشئ مسودة قبل النشر.','err');const {error}=await bridge.db.rpc('publish_promotion_financial_report',{_report_id:reportId});if(error)return notify(bridge,error.message,'err');notify(bridge,'تم نشر التقرير المالي لجميع الخريجين.','success');root.remove();openGraduateAdmin(bridge);});
    }
    if (isHead) {
    root.querySelector('#graduateSettingsSave')?.addEventListener('click', async () => { const payload = { promotion_id: promotionId, amount: Number(root.querySelector('#graduateSettingsAmount').value || 0), currency: root.querySelector('#graduateSettingsCurrency').value.trim().toUpperCase(), updated_by: s.user.id }; const { error:settingsError } = await bridge.db.from('subscription_settings').upsert(payload, { onConflict: 'promotion_id' }); if (settingsError) return notify(bridge, settingsError.message, 'err'); const startField=root.querySelector('#graduatePaymentStartsAt'); if (startField) { const starts_at=startField.value ? new Date(startField.value).toISOString() : null; const schedule=bridge.state?.me?.is_platform ? await bridge.db.rpc('update_payment_schedule',{_promotion_id:promotionId,_starts_at:starts_at,_delegate_to_batch:!!root.querySelector('#graduatePaymentDelegated')?.checked}) : await bridge.db.rpc('update_payment_start_by_batch',{_promotion_id:promotionId,_starts_at:starts_at}); if(schedule.error) return notify(bridge,schedule.error.message.includes('PAYMENT_SCHEDULE_NOT_DELEGATED')?'لم يمنح المشرف الرئيسي صلاحية تحديد الموعد.':schedule.error.message,'err'); } notify(bridge, 'تم حفظ إعدادات الاشتراك وموعد الدفع.', 'success'); });
    let editingBankId = null;
    const bankNameInput = root.querySelector('#graduateBankName'), bankAccountInput = root.querySelector('#graduateBankAccount');
    const showBankPreview = () => { root.querySelector('#graduateBankPreview').innerHTML = `<strong>${esc(bankNameInput.value.trim() || 'معاينة الحساب البنكي')}</strong><bdi dir="ltr">${esc(bankAccountInput.value.trim() || '—')}</bdi>`; };
    bankNameInput.addEventListener('input', showBankPreview); bankAccountInput.addEventListener('input', showBankPreview);
    root.querySelector('#graduateBankCancelEdit').addEventListener('click', () => { editingBankId = null; bankNameInput.value = ''; bankAccountInput.value = ''; root.querySelector('#graduateBankAdd').textContent = 'إضافة البنك'; root.querySelector('#graduateBankCancelEdit').hidden = true; showBankPreview(); });
    root.querySelector('#graduateBankAdd')?.addEventListener('click', async () => { const bank_name=bankNameInput.value.trim(), account_number=bankAccountInput.value.trim(); if (bank_name.length < 2 || account_number.length < 3) return notify(bridge, 'أدخل اسم بنك ورقم حساب صحيحين؛ تتم معاينتهما قبل الحفظ.', 'err'); const query = editingBankId ? bridge.db.from('payment_banks').update({ bank_name, account_number, updated_at: new Date().toISOString() }).eq('id', editingBankId).eq('promotion_id', promotionId) : bridge.db.from('payment_banks').insert({ promotion_id: promotionId, bank_name, account_number }); const { error } = await query; if (error) notify(bridge, error.message, 'err'); else { notify(bridge, editingBankId ? 'تم تحديث بيانات البنك.' : 'تمت إضافة البنك.', 'success'); root.remove(); openGraduateAdmin(bridge); } });
    root.querySelectorAll('[data-bank-edit]').forEach((button) => button.addEventListener('click', () => { const bank = banks.find((item) => item.id === button.dataset.bankEdit); if (!bank) return; editingBankId = bank.id; bankNameInput.value = bank.bank_name; bankAccountInput.value = bank.account_number; root.querySelector('#graduateBankAdd').textContent = 'حفظ تعديل البنك'; root.querySelector('#graduateBankCancelEdit').hidden = false; showBankPreview(); bankNameInput.focus(); }));
    root.querySelectorAll('[data-bank-delete]').forEach((button) => button.addEventListener('click', async () => { const bankId = button.dataset.bankDelete; if (!window.confirm('تأكيد حذف / إيقاف هذا الحساب البنكي؟')) return; const { count, error: usageError } = await bridge.db.from('subscription_requests').select('id', { count: 'exact', head: true }).eq('bank_id', bankId).limit(1); if (usageError) return notify(bridge, usageError.message, 'err'); const result = count ? await bridge.db.from('payment_banks').update({ is_active: false, updated_at: new Date().toISOString() }).eq('id', bankId).eq('promotion_id', promotionId) : await bridge.db.from('payment_banks').delete().eq('id', bankId).eq('promotion_id', promotionId); if (result.error) return notify(bridge, result.error.message, 'err'); notify(bridge, count ? 'أوقف البنك مع حفظ مرجعه في سجل المدفوعات السابقة.' : 'تم حذف الحساب البنكي.', 'success'); root.remove(); openGraduateAdmin(bridge); }));
    }
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
  async function reviewRequest(bridge, root, id, status, reason = null) { bridge.refreshStudentPaymentStatus?.(); const { error } = await bridge.db.rpc('review_subscription_request', { _request_id: id, _status: status, _reason: reason }); if (error) return notify(bridge, error.message.includes('PREVIOUS_REQUEST_UNREVIEWED') ? 'يجب حسم الطلب الأقدم أولاً.' : error.message, 'err'); notify(bridge, status === 'approved' ? 'تم قبول الطلب وتفعيل العضوية.' : 'تم رفض الطلب وإرسال السبب.', 'success'); root.remove(); openGraduateAdmin(bridge); }
  function addEntry(bridge) {
    if (document.getElementById('graduateEntryButton')) return;
    const header = document.querySelector('header .topbar') || document.querySelector('header'); if (!header) return;
    const button = document.createElement('a'); button.id='graduateEntryButton'; button.className='btn btn-ghost btn-sm graduate-entry'; button.textContent=isFrench(bridge)?'Espace diplômé':'مساحة الخريج'; button.href=graduateUrl().toString(); button.setAttribute('aria-label',isFrench(bridge)?'Accéder à l’espace diplômé':'الانتقال مباشرة إلى مساحة الخريج'); button.addEventListener('click', (event) => { if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return; event.preventDefault(); history.pushState(history.state, '', button.href); openGraduateSpace(bridge); });
    const anchor = document.getElementById('btnLoginText'); anchor?.parentNode?.insertBefore(button, anchor); if (!anchor) header.appendChild(button);
    let currentAdminKind = 'head';
    const labelAdminKind = kind => isFrench(bridge) ? (kind === 'finance' ? 'Demandes financières' : kind === 'night' ? 'Scanner les cartes' : 'Administration de la promotion') : (kind === 'finance' ? 'طلبات المالية' : kind === 'night' ? 'مسح بطاقات الحفل' : 'لوحة رئيس الدفعة');
    let adminButtonLabel = labelAdminKind(currentAdminKind);
    const adminButton = document.createElement('button'); adminButton.id='graduateAdminButton'; adminButton.type='button'; adminButton.className='btn btn-ghost btn-sm graduate-entry'; adminButton.textContent='إدارة العضويات'; adminButton.hidden = true; adminButton.addEventListener('click', () => openGraduateAdmin(bridge));
    adminButtonLabel=labelAdminKind(currentAdminKind); adminButton.textContent=adminButtonLabel; adminButton.setAttribute('aria-label',isFrench(bridge)?'Gérer les fonctions autorisées de la promotion':'لوحة رئيس الدفعة');
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
        const isFinance = finance.data === true; const isNight = bridge.state?.promo?.night_event_enabled !== false && night.data === true;
        const platformAdmin = bridge.state?.me?.is_platform === true;
        const permitted = isHead || isFinance || isNight || platformAdmin;
        currentAdminKind = isHead || platformAdmin ? 'head' : isFinance ? 'finance' : 'night';
        adminButtonLabel = labelAdminKind(currentAdminKind);
        adminButton.textContent = adminButtonLabel;
        adminButton.hidden = !permitted;
        if (head.error || finance.error || night.error) adminButton.hidden = true;
      } catch (_) { adminButton.hidden = true; }
    };
    sync();
    const syncLanguage=()=>{ button.textContent=isFrench(bridge)?'Espace diplômé':'مساحة الخريج'; button.setAttribute('aria-label',isFrench(bridge)?'Accéder à l’espace diplômé':'الانتقال مباشرة إلى مساحة الخريج'); adminButtonLabel=labelAdminKind(currentAdminKind); adminButton.textContent=adminButtonLabel; adminButton.setAttribute('aria-label',isFrench(bridge)?'Gérer les fonctions autorisées de la promotion':'لوحة رئيس الدفعة'); document.querySelectorAll('.graduate-modal').forEach((node)=>translateElement(bridge,node)); };
    new MutationObserver(syncLanguage).observe(document.documentElement,{attributes:true,attributeFilter:['lang']});
    bridge.db.auth.onAuthStateChange((event) => { if(event==='PASSWORD_RECOVERY'){passwordRecoveryActive=true;setTimeout(()=>passwordRecoveryModal(bridge),0);} setTimeout(sync, 0); });
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
