begin;

-- =============================================================================
-- MULTI-PROMO.sql — نظام الدفعات المتعددة
--   Superviseurs (المشرف العام)  ←  رؤساء الدفعات  ←  رؤساء التخصصات
--
-- Supabase Dashboard ▸ SQL Editor ▸ الصق الملف كاملاً ▸ Run
-- • آمن لإعادة التنفيذ (idempotent) ولا يحذف أي بيانات موجودة.
-- • كل بياناتك الحالية تُنسب تلقائياً إلى «الدفعة 18» (الدفعة الافتراضية).
-- • يتطلب وجود: public.admins و public.specialties و public.students
--   و public.settings (موجودة) — والملفات القديمة (NOTIFICATIONS*.sql, STATS.sql,
--   PROMOTION.sql, MULTI-HEADS.sql) مُنفَّذة سابقاً.
--
-- النموذج:
--   • public.promotions  : صف لكل دفعة (الرقم، الرابط، الاسم، الشعار).
--   • عمود promotion_id في كل جدول بيانات (التخصصات، الطلاب، الإعدادات، الحفلات،
--     أنواع البطاقات، المشرفون، الإشعارات، الاشتراكات، الزيارات).
--   • admins.is_platform = true  → المشرف العام Superviseurs (كل الدفعات).
--   • admins.role = 'super_admin' + promotion_id = N → رئيس الدفعة N
--       (له نفس صلاحيات المشرف الرئيسي السابقة لكن داخل دفعته فقط).
--   • admins.role = 'dept_admin' → رئيس تخصص داخل دفعته (كما كان).
--   • سياسات RLS من نوع RESTRICTIVE تمنع أي مشرف من لمس بيانات دفعة غيره
--     حتى لو تجاوز واجهة الموقع.
-- =============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- 1) جدول الدفعات
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.promotions (
  id            uuid primary key default gen_random_uuid(),
  number        int  not null check (number > 0 and number < 1000),
  slug          text not null,                       -- iscae-promo-19
  domain        text,                                -- iscae-promo-19.vercel.app
  domain_status text not null default 'pending',     -- pending | active | manual | error
  name_fr       text,
  name_ar       text,
  logo_url      text,                                -- NULL = شعار تلقائي حسب الرقم
  is_default    boolean not null default false,      -- الدفعة القديمة (18)
  created_by    uuid references auth.users(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create unique index if not exists promotions_number_uniq  on public.promotions (number);
create unique index if not exists promotions_slug_uniq    on public.promotions (slug);
create unique index if not exists promotions_domain_uniq  on public.promotions (lower(domain)) where domain is not null;
create unique index if not exists promotions_one_default  on public.promotions ((true)) where is_default;

-- الدفعة الافتراضية = الدفعة الحالية (تُنقل هويتها من promotion_settings إن وُجد)
do $$
declare
  v_num  int  := null;
  v_fr   text := null;
  v_ar   text := null;
  v_logo text := null;
begin
  if to_regclass('public.promotion_settings') is not null then
    begin
      execute 'select promotion_number, promotion_name_fr, promotion_name_ar, promotion_logo_url
               from public.promotion_settings where id = 1'
        into v_num, v_fr, v_ar, v_logo;
    exception when others then
      v_num := null;
    end;
  end if;
  v_num := coalesce(v_num, 18);

  if not exists (select 1 from public.promotions where is_default) then
    insert into public.promotions (number, slug, domain, domain_status, name_fr, name_ar, logo_url, is_default)
    values (v_num, 'iscae-promo-' || v_num, case when v_num=18 then 'iscae-promo-18-eight.vercel.app' else 'iscae-promo-' || v_num || '.vercel.app' end, 'active', v_fr, v_ar, v_logo, true)
    on conflict (number) do update set is_default = true
      where not exists (select 1 from public.promotions p2 where p2.is_default);
  end if;
end $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2) أعمدة الانتماء إلى الدفعة + نسب البيانات الحالية للدفعة الافتراضية
-- ─────────────────────────────────────────────────────────────────────────────
alter table public.admins add column if not exists is_platform boolean not null default false;
update public.admins set is_platform = true
  where lower(email)=lower('agwfmhmd@gmail.com') and role='super_admin' and is_active=true;
do $$
begin
  if not exists (select 1 from public.admins where lower(email)=lower('agwfmhmd@gmail.com')
                 and role='super_admin' and is_active=true and is_platform=true) then
    raise exception 'Active Superviseurs account agwfmhmd@gmail.com was not found; create/activate it before migration.';
  end if;
end $$;

do $$
declare
  t   text;
  pid uuid;
begin
  select id into pid from public.promotions where is_default limit 1;
  foreach t in array array[
    'specialties','students','settings','ceremonies','ceremony_card_types',
    'student_ceremony_cards','admins','notifications','push_subscriptions','site_visits','promotion_settings'
  ] loop
    if exists (select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
               where n.nspname = 'public' and c.relname = t and c.relkind in ('r','p')) then
      execute format('alter table public.%I add column if not exists promotion_id uuid references public.promotions(id) on delete cascade', t);
      if t = 'admins' then
        execute 'update public.admins set promotion_id = $1 where promotion_id is null and not coalesce(is_platform,false)' using pid;
      else
        execute format('update public.%I set promotion_id = $1 where promotion_id is null', t) using pid;
      end if;
      execute format('create index if not exists %I on public.%I (promotion_id)', t || '_promotion_id_idx', t);
    else
      raise notice 'الجدول % غير موجود كجدول عادي — تم تجاوزه.', t;
    end if;
  end loop;
end $$;

-- endpoint remains the legacy primary key; id supports stable pagination and server cleanup.
alter table public.push_subscriptions add column if not exists id uuid;
update public.push_subscriptions set id = gen_random_uuid() where id is null;
alter table public.push_subscriptions alter column id set default gen_random_uuid();
alter table public.push_subscriptions alter column id set not null;
create unique index if not exists push_subscriptions_id_uniq on public.push_subscriptions(id);

-- ─────────────────────────────────────────────────────────────────────────────
-- 3) دوال الصلاحيات
-- ─────────────────────────────────────────────────────────────────────────────
-- المشرف العام (Superviseurs)
create or replace function public.is_platform_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.admins a
    where a.user_id = auth.uid() and a.is_platform and coalesce(a.is_active, true)
  );
$$;

