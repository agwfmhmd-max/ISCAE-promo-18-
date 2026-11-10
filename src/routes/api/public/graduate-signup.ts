import { createFileRoute } from "@tanstack/react-router";
import { SUPABASE_ANON_KEY, SUPABASE_URL } from "@/lib/iscae-config";
import { json, serverEnv } from "@/lib/iscae-server";
import { checkGraduateRegistration } from "@/lib/graduate-registration";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PLATFORM_HOSTS = new Set([
  "promo-mr.vercel.app",
  "iscae-promo-18.vercel.app",
  "iscae-promo-18-eight.vercel.app",
]);
type SignupBody = { email?: unknown; password?: unknown; full_name?: unknown; promotion_id?: unknown; registration_number?: unknown; website?: unknown };
type AuthUser = { id?: string; msg?: string; message?: string; error_code?: string };
type AuthSession = { access_token?: string; refresh_token?: string; expires_in?: number; token_type?: string; user?: AuthUser };
const signupAttempts = new Map<string, { count: number; resetAt: number }>();

function noStore(body: unknown, status = 200): Response {
  const response = json(body, status);
  response.headers.set("cache-control", "no-store, max-age=0");
  return response;
}

function requestHost(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? new URL(request.url).host;
  return (forwarded.split(",")[0] ?? "").trim().split(":")[0]?.toLowerCase() ?? "";
}

function rateLimited(request: Request): boolean {
  const ip = (request.headers.get("x-forwarded-for") ?? request.headers.get("x-real-ip") ?? "unknown").split(",")[0]?.trim() || "unknown";
  const now = Date.now();
  const existing = signupAttempts.get(ip);
  if (!existing || existing.resetAt <= now) {
    signupAttempts.set(ip, { count: 1, resetAt: now + 15 * 60_000 });
    if (signupAttempts.size > 3000) {
      for (const [key, value] of signupAttempts) if (value.resetAt <= now) signupAttempts.delete(key);
    }
    return false;
  }
  existing.count += 1;
  return existing.count > 5;
}

export const Route = createFileRoute("/api/public/graduate-signup")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (Number(request.headers.get("content-length") ?? 0) > 8192) return noStore({ error: "حجم الطلب أكبر من المسموح." }, 413);
        if (rateLimited(request)) return noStore({ error: "محاولات كثيرة. انتظر قليلاً ثم أعد المحاولة." }, 429);
        const origin = request.headers.get("origin");
        let originHost = "";
        if (origin) {
          try { originHost = new URL(origin).hostname.toLowerCase(); }
          catch { return noStore({ error: "مصدر الطلب غير صالح." }, 403); }
        }

        let body: SignupBody;
        try { body = await request.json() as SignupBody; }
        catch { return noStore({ error: "بيانات الطلب غير صالحة." }, 400); }
        if (String(body.website ?? "").trim()) return noStore({ ok: true, session: null });
        const email = String(body.email ?? "").trim().toLowerCase();
        const password = String(body.password ?? "");
        const fullName = String(body.full_name ?? "").trim().slice(0, 160);
        const registration = String(body.registration_number ?? "").trim().toUpperCase();
        const promotionId = String(body.promotion_id ?? "").trim();
        if (!EMAIL_RE.test(email)) return noStore({ error: "أدخل بريداً إلكترونياً صالحاً." }, 400);
        if (password.length < 6 || password.length > 128) return noStore({ error: "كلمة المرور يجب ألا تقل عن 6 أحرف." }, 400);
        if (!UUID_RE.test(promotionId)) return noStore({ error: "تعذر تحديد الدفعة الحالية." }, 400);
        if (!/^[A-Z0-9-]{1,64}$/.test(registration)) return noStore({ error: "أدخل رقم تسجيل صالحًا." }, 400);

        const serviceKey = serverEnv("SUPABASE_SERVICE_ROLE_KEY") ?? serverEnv("SUPABASE_SERVICE_KEY");
        if (!serviceKey) return noStore({ error: "التسجيل غير متاح مؤقتاً؛ إعدادات الخادم غير مكتملة." }, 503);
        const adminHeaders = { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, "content-type": "application/json" };
        const check = await checkGraduateRegistration(promotionId, registration, serviceKey);
        if (check.error) return noStore({ error: "تعذر التحقق من رقم التسجيل." }, 503);
        const promotion = check.promotion;
        if (!promotion) return noStore({ error: "الدفعة غير موجودة." }, 404);
        if (!check.eligible) return noStore({ error: "رقم التسجيل غير متاح لإنشاء الحساب. تحقق من الرقم أو تواصل مع المشرف الرئيسي." }, 409);
        if (!promotion.graduate_roster_uploaded && fullName.length < 2) return noStore({ error: "أدخل الاسم الكامل." }, 400);
        const allowedDomain = String(promotion.domain ?? "").toLowerCase().replace(/^https?:\/\//, "").split("/")[0]?.split(":")[0] ?? "";
        if (originHost && !PLATFORM_HOSTS.has(originHost) && originHost !== allowedDomain) return noStore({ error: "لا يمكن إنشاء حساب من هذا النطاق." }, 403);

        const created = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
          method: "POST",
          headers: adminHeaders,
          body: JSON.stringify({ email, password, email_confirm: true, user_metadata: { ...(fullName ? { full_name: fullName } : {}), registration_number: registration } }),
        });
        const user = await created.json().catch(() => ({})) as AuthUser;
        if (!created.ok || !user.id) {
          const detail = String(user.msg ?? user.message ?? "");
          const exists = created.status === 422 || /already|registered|exists/i.test(detail + (user.error_code ?? ""));
          return noStore({ error: exists ? "هذا البريد مسجّل مسبقاً. سجّل الدخول بدلاً من إنشاء حساب جديد." : "تعذر إنشاء الحساب حالياً. أعد المحاولة لاحقاً." }, exists ? 409 : 500);
        }

        const signedIn = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
          method: "POST",
          headers: { apikey: SUPABASE_ANON_KEY, "content-type": "application/json" },
          body: JSON.stringify({ email, password }),
        });
        const session = await signedIn.json().catch(() => ({})) as AuthSession;
        if (!signedIn.ok || !session.access_token || !session.refresh_token) {
          await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${encodeURIComponent(user.id)}`, { method: "DELETE", headers: adminHeaders }).catch(() => null);
          return noStore({ error: "تعذر بدء الجلسة بعد إنشاء الحساب. أعد المحاولة." }, 502);
        }
        return noStore({ ok: true, session: { access_token: session.access_token, refresh_token: session.refresh_token }, user: session.user ?? user });
      },
    },
  },
});
