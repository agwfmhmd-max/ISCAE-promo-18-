import { createFileRoute } from "@tanstack/react-router";
import {
  authenticateCaller,
  canManagePromotion,
  fetchPromotion,
  isSuperAdmin,
  json,
  serverEnv,
} from "@/lib/iscae-server";
import { SUPABASE_URL } from "@/lib/iscae-config";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const UUID_RE = /^[0-9a-f-]{36}$/i;
type AuthUser = { id?: string; msg?: string; message?: string; error_code?: string };

/** إنشاء رئيس تخصص (dept_admin) في دفعة المتصل فقط. لا يعتمد Edge Function عامة أو دور service key من المتصفح. */
export const Route = createFileRoute("/api/public/admin/create-admin")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const auth = await authenticateCaller(request);
        if ("error" in auth) return auth.error;
        const { caller, token } = auth;
        if (!isSuperAdmin(caller)) return json({ ok: false, error: "إنشاء رئيس التخصص متاح لرئيس الدفعة أو المشرف العام فقط." }, 403);

        let body: Record<string, unknown>;
        try { body = (await request.json()) as Record<string, unknown>; }
        catch { return json({ ok: false, error: "طلب غير صالح." }, 400); }

        const email = String(body["email"] ?? "").trim().toLowerCase();
        const password = String(body["password"] ?? "");
        const fullName = String(body["full_name"] ?? body["name"] ?? "").trim().slice(0, 120);
        const phone = String(body["phone"] ?? "").trim().slice(0, 40) || null;
        const specialtyId = String(body["specialty_id"] ?? "").trim();
        const promotionId = String(body["promotion_id"] ?? caller.admin?.promotion_id ?? "").trim();
        const isActive = body["is_active"] === undefined ? true : body["is_active"] === true;

        if (!EMAIL_RE.test(email)) return json({ ok: false, error: "البريد الإلكتروني غير صالح." }, 400);
        if (password.length < 6) return json({ ok: false, error: "كلمة المرور يجب ألا تقل عن 6 أحرف." }, 400);
        if (!fullName) return json({ ok: false, error: "الاسم الكامل مطلوب." }, 400);
        if (!UUID_RE.test(promotionId) || !UUID_RE.test(specialtyId)) return json({ ok: false, error: "الدفعة أو التخصص غير صالح." }, 400);
        if (!canManagePromotion(caller, promotionId)) return json({ ok: false, error: "لا تملك صلاحية إدارة هذه الدفعة." }, 403);

        const promotion = await fetchPromotion(promotionId, token);
        if (!promotion) return json({ ok: false, error: "هذه الدفعة غير موجودة." }, 404);

        const serviceKey = serverEnv("SUPABASE_SERVICE_ROLE_KEY") ?? serverEnv("SUPABASE_SERVICE_KEY");
        if (!serviceKey) return json({ ok: false, code: "no_service_key", error: "مفتاح الخدمة غير مضبوط على الخادم." }, 501);
        const adminHeaders = { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, "content-type": "application/json" };

        const specialtyRes = await fetch(`${SUPABASE_URL}/rest/v1/specialties?select=id&id=eq.${encodeURIComponent(specialtyId)}&promotion_id=eq.${encodeURIComponent(promotionId)}&limit=1`, { headers: adminHeaders });
        const specialtyRows = specialtyRes.ok ? (await specialtyRes.json() as Array<{ id: string }>) : [];
        if (!specialtyRes.ok || specialtyRows.length !== 1) return json({ ok: false, error: "التخصص غير موجود ضمن الدفعة المحددة." }, 400);

        const created = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
          method: "POST", headers: adminHeaders,
          body: JSON.stringify({ email, password, email_confirm: true, user_metadata: { full_name: fullName } }),
        });
        const user = await created.json().catch(() => ({})) as AuthUser;
        if (!created.ok || !user.id) {
          const msg = String(user.msg ?? user.message ?? "");
          const exists = created.status === 422 || /already|registered|exists/i.test(msg + (user.error_code ?? ""));
          return json({ ok: false, error: exists ? "هذا البريد مسجّل مسبقاً." : `تعذّر إنشاء الحساب: ${msg || created.status}` }, exists ? 409 : 500);
        }

        const inserted = await fetch(`${SUPABASE_URL}/rest/v1/admins`, {
          method: "POST", headers: { ...adminHeaders, Prefer: "return=representation" },
          body: JSON.stringify({ user_id: user.id, email, full_name: fullName, phone, role: "dept_admin", is_active: isActive, is_platform: false, specialty_id: specialtyId, promotion_id: promotionId }),
        });
        if (!inserted.ok) {
          const detail = (await inserted.text().catch(() => "")).slice(0, 300);
          await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${user.id}`, { method: "DELETE", headers: adminHeaders }).catch(() => null);
          return json({ ok: false, error: `تعذّر حفظ حساب رئيس التخصص: ${detail}` }, 500);
        }
        const rows = await inserted.json().catch(() => []) as Array<{ id?: string }>;
        return json({ ok: true, admin_id: rows[0]?.id ?? null, user_id: user.id, promotion: promotion.number });
      },
    },
  },
});
