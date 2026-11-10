import { createFileRoute } from "@tanstack/react-router";
import { SUPABASE_ANON_KEY, SUPABASE_URL } from "@/lib/iscae-config";
import { json, serverEnv } from "@/lib/iscae-server";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PLATFORM_HOSTS = new Set(["promo-mr.vercel.app", "iscae-promo-18.vercel.app", "iscae-promo-18-eight.vercel.app"]);
const attempts = new Map<string, { count: number; resetAt: number }>();
const GENERIC_RESPONSE = { ok: true, message: "إذا كان المشرف قد فعّل الاستعادة وكان البريد مطابقًا للحساب، فسيصل رابط آمن إلى البريد المسجل." };

type Body = { email?: unknown; registration_number?: unknown; promotion_id?: unknown; website?: unknown };
type Promotion = { id: string; domain?: string | null };
type AuthUserResponse = { email?: string; user?: { email?: string } };

function noStore(body: unknown, status = 200): Response {
  const response = json(body, status);
  response.headers.set("cache-control", "no-store, max-age=0");
  return response;
}

function rateLimited(request: Request): boolean {
  const ip = (request.headers.get("x-forwarded-for") ?? request.headers.get("x-real-ip") ?? "unknown").split(",")[0]?.trim() || "unknown";
  const now = Date.now();
  const current = attempts.get(ip);
  if (!current || current.resetAt <= now) {
    attempts.set(ip, { count: 1, resetAt: now + 15 * 60_000 });
    if (attempts.size > 3000) for (const [key, value] of attempts) if (value.resetAt <= now) attempts.delete(key);
    return false;
  }
  current.count += 1;
  return current.count > 5;
}

export const Route = createFileRoute("/api/public/graduate-password-reset")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (Number(request.headers.get("content-length") ?? 0) > 8192) return noStore({ error: "حجم الطلب أكبر من المسموح." }, 413);
        if (rateLimited(request)) return noStore({ error: "محاولات كثيرة. انتظر قليلاً ثم أعد المحاولة." }, 429);
        let body: Body;
        try { body = await request.json() as Body; }
        catch { return noStore({ error: "بيانات الطلب غير صالحة." }, 400); }
        if (String(body.website ?? "").trim()) return noStore(GENERIC_RESPONSE);

        const email = String(body.email ?? "").trim().toLowerCase();
        const registration = String(body.registration_number ?? "").trim().toUpperCase();
        const promotionId = String(body.promotion_id ?? "").trim();
        if (!EMAIL_RE.test(email) || registration.length < 1 || registration.length > 40 || !UUID_RE.test(promotionId)) {
          return noStore(GENERIC_RESPONSE);
        }

        const serviceKey = serverEnv("SUPABASE_SERVICE_ROLE_KEY") ?? serverEnv("SUPABASE_SERVICE_KEY");
        if (!serviceKey) return noStore({ error: "خدمة الاستعادة غير متاحة مؤقتًا." }, 503);
        const adminHeaders = { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, "content-type": "application/json" };
        const promoResponse = await fetch(`${SUPABASE_URL}/rest/v1/promotions?select=id,domain&id=eq.${encodeURIComponent(promotionId)}&limit=1`, { headers: adminHeaders, cache: "no-store" });
        if (!promoResponse.ok) return noStore({ error: "خدمة الاستعادة غير متاحة مؤقتًا." }, 503);
        const promotions = await promoResponse.json() as Promotion[];
        const promotion = promotions[0];
        if (!promotion) return noStore(GENERIC_RESPONSE);

        const origin = request.headers.get("origin");
        let redirectTo: string | undefined;
        if (origin) {
          let parsed: URL;
          try { parsed = new URL(origin); } catch { return noStore({ error: "مصدر الطلب غير صالح." }, 403); }
          const allowedDomain = String(promotion.domain ?? "").toLowerCase().replace(/^https?:\/\//, "").split("/")[0]?.split(":")[0] ?? "";
          if (!PLATFORM_HOSTS.has(parsed.hostname.toLowerCase()) && parsed.hostname.toLowerCase() !== allowedDomain) return noStore({ error: "لا يمكن تنفيذ الطلب من هذا النطاق." }, 403);
          redirectTo = new URL("/site/index.html?graduate=1", parsed.origin).toString();
        }

        const resolveResponse = await fetch(`${SUPABASE_URL}/rest/v1/rpc/resolve_graduate_password_reset`, {
          method: "POST", headers: adminHeaders,
          body: JSON.stringify({ _promotion_id: promotionId, _registration_number: registration }), cache: "no-store",
        });
        if (!resolveResponse.ok) return noStore({ error: "خدمة الاستعادة غير متاحة مؤقتًا." }, 503);
        const userId = await resolveResponse.json() as string | null;
        if (!userId || !UUID_RE.test(userId)) return noStore(GENERIC_RESPONSE);

        const userResponse = await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${encodeURIComponent(userId)}`, { headers: adminHeaders, cache: "no-store" });
        if (!userResponse.ok) return noStore({ error: "خدمة الاستعادة غير متاحة مؤقتًا." }, 503);
        const user = await userResponse.json() as AuthUserResponse;
        const registeredEmail = String(user.email ?? user.user?.email ?? "").trim().toLowerCase();
        if (!registeredEmail || registeredEmail !== email) return noStore(GENERIC_RESPONSE);

        const recoveryUrl = new URL(`${SUPABASE_URL}/auth/v1/recover`);
        if (redirectTo) recoveryUrl.searchParams.set("redirect_to", redirectTo);
        let recoveryResponse = await fetch(recoveryUrl.toString(), {
          method: "POST", headers: { apikey: SUPABASE_ANON_KEY, "content-type": "application/json" },
          body: JSON.stringify({ email: registeredEmail }), cache: "no-store",
        });
        if (recoveryResponse.status === 429) return noStore({ error: "طلبات كثيرة. انتظر قبل إعادة المحاولة." }, 429);
        if (!recoveryResponse.ok && redirectTo && recoveryResponse.status < 500) {
          recoveryResponse = await fetch(`${SUPABASE_URL}/auth/v1/recover`, {
            method: "POST", headers: { apikey: SUPABASE_ANON_KEY, "content-type": "application/json" },
            body: JSON.stringify({ email: registeredEmail }), cache: "no-store",
          });
        }
        if (recoveryResponse.status === 429) return noStore({ error: "طلبات كثيرة. انتظر قبل إعادة المحاولة." }, 429);
        if (!recoveryResponse.ok && recoveryResponse.status >= 500) return noStore({ error: "تعذر إرسال رابط الاستعادة مؤقتًا." }, 503);
        return noStore(GENERIC_RESPONSE);
      },
    },
  },
});
