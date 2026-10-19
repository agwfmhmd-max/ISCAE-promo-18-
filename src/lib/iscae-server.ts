import { SUPABASE_ANON_KEY, SUPABASE_URL } from "./iscae-config";

/** رد JSON موحّد */
export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

/** استخراج توكن الجلسة من ترويسة Authorization */
export function bearerToken(request: Request): string | null {
  const header = request.headers.get("authorization") ?? "";
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  return match ? (match[1] ?? null) : null;
}

export type AdminRow = {
  id: string;
  role: string;
  is_active: boolean | null;
  /** المشرف العام Superviseurs (كل الدفعات) */
  is_platform?: boolean | null;
  /** الدفعة التي ينتمي لها المشرف (NULL للمشرف العام) */
  promotion_id?: string | null;
};
export type AuthedCaller = { userId: string; email: string; admin: AdminRow | null };

/**
 * تحقق حقيقي من الهوية على الخادم:
 * 1) التحقق من التوكن لدى Supabase Auth.
 * 2) قراءة صف المشرف من جدول admins بصلاحيات صاحب الجلسة (RLS مفعّل).
 */
export async function authenticateCaller(
  request: Request,
): Promise<{ caller: AuthedCaller; token: string } | { error: Response }> {
  const token = bearerToken(request);
  if (!token) return { error: json({ error: "غير مصرح: لا يوجد توكن جلسة." }, 401) };

  const userRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${token}` },
  });
  if (!userRes.ok) {
    return { error: json({ error: "جلسة غير صالحة أو منتهية. سجّل الدخول مجدداً." }, 401) };
  }
  const user = (await userRes.json()) as { id?: string; email?: string };
  if (!user.id) return { error: json({ error: "تعذر التحقق من الحساب." }, 401) };

  const adminRes = await fetch(
    `${SUPABASE_URL}/rest/v1/admins?select=*&user_id=eq.${encodeURIComponent(user.id)}&limit=1`,
    { headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${token}` } },
  );
  const rows = adminRes.ok ? ((await adminRes.json()) as AdminRow[]) : [];

  return {
    caller: { userId: user.id, email: user.email ?? "", admin: rows[0] ?? null },
    token,
  };
}

/** هل المتصل هو المشرف الرئيسي الفعّال؟ */
export function isSuperAdmin(caller: AuthedCaller): boolean {
  return !!caller.admin && caller.admin.role === "super_admin" && caller.admin.is_active !== false;
}

/** المشرف العام Superviseurs (له صلاحية على كل الدفعات)؟ */
export function isPlatformAdmin(caller: AuthedCaller): boolean {
  return isSuperAdmin(caller) && !!caller.admin && caller.admin.is_platform === true;
}

/** هل يستطيع المتصل إدارة هذه الدفعة؟ المشرف العام أو رئيس هذه الدفعة نفسها. */
export function canManagePromotion(caller: AuthedCaller, promotionId: string | null | undefined): boolean {
  if (!isSuperAdmin(caller) || !caller.admin) return false;
  if (caller.admin.is_platform === true) return true;
  return !!promotionId && caller.admin.promotion_id === promotionId;
}

/** قراءة متغيّر بيئة من الخادم (Node / Vercel / Nitro). */
export function serverEnv(name: string): string | undefined {
  const g = globalThis as unknown as Record<string, unknown>;
  const sources: Array<unknown> = [
    typeof process !== "undefined" ? (process as { env?: unknown }).env : undefined,
    g["__env__"],
    g["env"],
  ];
  for (const src of sources) {
    if (src && typeof src === "object") {
      const v = (src as Record<string, unknown>)[name];
      if (typeof v === "string" && v.trim() !== "") return v.trim();
    }
  }
  return undefined;
}

export type PromotionRow = {
  id: string;
  number: number;
  slug: string;
  domain: string | null;
  domain_status: string | null;
  logo_url: string | null;
  is_default: boolean | null;
};

/** قراءة صف الدفعة بصلاحيات صاحب الجلسة (جدول promotions مقروء للجميع). */
export async function fetchPromotion(id: string, token: string): Promise<PromotionRow | null> {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/promotions?select=*&id=eq.${encodeURIComponent(id)}&limit=1`,
    { headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${token}` } },
  );
  if (!res.ok) return null;
  const rows = (await res.json()) as PromotionRow[];
  return rows[0] ?? null;
}
