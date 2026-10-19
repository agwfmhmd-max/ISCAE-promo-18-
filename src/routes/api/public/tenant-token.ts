import { createFileRoute } from "@tanstack/react-router";
import { SUPABASE_ANON_KEY, SUPABASE_URL } from "@/lib/iscae-config";
import { json, serverEnv } from "@/lib/iscae-server";

const PLATFORM_EMAIL = "agwfmhmd@gmail.com";
type Row = Record<string, unknown>;
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
function safeNumber(value: string | null): number | null {
  if (!value || !/^\d{1,3}$/.test(value)) return null;
  const number = Number(value);
  return Number.isInteger(number) && number >= 1 && number <= 999 ? number : null;
}

/**
 * Tenant access-token broker. The browser never receives the service-role key or JWT secret.
 * A signed token is minted only after the batch and optional administrator membership are verified.
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
          const host = (request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? url.host)
            .split(",")[0]!.trim().toLowerCase().split(":")[0]!;
          const queryNumber = safeNumber(url.searchParams.get("promotion"));
          const hostMatch = /^iscae-promo-(\d{1,3})\.vercel\.app$/.exec(host);
          let hostNumber = hostMatch ? Number(hostMatch[1]) : null;
          if (hostNumber === null) {
            const byDomain = await rows(`promotions?select=number&domain=eq.${encodeURIComponent(host)}&limit=1`, serviceKey);
            if (byDomain[0] && Number.isInteger(Number(byDomain[0]["number"]))) hostNumber = Number(byDomain[0]["number"]);
          }
          const requestedNumber = queryNumber ?? hostNumber ?? 18;
          const promoRows = await rows(
            `promotions?select=id,number,slug,domain,domain_status,name_fr,name_ar,logo_url,is_default&number=eq.${requestedNumber}&limit=1`,
            serviceKey,
          );
          const promo = promoRows[0];
          if (!promo || typeof promo["id"] !== "string") {
            return json({ error: "هذه الدفعة غير موجودة." }, 404);
          }
          const promotionId = promo["id"];
          const isLocalHost = host === "localhost" || host === "127.0.0.1" || host === "::1";

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
          if (!platform && !isLocalHost && hostNumber !== requestedNumber && promo["domain_status"] !== "manual") {
            return json({ error: "لا يمكن فتح هذه الدفعة من هذا النطاق. استخدم رابط الدفعة الصحيح." }, 403);
          }

          const now = Math.floor(Date.now() / 1000);
          const token = await signJwt({
            iss: `${SUPABASE_URL}/auth/v1`,
            aud: authRole,
            role: authRole,
            ...(userId ? { sub: userId, email } : {}),
            iat: now,
            exp: now + 600,
            app_metadata: { promotion_id: promotionId, promotion_number: requestedNumber, is_platform: platform },
          }, jwtSecret);
          return new Response(JSON.stringify({ token, promotion: promo, expires_at: now + 600 }), {
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