-- دفعة المشرف الحالي (NULL للمشرف العام أو لغير المسجّلين)
create or replace function public.my_promotion_id()
returns uuid language sql stable security definer set search_path = public as $$
  select a.promotion_id from public.admins a
  where a.user_id = auth.uid() and coalesce(a.is_active, true)
  order by a.is_platform desc limit 1;
$$;

-- يوقّع الخادم claim الدفعة بعد التحقق من المضيف والحساب؛ لا نعتمد على فلتر الواجهة.
create or replace function public.current_promotion_id()
returns uuid language sql stable security definer set search_path = public as $$
  select coalesce(nullif(auth.jwt()->'app_metadata'->>'promotion_id','')::uuid, public.my_promotion_id());
$$;

create or replace function public.mp_can_read(_pid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_platform_admin() or (_pid is not null and _pid = public.current_promotion_id());
$$;

-- هل يستطيع المستخدم الحالي إدارة هذه الدفعة (مشرف عام أو رئيس هذه الدفعة)؟
create or replace function public.can_manage_promotion(_pid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_platform_admin() or (
    _pid is not null and exists (
      select 1 from public.admins a
      where a.user_id = auth.uid() and a.role = 'super_admin'
        and coalesce(a.is_active, true) and a.promotion_id = _pid
    )
  );
$$;

-- هل يحق للمشرف الحالي كتابة صف ينتمي لهذه الدفعة (رئيس تخصص أيضاً داخل دفعته)؟
create or replace function public.mp_can_write(_pid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_platform_admin() or (_pid is not null and _pid = public.my_promotion_id());
$$;

grant execute on function public.is_platform_admin()            to anon, authenticated, service_role;
grant execute on function public.my_promotion_id()              to anon, authenticated, service_role;
grant execute on function public.current_promotion_id()          to anon, authenticated, service_role;
grant execute on function public.mp_can_read(uuid)               to anon, authenticated, service_role;

create or replace function public.mp_is_default_promotion(_pid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists(select 1 from public.promotions p where p.id = _pid and p.is_default);
$$;
grant execute on function public.mp_is_default_promotion(uuid) to anon, authenticated, service_role;
grant execute on function public.can_manage_promotion(uuid)     to anon, authenticated, service_role;
grant execute on function public.mp_can_write(uuid)             to anon, authenticated, service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4) تعبئة promotion_id تلقائياً عند الإدراج (احتياط إضافي فوق ما يرسله الموقع)
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.mp_set_promotion_id()
returns trigger language plpgsql security definer set search_path = public as $$
declare v uuid;
begin
  if new.promotion_id is null then
    if tg_table_name = 'students' then
      select s.promotion_id into v from public.specialties s where s.id = new.specialty_id;
    elsif tg_table_name = 'admins' then
      if new.specialty_id is not null then
        select s.promotion_id into v from public.specialties s where s.id = new.specialty_id;
      end if;
    elsif tg_table_name = 'ceremony_card_types' then
      select c.promotion_id into v from public.ceremonies c where c.id = new.ceremony_id;
    end if;
    if v is null then
      if tg_table_name = 'admins' then
        -- حساب المشرف العام يبقى بلا دفعة؛ غيره يأخذ دفعة من أنشأه
        if not coalesce(new.is_platform, false) then v := public.my_promotion_id(); end if;
      else
        v := public.my_promotion_id();
      end if;
    end if;
    new.promotion_id := v;
  end if;
  return new;
end $$;

do $$
declare t text;
begin
  foreach t in array array['specialties','students','settings','ceremonies','ceremony_card_types','admins','notifications','push_subscriptions','site_visits','promotion_settings'] loop
    if exists (select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
               where n.nspname = 'public' and c.relname = t and c.relkind in ('r','p')) then
      execute format('drop trigger if exists aa_mp_set_promotion_id on public.%I', t);
      execute format('create trigger aa_mp_set_promotion_id before insert on public.%I for each row execute function public.mp_set_promotion_id()', t);
    end if;
  end loop;
end $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5) القيود الفريدة تصبح «لكل دفعة» (حتى يمكن تكرار أسماء التخصصات وأرقام التسجيل بين الدفعات)
-- ─────────────────────────────────────────────────────────────────────────────
-- 5-أ) رقم التسجيل (الفهرس الفريد العالمي من MULTI-HEADS.sql ← فريد داخل الدفعة)
drop index if exists public.students_registration_number_uniq;
do $$
begin
  if exists (select 1 from public.students
             group by promotion_id, upper(btrim(registration_number)) having count(*) > 1) then
    raise notice 'يوجد طلاب بنفس رقم التسجيل داخل الدفعة نفسها — لم يُنشأ الفهرس الفريد. راجع التكرارات.';
  else
    create unique index if not exists students_promo_registration_number_uniq
      on public.students (promotion_id, upper(btrim(registration_number)));
  end if;
end $$;

-- 5-ب) أي قيد/فهرس فريد على عمود واحد (غير المفتاح الأساسي) في هذه الجداول يُستبدل بنسخة (promotion_id, العمود)
do $$
declare
  t   text;
  r   record;
  col text;
  new_idx text;
begin
  foreach t in array array['specialties','students','ceremonies','ceremony_card_types'] loop
    continue when not exists (select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
                              where n.nspname = 'public' and c.relname = t and c.relkind in ('r','p'));
    for r in
      select i.indexrelid::regclass::text as idx_name, i.indkey[0] as attnum, c.conname as con_name
      from pg_index i
      join pg_class tc on tc.oid = i.indrelid
      join pg_namespace n on n.oid = tc.relnamespace
      left join pg_constraint c on c.conindid = i.indexrelid and c.contype = 'u'
      where n.nspname = 'public' and tc.relname = t
        and i.indisunique and not i.indisprimary
        and i.indnatts = 1 and i.indkey[0] > 0
        and i.indpred is null and i.indexprs is null
    loop
      select a.attname into col from pg_attribute a
        where a.attrelid = ('public.' || t)::regclass and a.attnum = r.attnum;
      continue when col is null or col = 'promotion_id' or col = 'id';
      new_idx := left(t || '_promo_' || col || '_uniq', 60);
      begin
        execute format('create unique index if not exists %I on public.%I (promotion_id, %I)', new_idx, t, col);
        if r.con_name is not null then
          execute format('alter table public.%I drop constraint %I', t, r.con_name);
        else
          execute format('drop index if exists %s', r.idx_name);
        end if;
        raise notice 'تم تحويل القيد الفريد على %.% إلى قيد لكل دفعة', t, col;
      exception when others then
        raise notice 'تعذّر تحويل القيد الفريد على %.% : %', t, col, sqlerrm;
      end;
    end loop;
  end loop;
