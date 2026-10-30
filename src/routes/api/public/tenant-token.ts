// Developer: Mohamed Dah Agove
import { createFileRoute } from "@tanstack/react-router";
import { SUPABASE_ANON_KEY, SUPABASE_URL } from "@/lib/iscae-config";
import { json, serverEnv } from "@/lib/iscae-server";

const PLATFORM_EMAIL = "agwfmhmd@gmail.com";
type Row = Record<string, unknown>;
type Promotion = Row & { id: string; number: number; slug?: string | null; domain?: string | null };
const PROMO_SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*-promo-[1-9]\d{0,2}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function b64url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function signJwt(claims: Record<string, unknown>, secret: string): Promise<string> {
  const enc = new TextEncoder();
  const header = b64url(enc.encode(JSON.stringify({ alg: "HS256", typ: "JWT" })));
  const payload = b64url(enc.encode(JSON.stringify(claims)));
  const body = `${header}.${payload}`;
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(body));
  return `${body}.${b64url(new Uint8Array(sig))}`;
}

async function rows(path: string, key: string): Promise<Row[]> {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`Supabase lookup failed (${response.status})`);
  return (await response.json()) as Row[];
}

function localHost(host: string): boolean {
  return host === "localhost" || host === "127.0.0.1" || host === "::1" || host.endsWith(".localhost");
}

