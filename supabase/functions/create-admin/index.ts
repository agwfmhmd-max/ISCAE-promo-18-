import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...corsHeaders, "content-type": "application/json; charset=utf-8" },
});

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const authHeader = request.headers.get("Authorization") || request.headers.get("authorization") || "";
  const token = authHeader.replace(/^Bearer\s+/i, "").trim();
  if (!token) return json({ error: "يلزم تسجيل الدخول." }, 401);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !anonKey || !serviceKey) return json({ error: "إعدادات Supabase غير مكتملة على Edge Function." }, 500);

  const callerClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const adminClient = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: userResult, error: userError } = await callerClient.auth.getUser(token);
  const caller = userResult?.user;
  if (userError || !caller?.id || !caller.email) return json({ error: "جلسة غير صالحة." }, 401);

  let payload: Record<string, unknown>;
  try { payload = await request.json(); }
  catch { return json({ error: "بيانات الطلب غير صالحة." }, 400); }

  const email = String(payload.email || "").trim().toLowerCase();
  const password = String(payload.password || "");
  const fullName = String(payload.full_name || payload.name || "").trim();
  const phone = String(payload.phone || "").trim() || null;
  const specialtyId = String(payload.specialty_id || "").trim() || null;
  const promotionId = String(payload.promotion_id || "").trim();
  const requestedRole = String(payload.role || "dept_admin");
  const role = requestedRole === "promotion_admin" ? "promotion_admin" : "dept_admin";
  const isActive = payload.is_active !== false;

  if (!/^\S+@\S+\.\S+$/.test(email)) return json({ error: "البريد الإلكتروني غير صالح." }, 400);
  if (fullName.length < 2 || fullName.length > 120) return json({ error: "الاسم يجب أن يكون بين حرفين و120 حرفًا." }, 400);
  if (!/^[0-9a-f-]{36}$/i.test(promotionId)) return json({ error: "معرف الدفعة غير صالح." }, 400);
  if (role === "dept_admin" && !specialtyId) return json({ error: "يجب اختيار تخصص لرئيس التخصص." }, 400);
  if (role === "promotion_admin" && (specialtyId || caller.email.toLowerCase() !== "agwfmhmd@gmail.com")) {
    return json({ error: "إنشاء رئيس دفعة متاح للمشرف العام فقط." }, 403);
  }
  if (role === "dept_admin" && password.length < 6) return json({ error: "كلمة المرور يجب ألا تقل عن 6 أحرف." }, 400);

  const { data: canManage, error: manageError } = await callerClient.rpc("is_promotion_admin", {
    _promotion_id: promotionId,
  });
  if (manageError || canManage !== true) return json({ error: "لا تملك صلاحية الإدارة في هذه الدفعة." }, 403);
  if (role === "promotion_admin" && caller.email.toLowerCase() !== "agwfmhmd@gmail.com") {
    return json({ error: "المشرف العام فقط يستطيع إنشاء رئيس دفعة." }, 403);
  }

  if (specialtyId) {
    const { data: specialty, error: specialtyError } = await adminClient
      .from("specialties")
      .select("id,promotion_id")
      .eq("id", specialtyId)
      .eq("promotion_id", promotionId)
      .maybeSingle();
    if (specialtyError || !specialty) return json({ error: "التخصص المحدد لا يتبع هذه الدفعة." }, 400);
  }

  // لا نغيّر كلمة مرور أي حساب قائم من خلال لوحة الدفعة.
  if (password.length < 6) return json({ error: "كلمة المرور يجب ألا تقل عن 6 أحرف." }, 400);
  const { data: created, error: createError } = await adminClient.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: fullName },
  });
  if (createError || !created.user) {
    const message = createError?.message || "تعذر إنشاء حساب الدخول.";
    return json({ error: /already|registered|exists/i.test(message) ? "يوجد حساب بهذا البريد مسبقًا؛ لم نغيّر كلمة مروره." : message }, 400);
  }
  const userId = created.user.id;

  const { data: admin, error: adminError } = await adminClient
    .from("admins")
    .upsert({
      user_id: userId,
      full_name: fullName,
      email,
      phone,
      role,
      specialty_id: role === "dept_admin" ? specialtyId : null,
      promotion_id: promotionId,
      is_active: isActive,
    }, { onConflict: "user_id,promotion_id" })
    .select("id,user_id,full_name,email,role,specialty_id,promotion_id,is_active")
    .single();
  if (adminError) {
    await adminClient.auth.admin.deleteUser(userId).catch(() => ({ data: null, error: null }));
    return json({ error: adminError.message }, 400);
  }

  return json({ ok: true, admin });
});