end $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 6) الإعدادات: صف لكل دفعة (كان صفاً وحيداً id = 1)
-- ─────────────────────────────────────────────────────────────────────────────
do $$
declare c record; m bigint;
begin
  -- إزالة أي CHECK يحصر الجدول في id = 1
  for c in
    select conname from pg_constraint
    where conrelid = 'public.settings'::regclass and contype = 'c'
      and pg_get_constraintdef(oid) ~* '\mid\M\s*=\s*1'
  loop
    execute format('alter table public.settings drop constraint %I', c.conname);
  end loop;

  create sequence if not exists public.settings_id_seq;
  select coalesce(max(id), 0) + 1 into m from public.settings;
  perform setval('public.settings_id_seq', greatest(m, 2), false);
  begin
    alter table public.settings alter column id set default nextval('public.settings_id_seq');
  exception when others then
    raise notice 'تعذّر ضبط القيمة الافتراضية لـ settings.id (سيُحدَّد يدوياً عند إنشاء الدفعة): %', sqlerrm;
  end;
end $$;
create unique index if not exists settings_promotion_uniq on public.settings (promotion_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- 7) RLS: الدفعات + سياسات «حصر الدفعة» (RESTRICTIVE فوق السياسات الحالية ولا تستبدلها)
-- ─────────────────────────────────────────────────────────────────────────────
alter table public.promotions enable row level security;

drop policy if exists "promotions readable by everyone" on public.promotions;
create policy "promotions readable by everyone" on public.promotions
  for select to anon, authenticated using (true);

drop policy if exists "promotion managers update promotion" on public.promotions;
create policy "promotion managers update promotion" on public.promotions
  for update to authenticated
  using (public.can_manage_promotion(id)) with check (public.can_manage_promotion(id));

revoke all on public.promotions from anon, authenticated;
grant select on public.promotions to anon, authenticated;
grant update (name_fr, name_ar, logo_url, domain, domain_status) on public.promotions to authenticated;
grant all on public.promotions to service_role;

-- رئيس الدفعة يعدّل الاسم والشعار فقط؛ الرقم والرابط والحالة للمشرف العام
create or replace function public.promotions_guard()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.number     := old.number;
  new.slug       := old.slug;
  new.is_default := old.is_default;
  new.created_at := old.created_at;
  new.created_by := old.created_by;
  new.updated_at := now();
  new.name_fr    := nullif(btrim(new.name_fr), '');
  new.name_ar    := nullif(btrim(new.name_ar), '');
  if auth.uid() is not null and not public.is_platform_admin() then
    new.domain        := old.domain;
    new.domain_status := old.domain_status;
  end if;
  return new;
end $$;
drop trigger if exists trg_promotions_guard on public.promotions;
create trigger trg_promotions_guard before update on public.promotions
  for each row execute function public.promotions_guard();

-- سياسات الحصر على جداول البيانات (تُنشأ فقط للجداول التي RLS مفعّل عليها أصلاً)
do $$
declare t text;
begin
  foreach t in array array['specialties','students','settings','ceremonies','ceremony_card_types','student_ceremony_cards','admins','notifications','site_visits','promotion_settings'] loop
    continue when not exists (
      select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relname = t and c.relkind in ('r','p'));
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists mp_scope_select on public.%I', t);
    execute format('drop policy if exists mp_scope_insert on public.%I', t);
    execute format('drop policy if exists mp_scope_update on public.%I', t);
    execute format('drop policy if exists mp_scope_delete on public.%I', t);
    execute format('create policy mp_scope_select on public.%I as restrictive for select to anon, authenticated using (public.mp_can_read(promotion_id))', t);
    execute format('create policy mp_scope_insert on public.%I as restrictive for insert to authenticated with check (public.mp_can_write(promotion_id))', t);
    execute format('create policy mp_scope_update on public.%I as restrictive for update to authenticated using (public.mp_can_write(promotion_id)) with check (public.mp_can_write(promotion_id))', t);
    execute format('create policy mp_scope_delete on public.%I as restrictive for delete to authenticated using (public.mp_can_write(promotion_id))', t);
  end loop;
end $$;

-- زوار الموقع يستطيعون الاشتراك/إلغاء الاشتراك من أجهزتهم داخل الدفعة الحالية فقط.
alter table public.push_subscriptions enable row level security;
drop policy if exists mp_scope_select on public.push_subscriptions;
drop policy if exists mp_scope_insert on public.push_subscriptions;
drop policy if exists mp_scope_update on public.push_subscriptions;
drop policy if exists mp_scope_delete on public.push_subscriptions;
create policy mp_scope_select on public.push_subscriptions as restrictive for select to anon, authenticated
  using (public.mp_can_read(promotion_id));
create policy mp_scope_insert on public.push_subscriptions as restrictive for insert to anon, authenticated
  with check (promotion_id = public.current_promotion_id());
create policy mp_scope_update on public.push_subscriptions as restrictive for update to anon, authenticated
  using (promotion_id = public.current_promotion_id()) with check (promotion_id = public.current_promotion_id());
create policy mp_scope_delete on public.push_subscriptions as restrictive for delete to anon, authenticated
  using (promotion_id = public.current_promotion_id());

-- المشرفون: كل رئيس يرى مشرفي دفعته فقط، ولا أحد غير المشرف العام يمنح صلاحية المشرف العام
drop policy if exists mp_admins_select_scope on public.admins;
create policy mp_admins_select_scope on public.admins
  as restrictive for select to authenticated
  using (public.is_platform_admin() or user_id = auth.uid() or promotion_id = public.my_promotion_id());

drop policy if exists mp_admins_no_escalation_ins on public.admins;
create policy mp_admins_no_escalation_ins on public.admins
  as restrictive for insert to authenticated
  with check ((not coalesce(is_platform, false) or public.is_platform_admin())
    and (role <> 'super_admin' or public.is_platform_admin()));

drop policy if exists mp_admins_no_escalation_upd on public.admins;
create policy mp_admins_no_escalation_upd on public.admins
  as restrictive for update to authenticated
  with check ((not coalesce(is_platform, false) or public.is_platform_admin())
    and (role <> 'super_admin' or public.is_platform_admin() or user_id = auth.uid()));

