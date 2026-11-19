/* PROMO MR — محمِّل graduate-features.js مع إصلاح خلط العربية والفرنسية.
   السبب: دالة الترجمة الأصلية تستبدل مفاتيح قصيرة (مثل «من» و«حالة» و«الصورة») داخل أي نص عربي، فتنتج جملاً مختلطة.
   الإصلاح: المفاتيح القصيرة تُترجَم بالتطابق التام فقط، والمفاتيح الطويلة (14 حرفاً فأكثر) بالاستبدال الجزئي.
   إن لم تنطبق التعديلات كلها (تغيّر الملف الأصلي) يُحمَّل الملف الأصلي كما هو دون أي تعديل. */
(function () {
  'use strict';
  var SRC = '/site/graduate-features.js';
  var HELPER = "\n  const __pmPairCache = new WeakMap();\n" +
    "  function __pmTr(text, pairs) {\n" +
    "    const raw = String(text == null ? '' : text); const t = raw.trim(); if (!t) return raw;\n" +
    "    let c = __pmPairCache.get(pairs);\n" +
    "    if (!c) { const exact = new Map(); const long = []; const labels = []; for (const [a, b] of pairs) { if (!exact.has(a)) exact.set(a, b); if (a.length >= 14) long.push([a, b]); else if (/[:：]$/.test(a) && a.length >= 4) labels.push([a, b]); } long.sort((x, y) => y[0].length - x[0].length); c = { exact, long, labels }; __pmPairCache.set(pairs, c); }\n" +
    "    if (c.exact.has(t)) return raw.replace(t, c.exact.get(t));\n" +
    "    for (const [a, b] of c.labels) if (t.startsWith(a)) return raw.replace(a, b);\n" +
    "    let out = raw; for (const [a, b] of c.long) if (out.includes(a)) out = out.split(a).join(b); return out;\n" +
    "  }\n";

  var ERR_MAP = {"GRADUATE_EDITING_LOCKED": {"ar": "إنشاء الحسابات وتعديل بيانات الخريجين مغلق حالياً من طرف إدارة هذه الدفعة. تواصل مع الإدارة.", "fr": "La création de comptes et la modification des informations des diplômés sont verrouillées par l’administration de cette promotion. Contactez-la."}, "GRADUATE_ACCOUNT_NOT_FOUND": {"ar": "لا يوجد حساب خريج مرتبط بهذا الدخول في هذه الدفعة.", "fr": "Aucun compte de diplômé lié à cette connexion dans cette promotion."}, "AUTH_REQUIRED": {"ar": "سجّل الدخول أولاً.", "fr": "Connectez-vous d’abord."}, "FORBIDDEN": {"ar": "ليست لديك صلاحية لتنفيذ هذا الإجراء.", "fr": "Vous n’avez pas l’autorisation d’effectuer cette action."}, "FORBIDDEN_PROMOTION_ROLE": {"ar": "ليست لديك صلاحية لهذا الدور في هذه الدفعة.", "fr": "Vous n’avez pas ce rôle dans cette promotion."}, "FORBIDDEN_PLATFORM_ROLE_CHANGE": {"ar": "لا يمكن تغيير دور المشرف العام للمنصة.", "fr": "Le rôle de l’administrateur général ne peut pas être modifié."}, "DUPLICATE_GRADUATE_ACCOUNT_REGISTRATION": {"ar": "يوجد حساب خريج بهذا الرقم مسبقاً. سجّل دخولك.", "fr": "Un compte existe déjà avec ce numéro. Connectez-vous."}, "DUPLICATE_REGISTRATION_ACCOUNT": {"ar": "يوجد حساب بهذا الرقم مسبقاً. سجّل دخولك.", "fr": "Un compte existe déjà avec ce numéro. Connectez-vous."}, "DUPLICATE_STUDENT_REGISTRATION": {"ar": "رقم التسجيل مكرر في قائمة الدفعة.", "fr": "Numéro d’inscription en double dans la liste de la promotion."}, "REGISTRATION_NUMBER_ALREADY_USED": {"ar": "رقم التسجيل مستعمل مسبقاً.", "fr": "Numéro d’inscription déjà utilisé."}, "REGISTRATION_NUMBER_IMMUTABLE": {"ar": "لا يمكن تغيير رقم التسجيل.", "fr": "Le numéro d’inscription ne peut pas être modifié."}, "INVALID_REGISTRATION_NUMBER": {"ar": "رقم التسجيل غير صالح.", "fr": "Numéro d’inscription invalide."}, "INVALID_PHONE": {"ar": "رقم الهاتف غير صالح.", "fr": "Numéro de téléphone invalide."}, "INVALID_CERTIFICATE_NAME": {"ar": "اسم الشهادة غير صالح (2 إلى 160 حرفاً).", "fr": "Nom du certificat invalide (2 à 160 caractères)."}, "INVALID_SASH_NAME": {"ar": "اسم الوشاح غير صالح (2 إلى 160 حرفاً).", "fr": "Nom sur l’écharpe invalide (2 à 160 caractères)."}, "INVALID_BENEFICIARY_NAME": {"ar": "اسم المستفيد غير صالح.", "fr": "Nom du bénéficiaire invalide."}, "SPECIALTY_NOT_IN_PROMOTION": {"ar": "هذا التخصص لا ينتمي إلى هذه الدفعة.", "fr": "Cette spécialité n’appartient pas à cette promotion."}, "SPECIALTY_REQUIRED": {"ar": "اختر التخصص.", "fr": "Choisissez la spécialité."}, "STUDENT_NOT_FOUND_IN_PROMOTION": {"ar": "رقم التسجيل غير موجود في قائمة هذه الدفعة.", "fr": "Numéro d’inscription introuvable dans la liste de cette promotion."}, "STUDENT_SPECIALTY_MISMATCH": {"ar": "التخصص لا يطابق سجل الدفعة.", "fr": "La spécialité ne correspond pas au registre de la promotion."}, "STUDENT_SPECIALTY_MISSING": {"ar": "لا يوجد تخصص مسجل لهذا الطالب.", "fr": "Aucune spécialité enregistrée pour cet étudiant."}, "ACCOUNT_PROMOTION_MISMATCH": {"ar": "هذا الحساب تابع لدفعة أخرى.", "fr": "Ce compte appartient à une autre promotion."}, "PROMOTION_CONTEXT_REQUIRED": {"ar": "تعذر تحديد الدفعة الحالية. أعد تحميل الصفحة.", "fr": "Impossible de déterminer la promotion. Rechargez la page."}, "PROMOTION_NOT_FOUND": {"ar": "هذه الدفعة غير موجودة.", "fr": "Cette promotion est introuvable."}, "NIGHT_EVENT_DISABLED": {"ar": "الحفل الليلي غير مفعّل لهذه الدفعة.", "fr": "La soirée n’est pas activée pour cette promotion."}, "NIGHT_EVENT_DETAILS_REQUIRED": {"ar": "أدخل مكان الحفل وتاريخه أولاً.", "fr": "Renseignez d’abord le lieu et la date de la soirée."}, "CARD_NOT_FOUND": {"ar": "البطاقة غير موجودة.", "fr": "Carte introuvable."}, "CARD_ALREADY_USED": {"ar": "هذه البطاقة مستعملة مسبقاً.", "fr": "Cette carte a déjà été utilisée."}, "NIGHT_CARDS_ALREADY_USED_CANNOT_REISSUE": {"ar": "لا يمكن إعادة إصدار بطاقات استُعمل بعضها.", "fr": "Impossible de réémettre des cartes dont certaines ont été utilisées."}, "NIGHT_CARDS_NEED_REISSUE": {"ar": "يلزم إعادة إصدار بطاقات الحفل الليلي.", "fr": "Les cartes de la soirée doivent être réémises."}, "NIGHT_CARD_ASSIGNMENTS_MISSING": {"ar": "توزيع بطاقات الحفل الليلي غير مكتمل.", "fr": "La répartition des cartes de la soirée est incomplète."}, "NIGHT_CARD_ASSIGNMENTS_CHANGED": {"ar": "تغيّر توزيع البطاقات؛ حدّث الصفحة وأعد المحاولة.", "fr": "La répartition des cartes a changé ; actualisez la page et réessayez."}, "NIGHT_CEREMONY_REQUIRED": {"ar": "أنشئ حفلاً ليلياً أولاً.", "fr": "Créez d’abord une soirée."}, "NIGHT_CEREMONY_NOT_FOUND": {"ar": "الحفل الليلي غير موجود.", "fr": "Soirée introuvable."}, "PAYMENT_NOT_OPEN": {"ar": "استقبال الدفع غير مفتوح بعد.", "fr": "Les paiements ne sont pas encore ouverts."}, "PAYMENT_BANK_UNAVAILABLE": {"ar": "البنك المختار غير متاح حالياً.", "fr": "La banque choisie n’est pas disponible actuellement."}, "PREVIOUS_REQUEST_UNREVIEWED": {"ar": "لديك طلب سابق قيد المراجعة.", "fr": "Vous avez une demande précédente en cours d’examen."}, "SUBSCRIPTION_ALREADY_APPROVED": {"ar": "تم قبول اشتراكك مسبقاً.", "fr": "Votre adhésion a déjà été approuvée."}, "SUBSCRIPTION_PENDING": {"ar": "طلب اشتراكك قيد المراجعة.", "fr": "Votre demande d’adhésion est en cours d’examen."}, "SUBSCRIPTION_AMOUNT_NOT_CONFIGURED": {"ar": "لم يُحدَّد مبلغ الاشتراك بعد.", "fr": "Le montant de l’adhésion n’est pas encore défini."}, "TRANSFER_PHONE_REQUIRED": {"ar": "أدخل رقم الهاتف الذي أُرسل منه الاشتراك.", "fr": "Saisissez le numéro depuis lequel l’abonnement a été envoyé."}, "REJECTION_REASON_REQUIRED": {"ar": "اكتب سبب الرفض.", "fr": "Indiquez le motif du refus."}, "REQUEST_ALREADY_REVIEWED": {"ar": "تمت مراجعة هذا الطلب مسبقاً.", "fr": "Cette demande a déjà été examinée."}, "REQUEST_NOT_FOUND": {"ar": "الطلب غير موجود.", "fr": "Demande introuvable."}, "SUBSCRIPTION_REQUEST_NOT_FOUND": {"ar": "طلب الاشتراك غير موجود.", "fr": "Demande d’adhésion introuvable."}, "PASSWORD_RESET_NOT_AUTHORIZED": {"ar": "لم يُفعَّل استرجاع كلمة المرور لهذا الحساب.", "fr": "La récupération du mot de passe n’est pas activée pour ce compte."}, "MEMORY_LIMIT_REACHED": {"ar": "بلغتَ الحد الأقصى من الذكريات (3).", "fr": "Vous avez atteint la limite de souvenirs (3)."}, "REPORT_NOT_DRAFT": {"ar": "هذا التقرير ليس مسودة.", "fr": "Ce rapport n’est pas un brouillon."}, "REPORT_NOT_FOUND": {"ar": "التقرير غير موجود.", "fr": "Rapport introuvable."}, "INVALID_ROSTER_ROW": {"ar": "صف غير صالح في قائمة الخريجين.", "fr": "Ligne invalide dans la liste des diplômés."}, "INVALID_ROSTER_ROWS": {"ar": "قائمة الخريجين غير صالحة.", "fr": "Liste des diplômés invalide."}, "STAFF_NOT_FOUND": {"ar": "المسؤول غير موجود.", "fr": "Responsable introuvable."}, "USER_NOT_FOUND": {"ar": "لم يُعثر على المستخدم.", "fr": "Utilisateur introuvable."}, "INVALID_STAFF_ROLE": {"ar": "دور المسؤول غير صالح.", "fr": "Rôle du responsable invalide."}, "PAYMENT_SCHEDULE_FORBIDDEN": {"ar": "ليست لديك صلاحية تحديد موعد الدفع.", "fr": "Vous n’avez pas le droit de définir la date de paiement."}, "PAYMENT_SCHEDULE_NOT_DELEGATED": {"ar": "لم يمنحك المشرف الرئيسي صلاحية تحديد الموعد.", "fr": "L’administrateur principal ne vous a pas délégué cette tâche."}, "PAYMENT_DELEGATION_FORBIDDEN": {"ar": "لا يمكنك تفويض هذه الصلاحية.", "fr": "Vous ne pouvez pas déléguer ce droit."}, "HAS_STUDENTS": {"ar": "لا يمكن الحذف: توجد بيانات طلاب مرتبطة.", "fr": "Suppression impossible : des étudiants y sont rattachés."}, "ONLY_PLATFORM_ADMIN_CAN_DELETE_STUDENT": {"ar": "حذف الطالب للمشرف العام للمنصة فقط.", "fr": "Seul l’administrateur général peut supprimer un étudiant."}, "STUDENT_EDIT_FIELDS_RESTRICTED": {"ar": "لا يمكن تعديل هذه الحقول.", "fr": "Ces champs ne peuvent pas être modifiés."}, "STUDENT_ORDER_EDIT_FORBIDDEN": {"ar": "لا يمكن تعديل ترتيب الطلاب.", "fr": "Le rang des étudiants ne peut pas être modifié."}, "NOT_FOUND": {"ar": "العنصر غير موجود.", "fr": "Élément introuvable."}, "CROSS_PROMOTION_BLOCKED": {"ar": "لا يمكن الربط بين بيانات دفعات مختلفة.", "fr": "Impossible de relier des données de promotions différentes."}};
  var ERR_HELPER = "\n  const __pmErrMap = " + JSON.stringify(ERR_MAP) + ";\n" +
    "  function __pmErr(message, fr) {\n" +
    "    const raw = String(message == null ? '' : message);\n" +
    "    const tokens = raw.match(/[A-Za-z][A-Za-z0-9_]{5,}/g) || [];\n" +
    "    for (const t of tokens) { const k = __pmErrMap[t] ? t : (t.toLowerCase() === 'forbidden' ? 'FORBIDDEN' : (t.indexOf('CROSS_PROMOTION_BLOCKED') === 0 ? 'CROSS_PROMOTION_BLOCKED' : '')); if (k && __pmErrMap[k]) return fr ? __pmErrMap[k].fr : __pmErrMap[k].ar; }\n" +
    "    return raw;\n" +
    "  }\n";
  var RX = {
    nodes: /for\s*\(\s*const\s+node\s+of\s+nodes\s*\)\s*for\s*\(\s*const\s*\[\s*ar\s*,\s*fr\s*\]\s+of\s+(pairs|FR)\s*\)\s*if\s*\(\s*node\.nodeValue\.includes\(\s*ar\s*\)\s*\)\s*node\.nodeValue\s*=\s*node\.nodeValue\.split\(\s*ar\s*\)\.join\(\s*fr\s*\)\s*;/g,
    attrs: /if\s*\(\s*el\.hasAttribute\(\s*attr\s*\)\s*\)\s*for\s*\(\s*const\s*\[\s*ar\s*,\s*fr\s*\]\s+of\s+(pairs|FR)\s*\)\s*el\.setAttribute\(\s*attr\s*,\s*el\.getAttribute\(\s*attr\s*\)\.split\(\s*ar\s*\)\.join\(\s*fr\s*\)\s*\)\s*;/g,
    notify: /for\s*\(\s*const\s*\[\s*ar\s*,\s*fr\s*\]\s+of\s+FR\s*\)\s*message\s*=\s*String\(\s*message\s*\)\.split\(\s*ar\s*\)\.join\(\s*fr\s*\)\s*;/g
  };
  var asPairs = function (name) { return name === 'FR' ? '[...FR.entries()]' : 'pairs'; };

  /* تعديلات اختيارية (كل واحد مستقل): إزالة تأكيد كلمة المرور من نافذة الاستعادة */
  var OPTIONAL = [
    ["<label>تأكيد كلمة المرور<input id=\"graduateConfirmPassword\" class=\"input\" type=\"password\" autocomplete=\"new-password\" minlength=\"8\" required></label>", ""],
    ["const password=root.querySelector('#graduateNewPassword').value,confirm=root.querySelector('#graduateConfirmPassword').value;", "const password=root.querySelector('#graduateNewPassword').value;"],
    ["if(password!==confirm)return notify(bridge,'تأكيد كلمة المرور غير مطابق.','err');", ""],
    ["أدخل كلمة المرور الجديدة ثم أكدها؛", "أدخل كلمة المرور الجديدة؛"],
    ["وبعد فتحه ستضع كلمة مرور جديدة وتؤكدها.", "وبعد فتحه ستضع كلمة مرور جديدة."]
  ];
  var AUTH_START = "  async function signInOrUp(bridge, root) {";
  var AUTH_END = "  function passwordResetRequestModal(bridge, registration='') {";
  function spliceAuth(code, block) {
    if (!block) return code;
    var a = code.indexOf(AUTH_START), b = code.indexOf(AUTH_END);
    if (a < 0 || b < 0 || a >= b) return code;
    return code.slice(0, a) + block + "\n" + code.slice(b);
  }

  function patch(code, authBlock) {
    var out = code, counts = { nodes: 0, attrs: 0, notify: 0 };
    var strict = /(['"])use strict\1;/.exec(out);
    if (!strict) return null;
    out = out.slice(0, strict.index + strict[0].length) + HELPER + ERR_HELPER + out.slice(strict.index + strict[0].length);
    out = out.replace(RX.nodes, function (m, name) { counts.nodes++; return '{ const __p = ' + asPairs(name) + '; for (const node of nodes) { const v = __pmTr(node.nodeValue, __p); if (v !== node.nodeValue) node.nodeValue = v; } }'; });
    out = out.replace(RX.attrs, function (m, name) { counts.attrs++; return "if (el.hasAttribute(attr)) el.setAttribute(attr, __pmTr(el.getAttribute(attr), " + asPairs(name) + ")); "; });
    out = out.replace(RX.notify, function () { counts.notify++; return 'message = __pmTr(message, [...FR.entries()]);'; });
    out = out.replace(/function\s+notify\s*\(([^)]*)\)\s*\{/, function (m, params) { if (!/\bbridge\b/.test(params) || !/\bmessage\b/.test(params)) return m; return m + " message = __pmErr(message, (function () { try { return isFrench(bridge); } catch (e) { return false; } })());"; });
    if (!counts.nodes || !counts.attrs || !counts.notify) return null; /* تغيّر الملف: لا نعدّل شيئاً */
    for (var j = 0; j < OPTIONAL.length; j++) { var k = out.indexOf(OPTIONAL[j][0]); if (k >= 0) out = out.slice(0, k) + OPTIONAL[j][1] + out.slice(k + OPTIONAL[j][0].length); }
    return spliceAuth(out, authBlock);
  }
  try { if (new URLSearchParams(location.search).get('graduate') === '1') { document.documentElement.classList.add('graduate-direct-pending'); var st = document.createElement('style'); st.textContent = '.graduate-direct-pending #pagePublic,.graduate-direct-pending #pageDash{visibility:hidden}'; document.head.appendChild(st); } } catch (e) {}
  function loadOriginal() { var s = document.createElement('script'); s.src = SRC; document.body.appendChild(s); }
  function runInline(code) { var s = document.createElement('script'); s.text = code + '\n//# sourceURL=graduate-features.patched.js'; document.body.appendChild(s); }

  var AUTH_SRC = '/site/graduate-auth.block.js';
  Promise.all([
    fetch(SRC, { cache: 'no-cache' }).then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.text(); }),
    fetch(AUTH_SRC, { cache: 'no-cache' }).then(function (r) { return r.ok ? r.text() : ''; }).catch(function () { return ''; })
  ]).then(function (res) {
    var patched = patch(res[0], res[1]);
    if (patched) runInline(patched); else { console.warn('[PROMO MR] graduate patch not applied; loading original'); loadOriginal(); }
  }).catch(function (err) { console.warn('[PROMO MR] graduate loader fallback', err); loadOriginal(); });
})();
