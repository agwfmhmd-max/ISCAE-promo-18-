import { createFileRoute } from "@tanstack/react-router";
import {
  authenticateCaller,
  fetchPromotion,
  isPlatformAdmin,
  json,
  serverEnv,
} from "@/lib/iscae-server";
import { SUPABASE_ANON_KEY, SUPABASE_URL } from "@/lib/iscae-config";

/**
 * ربط رابط الدفعة الجديدة تلقائياً: iscae-promo-<N>.vercel.app
 *
 * يضيف الخادم النطاق إلى «نفس مشروع Vercel» عبر Vercel REST API، فيخدم المشروع الواحد
 * كل الدفعات، وكل نطاق يفتح بيانات دفعته فقط (الموقع يحدد الدفعة من اسم النطاق).
 *
 * المتغيرات السرية على الخادم (Vercel ▸ Settings ▸ Environment Variables):
 *   VERCEL_TOKEN        (إلزامي لهذا الربط التلقائي)  — Account Settings ▸ Tokens
 *   VERCEL_PROJECT_ID   (يضيفه Vercel تلقائياً؛ أو VERCEL_PROJECT_NAME)
 *   VERCEL_TEAM_ID      (اختياري — فقط إن كان المشروع داخل Team)
 * بدون VERCEL_TOKEN: تُنشأ الدفعة ويعمل رابطها المؤقت (?promo=N) ويُطلب إضافة النطاق يدوياً.
 */

const VERCEL_API = "https://api.vercel.com";
const DOMAIN_RE = /^iscae-promo-\d{1,3}\.vercel\.app$/i;
const DEFAULT_DOMAIN_RE = /^iscae-promo-\d{1,3}(?:-[a-z0-9-]+)?\.vercel\.app$/i;

type VercelCfg = { token: string; project: string; team: string | null };

function vercelConfig(): VercelCfg | null {
  const token = serverEnv("VERCEL_TOKEN") ?? serverEnv("VERCEL_API_TOKEN");
  if (!token) return null;
  const project =
    serverEnv("VERCEL_PROJECT_ID") ?? serverEnv("VERCEL_PROJECT_NAME") ?? "iscae-promo-18";
  return { token, project, team: serverEnv("VERCEL_TEAM_ID") ?? serverEnv("VERCEL_ORG_ID") ?? null };
}

function vurl(path: string, cfg: VercelCfg): string {
  const qs = cfg.team ? `?teamId=${encodeURIComponent(cfg.team)}` : "";
  return `${VERCEL_API}${path}${qs}`;
}

type VercelErr = { error?: { code?: string; message?: string } };

async function addDomain(
  domain: string,
  cfg: VercelCfg,
): Promise<{ ok: boolean; message?: string }> {
  const headers = { Authorization: `Bearer ${cfg.token}`, "content-type": "application/json" };
  const res = await fetch(vurl(`/v10/projects/${encodeURIComponent(cfg.project)}/domains`, cfg), {
    method: "POST",
    headers,
    body: JSON.stringify({ name: domain }),
  }).catch(() => null);
  if (!res) return { ok: false, message: "تعذّر الاتصال بـ Vercel." };
  if (res.ok) return { ok: true };

  const data = (await res.json().catch(() => null)) as VercelErr | null;
  // النطاق مضاف مسبقاً لهذا المشروع؟ نعدّه نجاحاً.
  const check = await fetch(
    vurl(`/v9/projects/${encodeURIComponent(cfg.project)}/domains/${encodeURIComponent(domain)}`, cfg),
    { headers },
  ).catch(() => null);
  if (check && check.ok) return { ok: true };

  const code = data?.error?.code ?? String(res.status);
  const msg = data?.error?.message ?? "";
  if (/in_use|already/i.test(code)) {
    return { ok: false, message: `النطاق ${domain} مستعمل في مشروع آخر على Vercel (${msg || code}).` };
  }
  if (res.status === 401 || res.status === 403) {
    return { ok: false, message: "رفض Vercel الصلاحية: تحقق من VERCEL_TOKEN (و VERCEL_TEAM_ID إن كان المشروع داخل Team)." };
  }
  return { ok: false, message: `Vercel: ${msg || code}` };
}