-- الاشتراكات: رئيس الدفعة يقرأ اشتراكات دفعته فقط (كانت لكل super_admin = كل الاشتراكات)
drop policy if exists "super admin can read subscriptions" on public.push_subscriptions;
drop policy if exists "promotion managers read subscriptions" on public.push_subscriptions;
create policy "promotion managers read subscriptions" on public.push_subscriptions
  for select to authenticated using (public.can_manage_promotion(promotion_id));

-- الإشعارات: الإدراج/التحديث لمدير الدفعة المعنية فقط
drop policy if exists "super admin can insert notifications" on public.notifications;
drop policy if exists "promotion managers insert notifications" on public.notifications;
create policy "promotion managers insert notifications" on public.notifications
  for insert to authenticated with check (public.can_manage_promotion(promotion_id));

drop policy if exists "super admin can update notifications" on public.notifications;
drop policy if exists "promotion managers update notifications" on public.notifications;
create policy "promotion managers update notifications" on public.notifications
  for update to authenticated
  using (public.can_manage_promotion(promotion_id)) with check (public.can_manage_promotion(promotion_id));

-- الزيارات: قراءة إحصائيات الدفعة لمديرها
drop policy if exists "super admin reads visits" on public.site_visits;
drop policy if exists "promotion managers read visits" on public.site_visits;
create policy "promotion managers read visits" on public.site_visits
  for select to authenticated using (public.can_manage_promotion(promotion_id));

-- حاوية الصور خاصة (حاويات public تتجاوز RLS). تظل الملفات القديمة للدفعة الافتراضية
-- قابلة للتوقيع إلى أن ينقلها سكربت الترحيل المرفق، ولا تُتاح لدفعة أخرى.
update storage.buckets set public = false where id = 'student-photos';
do $$
declare p record;
begin
  for p in select policyname from pg_policies where schemaname='storage' and tablename='objects'
           and (coalesce(qual,'') ilike '%student-photos%' or coalesce(with_check,'') ilike '%student-photos%')
  loop
    execute format('drop policy if exists %I on storage.objects', p.policyname);
  end loop;
end $$;
drop policy if exists mp_student_photos_select on storage.objects;
drop policy if exists mp_student_photos_insert on storage.objects;
drop policy if exists mp_student_photos_update on storage.objects;
drop policy if exists mp_student_photos_delete on storage.objects;
create policy mp_student_photos_select on storage.objects for select to anon, authenticated
  using (bucket_id='student-photos' and (
    name like ('promotions/' || public.current_promotion_id()::text || '/%')
    or (public.mp_is_default_promotion(public.current_promotion_id()) and (name like 'students/%' or name like 'promotion/%'))
  ));
create policy mp_student_photos_insert on storage.objects for insert to authenticated
  with check (bucket_id='student-photos' and name like ('promotions/' || public.current_promotion_id()::text || '/%')
    and public.mp_can_write(public.current_promotion_id()));
create policy mp_student_photos_update on storage.objects for update to authenticated
  using (bucket_id='student-photos' and (name like ('promotions/' || public.current_promotion_id()::text || '/%')
    or (public.mp_is_default_promotion(public.current_promotion_id()) and (name like 'students/%' or name like 'promotion/%')))
    and public.mp_can_write(public.current_promotion_id()))
  with check (bucket_id='student-photos' and name like ('promotions/' || public.current_promotion_id()::text || '/%')
    and public.mp_can_write(public.current_promotion_id()));
create policy mp_student_photos_delete on storage.objects for delete to authenticated
  using (bucket_id='student-photos' and (name like ('promotions/' || public.current_promotion_id()::text || '/%')
    or (public.mp_is_default_promotion(public.current_promotion_id()) and (name like 'students/%' or name like 'promotion/%')))
    and public.mp_can_write(public.current_promotion_id()));

-- ─────────────────────────────────────────────────────────────────────────────
-- 8) دوال الإشعارات (لكل دفعة)  —  تُستبدل التواقيع القديمة بتواقيع تقبل p_promo
-- ─────────────────────────────────────────────────────────────────────────────
drop function if exists public.save_push_subscription(text, text, text, text, text, text);
create or replace function public.save_push_subscription(
  p_endpoint   text,
  p_p256dh     text,
  p_auth       text,
  p_device_id  text default null,
  p_user_agent text default null,
  p_lang       text default 'ar',
  p_promo      uuid default null
)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_promo uuid;
begin
  if p_endpoint is null or p_p256dh is null or p_auth is null then
    raise exception 'endpoint/p256dh/auth are required';
  end if;
  v_promo := coalesce(p_promo, public.current_promotion_id());
  if v_promo is null or v_promo <> public.current_promotion_id() then
    raise exception 'promotion scope mismatch';
  end if;

  insert into public.push_subscriptions
    (endpoint, p256dh, auth, device_id, user_agent, lang, is_active, user_id, promotion_id, updated_at)
  values
    (p_endpoint, p_p256dh, p_auth, p_device_id, left(coalesce(p_user_agent, ''), 300),
     coalesce(p_lang, 'ar'), true, auth.uid(), v_promo, now())
  on conflict (endpoint) do update
    set p256dh       = excluded.p256dh,
        auth         = excluded.auth,
        device_id    = coalesce(excluded.device_id, public.push_subscriptions.device_id),
        user_agent   = coalesce(excluded.user_agent, public.push_subscriptions.user_agent),
        lang         = coalesce(excluded.lang, public.push_subscriptions.lang),
        is_active    = true,
        user_id      = coalesce(excluded.user_id, public.push_subscriptions.user_id),
        promotion_id = excluded.promotion_id,
        updated_at   = now()
    where public.push_subscriptions.promotion_id = excluded.promotion_id
  returning id into v_id;
  if v_id is null then raise exception 'endpoint belongs to another promotion'; end if;
  return v_id;
end $$;

drop function if exists public.count_active_push_subscriptions();
create or replace function public.count_active_push_subscriptions(p_promo uuid default null)
returns integer language plpgsql stable security definer set search_path = public as $$
begin
  if p_promo is null then
    if not public.is_platform_admin() then raise exception 'forbidden'; end if;
  elsif not public.can_manage_promotion(p_promo) then
    raise exception 'forbidden';
  end if;
  return (select count(*)::int from public.push_subscriptions s
          where s.is_active and (p_promo is null or s.promotion_id = p_promo));
