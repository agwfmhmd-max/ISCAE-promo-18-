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
    "    if (!c) { const exact = new Map(); const long = []; for (const [a, b] of pairs) { if (!exact.has(a)) exact.set(a, b); if (a.length >= 14) long.push([a, b]); } long.sort((x, y) => y[0].length - x[0].length); c = { exact, long }; __pmPairCache.set(pairs, c); }\n" +
    "    if (c.exact.has(t)) return raw.replace(t, c.exact.get(t));\n" +
    "    let out = raw; for (const [a, b] of c.long) if (out.includes(a)) out = out.split(a).join(b); return out;\n" +
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
    out = out.slice(0, strict.index + strict[0].length) + HELPER + out.slice(strict.index + strict[0].length);
    out = out.replace(RX.nodes, function (m, name) { counts.nodes++; return '{ const __p = ' + asPairs(name) + '; for (const node of nodes) { const v = __pmTr(node.nodeValue, __p); if (v !== node.nodeValue) node.nodeValue = v; } }'; });
    out = out.replace(RX.attrs, function (m, name) { counts.attrs++; return "if (el.hasAttribute(attr)) el.setAttribute(attr, __pmTr(el.getAttribute(attr), " + asPairs(name) + ")); "; });
    out = out.replace(RX.notify, function () { counts.notify++; return 'message = __pmTr(message, [...FR.entries()]);'; });
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