async function patchPromotion(
  id: string,
  token: string,
  patch: { domain?: string; domain_status: string },
): Promise<void> {
  await fetch(`${SUPABASE_URL}/rest/v1/promotions?id=eq.${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${token}`,
      "content-type": "application/json",
      Prefer: "return=minimal",
    },
    body: JSON.stringify(patch),
  }).catch(() => null);
}

export const Route = createFileRoute("/api/public/promo/provision")({
  server: {
    handlers: {
      /** ربط/إعادة ربط نطاق دفعة (المشرف العام فقط) */
      POST: async ({ request }) => {
        const auth = await authenticateCaller(request);
        if ("error" in auth) return auth.error;
        const { caller, token } = auth;
        if (!isPlatformAdmin(caller)) {
          return json({ ok: false, error: "❌ هذه العملية للمشرف العام (Superviseurs) فقط." }, 403);
        }

        let body: Record<string, unknown>;
        try {
          body = (await request.json()) as Record<string, unknown>;
        } catch {
          return json({ ok: false, error: "❌ طلب غير صالح." }, 400);
        }
        const id = String(body["promotion_id"] ?? "").trim();
        if (!/^[0-9a-f-]{36}$/i.test(id)) return json({ ok: false, error: "❌ الدفعة غير محددة." }, 400);

        const promo = await fetchPromotion(id, token);
        if (!promo) return json({ ok: false, error: "❌ الدفعة غير موجودة." }, 404);

        const domain = (promo.domain || `${promo.slug}.vercel.app`).toLowerCase();
        if (!DOMAIN_RE.test(domain) && !(promo.is_default && DEFAULT_DOMAIN_RE.test(domain))) {
          return json({ ok: false, error: "❌ النطاق خارج النمط المسموح iscae-promo-N.vercel.app." }, 400);
        }
        // الدفعة الافتراضية نطاقها هو المشروع نفسه: لا شيء يُضاف.
        if (promo.is_default) {
          await patchPromotion(id, token, { domain, domain_status: "active" });
          return json({ ok: true, domain, status: "active" });
        }

        const cfg = vercelConfig();
        if (!cfg) {
          await patchPromotion(id, token, { domain, domain_status: "manual" });
          return json({
            ok: false,
            code: "not_configured",
            domain,
            status: "manual",
            error:
              "لم يُضبط VERCEL_TOKEN على الخادم، لذا لم يُضف النطاق تلقائياً. أضفه يدوياً: Vercel ▸ المشروع ▸ Settings ▸ Domains ▸ Add ▸ " +
              domain,
          });
        }

        const r = await addDomain(domain, cfg);
        await patchPromotion(id, token, { domain, domain_status: r.ok ? "active" : "manual" });
        if (!r.ok) return json({ ok: false, code: "vercel_error", domain, status: "manual", error: r.message }, 502);
        return json({ ok: true, domain, status: "active" });
      },

      /** إزالة نطاق دفعة محذوفة من مشروع Vercel (المشرف العام فقط) */
      DELETE: async ({ request }) => {
        const auth = await authenticateCaller(request);
        if ("error" in auth) return auth.error;
        if (!isPlatformAdmin(auth.caller)) {
          return json({ ok: false, error: "❌ هذه العملية للمشرف العام (Superviseurs) فقط." }, 403);
        }
        let body: Record<string, unknown>;
        try {
          body = (await request.json()) as Record<string, unknown>;
        } catch {
          return json({ ok: false, error: "❌ طلب غير صالح." }, 400);
        }
        const domain = String(body["domain"] ?? "").trim().toLowerCase();
        if (!DOMAIN_RE.test(domain)) return json({ ok: false, error: "❌ نطاق غير مسموح." }, 400);
        const cfg = vercelConfig();
        if (!cfg) return json({ ok: false, code: "not_configured", error: "VERCEL_TOKEN غير مضبوط." });
        const res = await fetch(
          vurl(`/v9/projects/${encodeURIComponent(cfg.project)}/domains/${encodeURIComponent(domain)}`, cfg),
          { method: "DELETE", headers: { Authorization: `Bearer ${cfg.token}` } },
        ).catch(() => null);
        return json({ ok: !!res && (res.ok || res.status === 404) });
      },
    },
  },
});