end $$;

drop function if exists public.get_active_push_subscriptions();
create or replace function public.get_active_push_subscriptions(p_promo uuid default null)
returns table (id uuid, endpoint text, p256dh text, auth text)
language plpgsql stable security definer set search_path = public as $$
begin
  if p_promo is null then
    if not public.is_platform_admin() then raise exception 'forbidden'; end if;
  elsif not public.can_manage_promotion(p_promo) then
    raise exception 'forbidden';
  end if;
  return query
    select s.id, s.endpoint, s.p256dh, s.auth
    from public.push_subscriptions s
    where s.is_active
      and s.endpoint is not null and s.p256dh is not null and s.auth is not null
      and (p_promo is null or s.promotion_id = p_promo);
end $$;

create or replace function public.delete_push_subscriptions(p_ids uuid[])
returns integer language plpgsql security definer set search_path = public as $$
declare v_count integer;
begin
  if p_ids is null then return 0; end if;
  delete from public.push_subscriptions s
  where s.id = any(p_ids) and public.can_manage_promotion(s.promotion_id);
  get diagnostics v_count = row_count;
  return v_count;
end $$;

revoke all on function public.save_push_subscription(text, text, text, text, text, text, uuid) from public;
grant execute on function public.save_push_subscription(text, text, text, text, text, text, uuid) to anon, authenticated, service_role;
revoke all on function public.count_active_push_subscriptions(uuid) from public;
grant execute on function public.count_active_push_subscriptions(uuid) to authenticated, service_role;
revoke all on function public.get_active_push_subscriptions(uuid) from public;
grant execute on function public.get_active_push_subscriptions(uuid) to authenticated, service_role;
revoke all on function public.delete_push_subscriptions(uuid[]) from public;
grant execute on function public.delete_push_subscriptions(uuid[]) to authenticated, service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 9) دوال إحصائيات الزوار (لكل دفعة)
-- ─────────────────────────────────────────────────────────────────────────────
drop function if exists public.track_visit(text, text, text, text);
create or replace function public.track_visit(
  _visitor text, _lang text default null, _device text default null, _path text default null, _promo uuid default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  if _visitor is null or char_length(_visitor) not between 8 and 64 then return; end if;
  if coalesce(_promo, public.current_promotion_id()) is null
     or coalesce(_promo, public.current_promotion_id()) <> public.current_promotion_id() then
    raise exception 'promotion scope mismatch';
  end if;
  insert into public.site_visits (visitor_id, lang, device, path, promotion_id)
  values (_visitor, left(_lang, 8), left(_device, 16), left(_path, 200),
          coalesce(_promo, public.current_promotion_id()));
end $$;
revoke all on function public.track_visit(text, text, text, text, uuid) from public;
grant execute on function public.track_visit(text, text, text, text, uuid) to anon, authenticated;

drop function if exists public.get_visit_stats(timestamptz, timestamptz, text, text);
create or replace function public.get_visit_stats(
  _from timestamptz, _to timestamptz, _tz text default 'UTC', _bucket text default 'day', _promo uuid default null)
returns table (day date, visits bigint, unique_visitors bigint)
language plpgsql stable security definer set search_path = public as $$
begin
  if _promo is null then
    if not public.is_platform_admin() then raise exception 'forbidden'; end if;
  elsif not public.can_manage_promotion(_promo) then
    raise exception 'forbidden';
  end if;
  if _bucket not in ('day','week','month') then _bucket := 'day'; end if;
  return query
    select date_trunc(_bucket, v.visited_at at time zone _tz)::date as d, count(*)::bigint, count(distinct v.visitor_id)::bigint
    from public.site_visits v
    where v.visited_at >= _from and v.visited_at < _to and (_promo is null or v.promotion_id = _promo)
    group by 1 order by 1;
end $$;
revoke all on function public.get_visit_stats(timestamptz, timestamptz, text, text, uuid) from public;
grant execute on function public.get_visit_stats(timestamptz, timestamptz, text, text, uuid) to authenticated;

drop function if exists public.get_visit_totals(timestamptz, timestamptz);
create or replace function public.get_visit_totals(_from timestamptz, _to timestamptz, _promo uuid default null)
returns table (visits bigint, unique_visitors bigint)
language plpgsql stable security definer set search_path = public as $$
begin
  if _promo is null then
    if not public.is_platform_admin() then raise exception 'forbidden'; end if;
  elsif not public.can_manage_promotion(_promo) then
    raise exception 'forbidden';
  end if;
  return query
    select count(*)::bigint, count(distinct v.visitor_id)::bigint
    from public.site_visits v
    where v.visited_at >= _from and v.visited_at < _to and (_promo is null or v.promotion_id = _promo);
end $$;
revoke all on function public.get_visit_totals(timestamptz, timestamptz, uuid) from public;
grant execute on function public.get_visit_totals(timestamptz, timestamptz, uuid) to authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 10) دوال المشرف العام: إنشاء/حذف/نظرة عامة على الدفعات + ربط حساب مشرف
-- ─────────────────────────────────────────────────────────────────────────────
-- إنشاء دفعة جديدة (الشعار يُولَّد تلقائياً في الموقع حسب الرقم عندما logo_url = NULL)
create or replace function public.platform_create_promotion(
  _number int, _name_fr text default null, _name_ar text default null)
returns public.promotions language plpgsql security definer set search_path = public as $$
declare v public.promotions; v_sid bigint; legacy public.settings;
begin
  if not public.is_platform_admin() then raise exception 'FORBIDDEN'; end if;
  if _number is null or _number < 1 or _number > 999 then raise exception 'INVALID_NUMBER'; end if;
  if exists (select 1 from public.promotions where number = _number) then raise exception 'PROMO_EXISTS'; end if;

  insert into public.promotions (number, slug, domain, domain_status, name_fr, name_ar, created_by)
  values (_number, 'iscae-promo-' || _number, 'iscae-promo-' || _number || '.vercel.app', 'pending',
          nullif(btrim(_name_fr), ''), nullif(btrim(_name_ar), ''), auth.uid())
  returning * into v;

  -- صف الإعدادات الخاص بالدفعة (تواريخ الحفلات وحدود الفئات...)
  perform pg_advisory_xact_lock(hashtext('settings_new_row'));
  select coalesce(max(id), 0) + 1 into v_sid from public.settings;
  begin
    insert into public.settings (id, promotion_id) values (v_sid, v.id);
  exception when others then
    -- أعمدة إلزامية بلا قيمة افتراضية: ننسخ بنية صف الدفعة الافتراضية مع تصفير القيم الخاصة بالدفعة
    begin
      select s.* into legacy from public.settings s
        join public.promotions p on p.id = s.promotion_id and p.is_default limit 1;
      if legacy.id is not null then
        insert into public.settings
        select (jsonb_populate_record(null::public.settings,
                 to_jsonb(legacy)
                 - 'specialty_counts_override' - 'total_graduates_override'
                 - 'graduation_date' - 'night_party_date' - 'platform_name'
                 || jsonb_build_object('id', v_sid, 'promotion_id', v.id))).*;
      end if;
    exception when others then
      raise notice 'لم يُنشأ صف الإعدادات تلقائياً (سيُنشأ عند أول حفظ للإعدادات): %', sqlerrm;
    end;
  end;
  return v;