function projectHost(host: string): boolean {
  const project = (serverEnv("VERCEL_PROJECT_NAME") ?? "iscae-promo-18").trim().toLowerCase();
  const deployedUrl = (serverEnv("VERCEL_URL") ?? "").trim().toLowerCase().replace(/^https?:\/\//, "").split("/")[0];
  const explicit = (serverEnv("TENANT_PLATFORM_HOST") ?? "").trim().toLowerCase().replace(/^https?:\/\//, "").split("/")[0];
  const known = new Set([
    `${project}.vercel.app`,
    "iscae-promo-18.vercel.app",
    "iscae-promo-18-eight.vercel.app",
    ...(deployedUrl ? [deployedUrl] : []),
    ...(explicit ? [explicit] : []),
  ]);
  return known.has(host) || (!!project && host.startsWith(`${project}-`) && host.endsWith(".vercel.app"));
}

function promotionSelector(value: string | null): { slug?: string; id?: string } | null {
  const v = (value ?? "").trim().toLowerCase();
  if (!v) return null;
  if (/^\d{1,3}$/.test(v)) {
    const n = Number(v);
    return n >= 1 && n <= 999 ? { slug: `iscae-promo-${n}` } : null;
  }
  if (UUID_RE.test(v)) return { id: v };
  return PROMO_SLUG_RE.test(v) ? { slug: v } : null;
}

async function promotionBySelector(selector: { slug?: string; id?: string } | null, key: string): Promise<Promotion | null> {
  if (!selector) return null;
  const filter = selector.id
    ? `id=eq.${encodeURIComponent(selector.id)}`
    : `slug=eq.${encodeURIComponent(selector.slug!)}`;
  let found = await rows(`promotions?select=*&${filter}&limit=1`, key);
  if (!found[0] && selector.slug?.startsWith("iscae-promo-")) {
    const n = Number(selector.slug.slice("iscae-promo-".length));
    if (Number.isInteger(n) && n >= 1 && n <= 999) {
      found = await rows(`promotions?select=*&number=eq.${n}&is_default=eq.true&limit=1`, key);
    }
  }
  const row = found[0];
  return row && typeof row["id"] === "string" && Number.isInteger(Number(row["number"]))
    ? ({ ...row, number: Number(row["number"]) } as Promotion)
    : null;
}

function requestHost(request: Request, url: URL): string {
  const forwarded = request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? url.host;
  const first = forwarded.split(",")[0]?.trim() ?? url.host;
  try { return new URL(`http://${first}`).hostname.toLowerCase().replace(/\.$/, ""); }
  catch { return url.hostname.toLowerCase().replace(/\.$/, ""); }
}

/**
 * Tenant access-token broker. A temporary ?promo=<slug> selector is accepted only on the
 * project host/local development. On tenant hosts, the database domain mapping is authoritative.
 * The browser never receives the service-role key or JWT secret.
 */
export const Route = createFileRoute("/api/public/tenant-token")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const serviceKey = serverEnv("SUPABASE_SERVICE_ROLE_KEY") ?? serverEnv("SUPABASE_SERVICE_KEY");
        const jwtSecret = serverEnv("SUPABASE_JWT_SECRET");
        if (!serviceKey || !jwtSecret) {
          return json({ error: "يلزم ضبط SUPABASE_SERVICE_ROLE_KEY وSUPABASE_JWT_SECRET في إعدادات الخادم." }, 503);
        }
        try {
          const url = new URL(request.url);
          const host = requestHost(request, url);
          const isLocal = localHost(host);
          const isProject = projectHost(host);
          const requestedValue = url.searchParams.get("promotion");
          const requestedSelector = promotionSelector(requestedValue);
          if (requestedValue && !requestedSelector) return json({ error: "معرّف الدفعة غير صالح." }, 400);

          let promo: Promotion | null = null;
          if (!isLocal && !isProject) {
            const byDomain = await rows(
              `promotions?select=*&domain=eq.${encodeURIComponent(host)}&limit=1`,
              serviceKey,
            );
            const row = byDomain[0];
            if (row && typeof row["id"] === "string") promo = { ...row, number: Number(row["number"]) } as Promotion;
            if (!promo) return json({ error: "هذا النطاق غير مرتبط بجامعة أو دفعة." }, 404);
            if (requestedSelector) {
              const requestedPromo = await promotionBySelector(requestedSelector, serviceKey);
              if (!requestedPromo || requestedPromo.id !== promo.id) {
                return json({ error: "لا يمكن فتح دفعة أخرى من نطاق هذه الدفعة." }, 403);
              }
            }
          } else {
            const selector = requestedSelector ?? { slug: "iscae-promo-18" };
            promo = await promotionBySelector(selector, serviceKey);
            if (!promo) return json({ error: "هذه الدفعة غير موجودة." }, 404);
          }

          if (!promo || typeof promo.id !== "string") return json({ error: "هذه الدفعة غير موجودة." }, 404);
          const promotionId = promo.id;
          const promotionNumber = Number(promo.number);
          const authHeader = request.headers.get("authorization") ?? "";
          const bearer = /^Bearer\s+(.+)$/i.exec(authHeader.trim())?.[1];
          let userId: string | null = null;
          let email = "";
          let platform = false;
          let authRole: "anon" | "authenticated" = "anon";
          if (bearer) {
            const auth = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
              headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${bearer}` },
              cache: "no-store",
            });
            if (!auth.ok) return json({ error: "جلسة الدخول منتهية أو غير صالحة." }, 401);
            const user = (await auth.json()) as { id?: string; email?: string };
            if (!user.id) return json({ error: "تعذر التحقق من الحساب." }, 401);
            userId = user.id;
            email = (user.email ?? "").trim().toLowerCase();
            authRole = "authenticated";
            const admins = await rows(
              `admins?select=role,is_active,is_platform,promotion_id&user_id=eq.${encodeURIComponent(userId)}&is_active=eq.true&limit=1`,
              serviceKey,
            );
            const admin = admins[0];
            platform = email === PLATFORM_EMAIL && admin?.["is_platform"] === true && admin?.["role"] === "super_admin";
            if (admin && !platform && admin["promotion_id"] !== promotionId) {
              return json({ error: "هذا الحساب غير مخوّل للدخول إلى هذه الدفعة." }, 403);
            }
          }

          // Include institution branding when the additive migration is installed. Old ISCAE
          // deployments remain usable during rollout, so a missing institutions table is ignored.
          let publicPromo: Promotion = promo;
          const institutionId = promo["institution_id"];
          if (typeof institutionId === "string") {
            try {
              const institutions = await rows(
                `institutions?select=id,slug,name_ar,name_fr,short_name,logo_url&id=eq.${encodeURIComponent(institutionId)}&limit=1`,
                serviceKey,
              );
              if (institutions[0]) publicPromo = { ...promo, institution: institutions[0] };
            } catch (error) {
              console.warn("[tenant-token] institution lookup skipped during migration rollout", error);
            }
          }

          const now = Math.floor(Date.now() / 1000);
          const token = await signJwt({
            iss: `${SUPABASE_URL}/auth/v1`,
            aud: authRole,
            role: authRole,
            ...(userId ? { sub: userId, email } : {}),
            iat: now,
            exp: now + 600,
            app_metadata: {
              promotion_id: promotionId,
              promotion_number: promotionNumber,
              promotion_slug: promo.slug ?? null,
              institution_id: promo["institution_id"] ?? null,
              is_platform: platform,
            },
          }, jwtSecret);
          return new Response(JSON.stringify({ token, promotion: publicPromo, expires_at: now + 600 }), {
            status: 200,
            headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "x-content-type-options": "nosniff" },
          });
        } catch (error) {
          console.error("[tenant-token]", error);
          return json({ error: "تعذر تجهيز صلاحيات الدفعة." }, 503);
        }
      },
    },
  },
});
