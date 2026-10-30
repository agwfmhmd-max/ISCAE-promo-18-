// Developer: Mohamed Dah Agove
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
 * Provision a tenant subdomain on the single Vercel project.
 * New university slugs use <institution>-promo-<n>.<TENANT_ROOT_DOMAIN>.
 * Arbitrary vercel.app subdomains cannot be claimed by an application; legacy ISCAE aliases
 * remain supported for backwards compatibility.
 */
const VERCEL_API = "https://api.vercel.com";
const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*-promo-[1-9]\d{0,2}$/;
const LEGACY_ISCAE_DOMAIN_RE = /^iscae-promo-\d{1,3}\.vercel\.app$/i;
const LEGACY_DEFAULT_DOMAIN_RE = /^iscae-promo-\d{1,3}(?:-[a-z0-9-]+)?\.vercel\.app$/i;

type VercelCfg = { token: string; project: string; team: string | null };
type VercelErr = { error?: { code?: string; message?: string } };

function normalizeRootDomain(): string | null {
  const raw = (serverEnv("TENANT_ROOT_DOMAIN") ?? "").trim().toLowerCase();
  const root = raw.replace(/^\*\./, "").replace(/\.$/, "");
  if (!root || root.length > 240 || root.includes("/") || root.includes(":")) return null;
  if (!/^(?=.{4,240}$)[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/.test(root)) return null;
  if (root === "vercel.app" || root.endsWith(".vercel.app") || root === "localhost") return null;
  return root;
}

function vercelConfig(): VercelCfg | null {
  const token = serverEnv("VERCEL_TOKEN") ?? serverEnv("VERCEL_API_TOKEN");
  if (!token) return null;
  const project = serverEnv("VERCEL_PROJECT_ID") ?? serverEnv("VERCEL_PROJECT_NAME") ?? "iscae-promo-18";
  return { token, project, team: serverEnv("VERCEL_TEAM_ID") ?? serverEnv("VERCEL_ORG_ID") ?? null };
}

function vurl(path: string, cfg: VercelCfg): string {
  const qs = cfg.team ? `?teamId=${encodeURIComponent(cfg.team)}` : "";
  return `${VERCEL_API}${path}${qs}`;
}

function expectedDomain(slug: string, existingDomain: string | null, isDefault: boolean, root: string | null): string | null {
  if (existingDomain) return existingDomain.trim().toLowerCase();
  if (isDefault && /^iscae-promo-\d{1,3}$/.test(slug)) return `${slug}.vercel.app`;
  return root ? `${slug}.${root}` : null;
}

function domainAllowed(domain: string, slug: string, root: string | null, isDefault: boolean): boolean {
  if (!SLUG_RE.test(slug)) return false;
  if (isDefault) return LEGACY_DEFAULT_DOMAIN_RE.test(domain);
  if (domain === `${slug}.vercel.app` && /^iscae-promo-\d{1,3}$/.test(slug)) return LEGACY_ISCAE_DOMAIN_RE.test(domain);
  return !!root && domain === `${slug}.${root}`;
}

async function addDomain(domain: string, cfg: VercelCfg): Promise<{ ok: boolean; message?: string }> {
  const headers = { Authorization: `Bearer ${cfg.token}`, "content-type": "application/json" };
  const res = await fetch(vurl(`/v10/projects/${encodeURIComponent(cfg.project)}/domains`, cfg), {
    method: "POST",
    headers,
    body: JSON.stringify({ name: domain }),
  }).catch(() => null);
  if (!res) return { ok: false, message: "تعذّر الاتصال بـ Vercel." };
  if (res.ok) return { ok: true };

  const data = (await res.json().catch(() => null)) as VercelErr | null;
  const check = await fetch(
    vurl(`/v9/projects/${encodeURIComponent(cfg.project)}/domains/${encodeURIComponent(domain)}`, cfg),
    { headers },
  ).catch(() => null);
  if (check && check.ok) return { ok: true };

  const code = data?.error?.code ?? String(res.status);
  const msg = data?.error?.message ?? "";
  if (/in_use|already/i.test(code)) return { ok: false, message: `النطاق ${domain} مستعمل في مشروع آخر على Vercel (${msg || code}).` };
  if (res.status === 401 || res.status === 403) {
    return { ok: false, message: "رفض Vercel الصلاحية: تحقق من VERCEL_TOKEN وVERCEL_TEAM_ID." };
  }
  return { ok: false, message: `Vercel: ${msg || code}` };
}

async function patchPromotion(id: string, token: string, patch: { domain?: string; domain_status: string }): Promise<void> {
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
      POST: async ({ request }) => {
        const auth = await authenticateCaller(request);
        if ("error" in auth) return auth.error;
        const { caller, token } = auth;
        if (!isPlatformAdmin(caller)) return json({ ok: false, error: "هذه العملية للمشرف العام فقط." }, 403);

        let body: Record<string, unknown>;
        try { body = (await request.json()) as Record<string, unknown>; }
        catch { return json({ ok: false, error: "طلب غير صالح." }, 400); }
        const id = String(body["promotion_id"] ?? "").trim();
        if (!/^[0-9a-f-]{36}$/i.test(id)) return json({ ok: false, error: "الدفعة غير محددة." }, 400);

        const promo = await fetchPromotion(id, token);
        if (!promo) return json({ ok: false, error: "الدفعة غير موجودة." }, 404);
        const slug = String(promo.slug ?? "").toLowerCase();
        if (!SLUG_RE.test(slug)) return json({ ok: false, error: "معرّف الجامعة/الدفعة غير صالح." }, 400);

        const root = normalizeRootDomain();
        const domain = expectedDomain(slug, promo.domain ?? null, !!promo.is_default, root);
        if (!domain) {
          await patchPromotion(id, token, { domain_status: "manual" });
          return json({
            ok: false,
            code: "root_domain_required",
            status: "manual",
            error: "أُنشئت الدفعة والرابط المؤقت يعمل. لتفعيل رابط من نوع feg-promo-3.example.org، أضف TENANT_ROOT_DOMAIN واضبط نطاق *.example.org على مشروع Vercel.",
          });
        }
        if (!domainAllowed(domain, slug, root, !!promo.is_default)) {
          return json({ ok: false, error: "النطاق لا يطابق معرّف الدفعة أو الجذر المعتمد." }, 400);
        }

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
            error: `أضف النطاق الجذري *.${root || "example.org"} إلى Vercel واضبط VERCEL_TOKEN لإتمام الربط الآلي: ${domain}`,
          });
        }

        const result = await addDomain(domain, cfg);
        await patchPromotion(id, token, { domain, domain_status: result.ok ? "active" : "manual" });
        if (!result.ok) return json({ ok: false, code: "vercel_error", domain, status: "manual", error: result.message }, 502);
        return json({ ok: true, domain, status: "active" });
      },

      DELETE: async ({ request }) => {
        const auth = await authenticateCaller(request);
        if ("error" in auth) return auth.error;
        if (!isPlatformAdmin(auth.caller)) return json({ ok: false, error: "هذه العملية للمشرف العام فقط." }, 403);
        let body: Record<string, unknown>;
        try { body = (await request.json()) as Record<string, unknown>; }
        catch { return json({ ok: false, error: "طلب غير صالح." }, 400); }
        const domain = String(body["domain"] ?? "").trim().toLowerCase();
        const root = normalizeRootDomain();
        const legacyAllowed = LEGACY_ISCAE_DOMAIN_RE.test(domain);
        const tenantAllowed = !!root && /^[a-z0-9]+(?:-[a-z0-9]+)*-promo-[1-9]\d{0,2}\.[a-z0-9.-]+$/i.test(domain) && domain.endsWith(`.${root}`);
        if (!legacyAllowed && !tenantAllowed) return json({ ok: false, error: "نطاق غير مسموح." }, 400);
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