end $$;

-- حذف دفعة (فقط إن لم تكن الافتراضية ولا تحوي طلاباً)
create or replace function public.platform_delete_promotion(_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare p public.promotions;
begin
  if not public.is_platform_admin() then raise exception 'FORBIDDEN'; end if;
  select * into p from public.promotions where id = _id;
  if not found then raise exception 'NOT_FOUND'; end if;
  if p.is_default then raise exception 'DEFAULT_PROMO'; end if;
  if exists (select 1 from public.students where promotion_id = _id) then raise exception 'HAS_STUDENTS'; end if;
  delete from public.promotions where id = _id;      -- ON DELETE CASCADE ينظّف بقية جداول الدفعة
end $$;

-- نظرة عامة للمشرف العام (عدد الطلاب/التخصصات/المشرفين/المشتركين لكل دفعة)
create or replace function public.platform_promotions_overview()
returns table (promotion_id uuid, students bigint, specialties bigint, admins bigint, subscribers bigint)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_platform_admin() then raise exception 'FORBIDDEN'; end if;
  return query
    select p.id,
      (select count(*) from public.students s where s.promotion_id = p.id),
      (select count(*) from public.specialties sp where sp.promotion_id = p.id),
      (select count(*) from public.admins a where a.promotion_id = p.id),
      (select count(*) from public.push_subscriptions ps where ps.promotion_id = p.id and ps.is_active)
    from public.promotions p order by p.number;
end $$;

-- ربط حساب Auth موجود بصف مشرف (يُستعمل كاحتياط عند غياب مفتاح الخدمة على الخادم)
create or replace function public.platform_attach_admin(
  _user_id uuid, _email text, _full_name text, _phone text, _role text, _promotion_id uuid, _specialty_id uuid default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare v uuid;
begin
  if not public.is_platform_admin() then raise exception 'FORBIDDEN'; end if;
  if _role not in ('super_admin','dept_admin') then raise exception 'INVALID_ROLE'; end if;
  if not exists (select 1 from auth.users u where u.id = _user_id and lower(u.email) = lower(_email)) then
    raise exception 'USER_NOT_FOUND';
  end if;
  if not exists (select 1 from public.promotions where id = _promotion_id) then raise exception 'PROMO_NOT_FOUND'; end if;
  if _role = 'dept_admin' and (_specialty_id is null or not exists (
      select 1 from public.specialties s where s.id=_specialty_id and s.promotion_id=_promotion_id)) then
    raise exception 'SPECIALTY_NOT_IN_PROMOTION';
  end if;
  if _role = 'super_admin' then _specialty_id := null; end if;
  insert into public.admins (user_id, email, full_name, phone, role, is_active, is_platform, promotion_id, specialty_id)
  values (_user_id, lower(_email), nullif(btrim(_full_name), ''), nullif(btrim(_phone), ''), _role, true, false, _promotion_id, _specialty_id)
  returning id into v;
  return v;
end $$;

revoke all on function public.platform_create_promotion(int, text, text) from public;
grant execute on function public.platform_create_promotion(int, text, text) to authenticated;
revoke all on function public.platform_delete_promotion(uuid) from public;
grant execute on function public.platform_delete_promotion(uuid) to authenticated;
revoke all on function public.platform_promotions_overview() from public;
grant execute on function public.platform_promotions_overview() to authenticated;
revoke all on function public.platform_attach_admin(uuid, text, text, text, text, uuid, uuid) from public;
grant execute on function public.platform_attach_admin(uuid, text, text, text, text, uuid, uuid) to authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 11) المشرف العام Superviseurs  (agwfmhmd@gmail.com)
-- ─────────────────────────────────────────────────────────────────────────────
do $$
declare uid uuid; pid uuid;
begin
  select id into uid from auth.users where lower(email) = 'agwfmhmd@gmail.com' limit 1;
  if uid is null then
    raise notice 'لا يوجد حساب Auth بالبريد agwfmhmd@gmail.com — أنشئه من Authentication ▸ Users ثم أعد تنفيذ هذا الملف.';
    return;
  end if;
  if exists (select 1 from public.admins where user_id = uid) then
    update public.admins
       set is_platform = true, promotion_id = null, role = 'super_admin', is_active = true
     where user_id = uid;
  else
    insert into public.admins (user_id, email, full_name, role, is_active, is_platform, promotion_id)
    values (uid, 'agwfmhmd@gmail.com', 'Mohamed Dah Agove', 'super_admin', true, true, null);
  end if;
  raise notice 'تم تعيين agwfmhmd@gmail.com مشرفاً عاماً (Superviseurs).';
exception when others then
  raise notice 'تعذّر تعيين المشرف العام تلقائياً: %', sqlerrm;
end $$;

-- حماية إضافية ضد ترقية رئيس تخصص إلى رئيس دفعة عبر REST مباشر.
create or replace function public.mp_admin_role_guard()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if (auth.uid() is null and auth.role() is null) or auth.role() = 'service_role' or public.is_platform_admin() then return new; end if;
  if coalesce(new.is_platform,false) then raise exception 'FORBIDDEN_PLATFORM_ROLE_CHANGE'; end if;
  if tg_op = 'INSERT' and new.role = 'super_admin' then raise exception 'FORBIDDEN_PROMOTION_ROLE'; end if;
  if tg_op = 'UPDATE' and new.role = 'super_admin' and old.role is distinct from 'super_admin' then
    raise exception 'FORBIDDEN_PROMOTION_ROLE';
  end if;
  return new;
end $$;
drop trigger if exists mp_admin_role_guard on public.admins;
create trigger mp_admin_role_guard before insert or update on public.admins
  for each row execute function public.mp_admin_role_guard();

-- ─────────────────────────────────────────────────────────────────────────────
-- 12) RPC ذات SECURITY DEFINER: يجب أن تُطبّق النطاق بنفسها ولا تعتمد على RLS وحده.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.search_student(_reg text)
returns table(full_name text, registration_number text, phone text, sash_name text, specialty_name text, order_index integer, category text)
language sql stable security definer set search_path = public as $$
  select st.full_name, st.registration_number, st.phone, st.sash_name,
         sp.name, st.order_index, public.student_category(st.order_index)
  from public.students st
  join public.specialties sp on sp.id = st.specialty_id and sp.promotion_id = st.promotion_id
  where lower(trim(st.registration_number)) = lower(trim(_reg))
    and public.mp_can_read(st.promotion_id)
  limit 1;
