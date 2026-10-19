import { createFileRoute } from "@tanstack/react-router";
import {
  authenticateCaller,
  fetchPromotion,
  isPlatformAdmin,
  json,
  serverEnv,
} from "@/lib/iscae-server";
import { SUPABASE_URL } from "@/lib/iscae-config";

/**
 * إنشاء حساب «رئيس الدفعة» (role = super_admin داخل دفعته فقط) — للمشرف العام فقط.
 * يحتاج مفتاح الخدمة السري على الخادم: SUPABASE_SERVICE_ROLE_KEY
 * (Vercel ▸ Settings ▸ Environment Variables). لا يوجد أي مفتاح سري في الواجهة.
 * إن لم يوجد المفتاح يعيد code = "no_service_key" فتستعمل الواجهة مساراً احتياطياً (signUp + دالة SQL).
 */

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type AuthUser = { id?: string; msg?: string; message?: string; error_code?: string };

export const Route = createFileRoute("/api/public/admin/create-head")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const auth = await authenticateCaller(request);
        if ("error" in auth) return auth.error;
        const { caller, token } = auth;
        if (!isPlatformAdmin(caller)) {
          return json({ ok: false, error: "❌ إنشاء رئيس الدفعة للمشرف العام (Superviseurs) فقط." }, 403);
        }

        let body: Record<string, unknown>;
        try {
          body = (await request.json()) as Record<string, unknown>;
        } catch {
          return json({ ok: false, error: "❌ طلب غير صالح." }, 400);
        }
        const email = String(body["email"] ?? "").trim().toLowerCase();
        const password = String(body["password"] ?? "");
        const fullName = String(body["full_name"] ?? "").trim().slice(0, 120);
        const phone = String(body["phone"] ?? "").trim().slice(0, 40) || null;
        const promotionId = String(body["promotion_id"] ?? "").trim();

        if (!EMAIL_RE.test(email)) return json({ ok: false, error: "❌ البريد الإلكتروني غير صالح." }, 400);
        if (password.length < 6) return json({ ok: false, error: "❌ كلمة المرور 6 أحرف على الأقل." }, 400);
        if (!fullName) return json({ ok: false, error: "❌ الاسم الكامل مطلوب." }, 400);
        if (!/^[0-9a-f-]{36}$/i.test(promotionId)) return json({ ok: false, error: "❌ الدفعة غير محددة." }, 400);

        const promo = await fetchPromotion(promotionId, token);
        if (!promo) return json({ ok: false, error: "❌ الدفعة غير موجودة." }, 404);

        const serviceKey = serverEnv("SUPABASE_SERVICE_ROLE_KEY") ?? serverEnv("SUPABASE_SERVICE_KEY");
        if (!serviceKey) {
          return json({ ok: false, code: "no_service_key", error: "SUPABASE_SERVICE_ROLE_KEY غير مضبوط على الخادم." }, 501);
        }
        const sk = { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, "content-type": "application/json" };

        // 1) حساب المصادقة (مفعّل مباشرة)
        const created = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
          method: "POST",
          headers: sk,
          body: JSON.stringify({
            email,
            password,
            email_confirm: true,
            user_metadata: { full_name: fullName },
          }),
        });
        const user = (await created.json().catch(() => ({}))) as AuthUser;
        if (!created.ok || !user.id) {
          const msg = String(user.msg ?? user.message ?? "");
          const exists = created.status === 422 || /already|registered|exists/i.test(msg + (user.error_code ?? ""));
          return json(
            { ok: false, error: exists ? "❌ هذا البريد مسجَّل مسبقاً." : `❌ تعذّر إنشاء الحساب: ${msg || created.status}` },
            exists ? 409 : 500,
          );
        }

        // 2) صف المشرف: رئيس هذه الدفعة
        const ins = await fetch(`${SUPABASE_URL}/rest/v1/admins`, {
          method: "POST",
          headers: { ...sk, Prefer: "return=representation" },
          body: JSON.stringify({
            user_id: user.id,
            email,
            full_name: fullName,
            phone,
            role: "super_admin",
            is_active: true,
            is_platform: false,
            promotion_id: promo.id,
          }),
        });
        if (!ins.ok) {
          const detail = (await ins.text().catch(() => "")).slice(0, 300);
          // تراجع: لا نترك حساب Auth يتيماً
          await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${user.id}`, { method: "DELETE", headers: sk }).catch(() => null);
          return json({ ok: false, error: `❌ تعذّر حفظ صف المشرف: ${detail}` }, 500);
        }
        const rows = (await ins.json().catch(() => [])) as Array<{ id?: string }>;
        return json({ ok: true, admin_id: rows[0]?.id ?? null, user_id: user.id, promotion: promo.number });
      },
    },
  },
});
