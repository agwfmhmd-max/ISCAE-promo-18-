import { createFileRoute } from "@tanstack/react-router";
import { json, serverEnv } from "@/lib/iscae-server";
import { checkGraduateRegistration } from "@/lib/graduate-registration";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PLATFORM_HOSTS = new Set(["promo-mr.vercel.app", "iscae-promo-18.vercel.app", "iscae-promo-18-eight.vercel.app"]);
const attempts = new Map<string, { count: number; resetAt: number }>();

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
  return current.count > 10;
}

export const Route = createFileRoute("/api/public/graduate-registration-check")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (Number(request.headers.get("content-length") ?? 0) > 4096) return noStore({ error: "حجم الطلب أكبر من المسموح." }, 413);
        if (rateLimited(request)) return noStore({ error: "محاولات كثيرة. انتظر قليلاً ثم أعد المحاولة." }, 429);
        let body: { promotion_id?: unknown; registration_number?: unknown; website?: unknown };
        try { body = await request.json() as typeof body; }
        catch { return noStore({ error: "بيانات الطلب غير صالحة." }, 400); }
        if (String(body.website ?? "").trim()) return noStore({ ok: true, eligible: false });
        const promotionId = String(body.promotion_id ?? "").trim();
        const registration = String(body.registration_number ?? "").trim().toUpperCase();
        if (!UUID_RE.test(promotionId) || !/^[A-Z0-9-]{1,64}$/.test(registration)) return noStore({ ok: false, eligible: false, message: "تعذر التحقق من رقم التسجيل. راجع صيغة الرقم أو تواصل مع الإدارة." }, 400);
        const serviceKey = serverEnv("SUPABASE_SERVICE_ROLE_KEY") ?? serverEnv("SUPABASE_SERVICE_KEY");
        if (!serviceKey) return noStore({ error: "التحقق غير متاح مؤقتًا." }, 503);
        const check = await checkGraduateRegistration(promotionId, registration, serviceKey);
        if (check.error) return noStore({ error: "تعذر التحقق مؤقتًا. أعد المحاولة لاحقًا." }, 503);
        const origin = request.headers.get("origin");
        if (origin && check.promotion) {
          let host = "";
          try { host = new URL(origin).hostname.toLowerCase(); }
          catch { return noStore({ error: "مصدر الطلب غير صالح." }, 403); }
          const allowedDomain = String(check.promotion.domain ?? "").toLowerCase().replace(/^https?:\/\//, "").split("/")[0]?.split(":")[0] ?? "";
          if (!PLATFORM_HOSTS.has(host) && host !== allowedDomain) return noStore({ error: "لا يمكن تنفيذ الطلب من هذا النطاق." }, 403);
        }
        if (!check.eligible) return noStore({ ok: false, eligible: false, message: "رقم التسجيل غير متاح لإنشاء الحساب. تحقق من الرقم أو تواصل مع المشرف الرئيسي." }, 409);
        return noStore({ ok: true, eligible: true, message: "تم التحقق من رقم التسجيل. أكمل إنشاء الحساب." });
      },
    },
  },
});