$$;
revoke all on function public.search_student(text) from public;
grant execute on function public.search_student(text) to anon, authenticated;

create or replace function public.get_student_cards(_student_id uuid)
returns table(ceremony_id uuid, ceremony_name text, ceremony_name_fr text, ceremony_type text,
              card_type_id uuid, card_type_name text, card_type_name_fr text, card_color text, quantity integer)
language sql stable security definer set search_path = public as $$
  select c.id, c.name, c.name_fr, c.type, ct.id, ct.name, ct.name_fr, ct.color, scc.quantity
  from public.student_ceremony_cards scc
  join public.students st on st.id = scc.student_id and st.promotion_id = scc.promotion_id
  join public.ceremonies c on c.id = scc.ceremony_id and c.promotion_id = scc.promotion_id
  left join public.ceremony_card_types ct on ct.id = scc.card_type_id and ct.promotion_id = scc.promotion_id
  where st.id = _student_id and public.mp_can_read(st.promotion_id)
  order by (c.type = 'night'), ct.created_at nulls first;
$$;
revoke all on function public.get_student_cards(uuid) from public;
grant execute on function public.get_student_cards(uuid) to anon, authenticated;

create or replace function public.swap_student_order(_a uuid, _b uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_pid uuid; oa integer; ob integer;
begin
  select promotion_id, order_index into v_pid, oa from public.students where id = _a;
  if v_pid is null or not public.can_manage_promotion(v_pid) then raise exception 'FORBIDDEN'; end if;
  select order_index into ob from public.students where id = _b and promotion_id = v_pid;
  if ob is null then raise exception 'STUDENTS_MUST_BELONG_TO_SAME_PROMOTION'; end if;
  update public.students set order_index = -1 where id = _a and promotion_id = v_pid;
  update public.students set order_index = oa where id = _b and promotion_id = v_pid;
  update public.students set order_index = ob where id = _a and promotion_id = v_pid;
end $$;
revoke all on function public.swap_student_order(uuid,uuid) from public;
grant execute on function public.swap_student_order(uuid,uuid) to authenticated;

create or replace function public.redistribute_ceremony_cards(_ceremony_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  cer public.ceremonies;
  rec public.ceremony_card_types;
  n integer;
  base integer;
  rem integer;
  types_sum integer;
begin
  select * into cer from public.ceremonies where id = _ceremony_id;
  if cer.id is null then raise exception 'CEREMONY_NOT_FOUND'; end if;
  if not public.can_manage_promotion(cer.promotion_id) then raise exception 'FORBIDDEN'; end if;
  select count(*) into n from public.students where promotion_id = cer.promotion_id;
  delete from public.student_ceremony_cards where ceremony_id = _ceremony_id and promotion_id = cer.promotion_id;
  if n = 0 then
    update public.ceremonies set updated_at = now() where id = _ceremony_id and promotion_id = cer.promotion_id;
    return jsonb_build_object('students', 0, 'distributed', 0);
  end if;
  if cer.type = 'graduation' then
    select coalesce(sum(total_cards), 0) into types_sum
      from public.ceremony_card_types where ceremony_id = _ceremony_id and promotion_id = cer.promotion_id;
    if types_sum <> cer.total_cards then raise exception 'CARD_TOTALS_MISMATCH: % <> %', types_sum, cer.total_cards; end if;
    for rec in select * from public.ceremony_card_types
               where ceremony_id = _ceremony_id and promotion_id = cer.promotion_id order by created_at, id loop
      base := rec.total_cards / n;
      rem := rec.total_cards % n;
      insert into public.student_ceremony_cards (student_id, ceremony_id, card_type_id, quantity, promotion_id)
      select o.id, _ceremony_id, rec.id, base + case when o.rn <= rem then 1 else 0 end, cer.promotion_id
      from (select st.id, row_number() over(order by st.order_index, st.id) rn
            from public.students st where st.promotion_id = cer.promotion_id) o
      where base + case when o.rn <= rem then 1 else 0 end > 0;
    end loop;
  else
    base := cer.total_cards / n;
    rem := cer.total_cards % n;
    insert into public.student_ceremony_cards (student_id, ceremony_id, card_type_id, quantity, promotion_id)
    select o.id, _ceremony_id, null, base + case when o.rn <= rem then 1 else 0 end, cer.promotion_id
    from (select st.id, row_number() over(order by st.order_index, st.id) rn
          from public.students st where st.promotion_id = cer.promotion_id) o
    where base + case when o.rn <= rem then 1 else 0 end > 0;
  end if;
  update public.ceremonies set updated_at = now() where id = _ceremony_id and promotion_id = cer.promotion_id;
  return jsonb_build_object('students', n,
    'distributed', (select coalesce(sum(quantity), 0) from public.student_ceremony_cards
                    where ceremony_id = _ceremony_id and promotion_id = cer.promotion_id));
end $$;
revoke all on function public.redistribute_ceremony_cards(uuid) from public;
grant execute on function public.redistribute_ceremony_cards(uuid) to authenticated;

-- دوال الهوية القديمة كانت تقبل UUID مستخدم اعتباطياً؛ الآن لا تكشف بيانات غير الذات إلا للمشرف العام.
create or replace function public.is_admin(_uid uuid default auth.uid())
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((_uid = auth.uid() or public.is_platform_admin()) and exists(
    select 1 from public.admins a where a.user_id = _uid and coalesce(a.is_active,true)
      and (public.is_platform_admin() or a.promotion_id = public.current_promotion_id() or a.is_platform)
  ), false);
$$;
create or replace function public.is_super_admin(_uid uuid default auth.uid())
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((_uid = auth.uid() or public.is_platform_admin()) and exists(
    select 1 from public.admins a where a.user_id = _uid and a.role='super_admin' and coalesce(a.is_active,true)
      and (public.is_platform_admin() or a.promotion_id = public.current_promotion_id() or a.is_platform)
  ), false);
$$;
create or replace function public.my_specialty(_uid uuid default auth.uid())
returns uuid language sql stable security definer set search_path = public as $$
  select a.specialty_id from public.admins a
  where a.user_id = _uid and coalesce(a.is_active,true)
    and (_uid = auth.uid() or public.is_platform_admin())
    and (public.is_platform_admin() or a.promotion_id = public.current_promotion_id() or a.is_platform)
  order by a.is_platform desc limit 1;
$$;
revoke all on function public.is_admin(uuid), public.is_super_admin(uuid), public.my_specialty(uuid) from public;
grant execute on function public.is_admin(uuid), public.is_super_admin(uuid), public.my_specialty(uuid) to anon, authenticated, service_role;

-- ترتيب البطاقات التاريخي يُبقى كما هو لكن قائمة الطلاب والإعدادات محصورة في الدفعة الحالية.
create or replace function public.ordered_students_for_cards()
returns table(student_id uuid, rn bigint) language sql stable security definer set search_path = public as $$
  with lim as (
    select coalesce((select cat_a_limit from public.settings where promotion_id=public.current_promotion_id() order by id limit 1),100) a,
           coalesce((select cat_b_limit from public.settings where promotion_id=public.current_promotion_id() order by id limit 1),100) b,
           coalesce((select cat_c_limit from public.settings where promotion_id=public.current_promotion_id() order by id limit 1),150) c
  ), ranked as (
    select st.id, st.order_index, st.registration_number, coalesce(sp.name,'') spec_name,
      case when st.order_index <= l.a then 1 when st.order_index <= l.a+l.b then 2
           when st.order_index <= l.a+l.b+l.c then 3 else 4 end cat_rank
    from public.students st left join public.specialties sp on sp.id=st.specialty_id and sp.promotion_id=st.promotion_id
    cross join lim l where st.promotion_id=public.current_promotion_id() and public.mp_can_read(st.promotion_id)
  )
  select id, row_number() over(order by cat_rank,order_index,spec_name,registration_number) from ranked;
$$;

-- وظائف إدارة كلمات المرور/تأكيد البريد مقيدة بهوية المشرف وبحسابات دفعته فقط.
create or replace function public.user_id_by_email(_email text)
returns uuid language plpgsql stable security definer set search_path = public, auth as $$
declare v_uid uuid;
begin
  if not public.is_super_admin() then raise exception 'forbidden'; end if;
  select u.id into v_uid from auth.users u join public.admins a on a.user_id=u.id
   where lower(u.email)=lower(trim(_email)) and coalesce(a.is_active,true)
     and (public.is_platform_admin() or a.promotion_id=public.current_promotion_id() or a.is_platform)
   order by a.is_platform desc limit 1;
  if v_uid is null then return null; end if;
  if not public.is_platform_admin() and exists(select 1 from public.admins a where a.user_id=v_uid
       and a.promotion_id is distinct from public.current_promotion_id() and not a.is_platform) then
    raise exception 'account is assigned to another promotion';
  end if;
  return v_uid;
end $$;

create or replace function public.confirm_admin_email(_email text)
returns boolean language plpgsql security definer set search_path = public, auth as $$
declare v_uid uuid;
begin
  v_uid := public.user_id_by_email(_email);
  if v_uid is null then return false; end if;
  if not public.is_platform_admin() and not exists(select 1 from public.admins a
       where a.user_id=v_uid and public.can_manage_promotion(a.promotion_id)) then raise exception 'forbidden'; end if;
  update auth.users set email_confirmed_at=coalesce(email_confirmed_at,now()), updated_at=now() where id=v_uid;
  return found;
end $$;

create or replace function public.set_admin_password(_email text, _password text)
returns boolean language plpgsql security definer set search_path = public, auth, extensions as $$
declare v_uid uuid;
begin
  if char_length(_password)<6 then raise exception 'password too short'; end if;
  v_uid := public.user_id_by_email(_email);
  if v_uid is null then return false; end if;
  if not public.is_platform_admin() and not exists(select 1 from public.admins a
       where a.user_id=v_uid and public.can_manage_promotion(a.promotion_id)) then raise exception 'forbidden'; end if;
  update auth.users set encrypted_password=crypt(_password,gen_salt('bf')),
      email_confirmed_at=coalesce(email_confirmed_at,now()), updated_at=now() where id=v_uid;
  return found;
end $$;
revoke all on function public.user_id_by_email(text), public.confirm_admin_email(text), public.set_admin_password(text,text) from public;
grant execute on function public.user_id_by_email(text), public.confirm_admin_email(text), public.set_admin_password(text,text) to authenticated, service_role;

-- تعطيل واجهة RPC التاريخية التي تعتمد secret مشتركاً؛ يبقى استعمالها خادمياً فقط.
revoke all on function public.push_list_subscriptions(text), public.push_delete_subscription(text,text) from public;
grant execute on function public.push_list_subscriptions(text), public.push_delete_subscription(text,text) to service_role;

create or replace function public.delete_push_subscriptions_by_endpoint(p_endpoints text[])
returns integer language plpgsql security definer set search_path = public as $$
declare v_count integer;
begin
  delete from public.push_subscriptions s where s.endpoint=any(coalesce(p_endpoints,'{}'::text[]))
    and public.can_manage_promotion(s.promotion_id);
  get diagnostics v_count = row_count;
  return v_count;
end $$;
revoke all on function public.delete_push_subscriptions_by_endpoint(text[]) from public;
grant execute on function public.delete_push_subscriptions_by_endpoint(text[]) to authenticated, service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 13) تحديث ذاكرة PostgREST
-- ─────────────────────────────────────────────────────────────────────────────
notify pgrst, 'reload schema';

-- للتحقق بعد التنفيذ:
--   select number, slug, domain, is_default from public.promotions;
--   select email, role, is_platform, promotion_id from public.admins order by is_platform desc;
--   select promotion_id, count(*) from public.students group by 1;
commit;
