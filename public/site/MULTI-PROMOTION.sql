-- =============================================================================
-- MULTI-PROMOTION.sql — تحويل ISCAE إلى نظام متعدد الدفعات مع عزل وظيفي
--
-- لا تشغّل هذا الملف على قاعدة الإنتاج قبل نشر نسخة التطبيق المعدّلة ومراجعة النسخة الاحتياطية.
-- ينفذ يدويًا مرة واحدة في Supabase SQL Editor. لا يحذف سجلات الطلاب الحالية.
-- الدفعة الموجودة تُربط بالدفعة 18، والدفعات الجديدة تُنشأ بواسطة RPC create_promotion.
-- المشرف العام الوحيد: agwfmhmd@gmail.com. رئيس الدفعة role=promotion_admin.
-- =============================================================================

begin;

-- 1) سجل الدفعات وروابط كل دفعة. الـ URL يبقى pending حتى إضافة مشروع Vercel/alias فعلي.
create table if not exists public.promotions (
  id uuid primary key default gen_random_uuid(),
  promotion_number integer not null unique check (promotion_number > 0),
  slug text not null unique,
  domain text not null unique,
  domain_status text not null default 'pending' check (domain_status in ('pending','ready','error')),
  promotion_name_fr text,
  promotion_name_ar text,
  promotion_logo_url text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);

-- ترحيل هوية الدفعة الحالية من promotion_settings دون اختراع اسم أو شعار.
insert into public.promotions
  (promotion_number, slug, domain, promotion_name_fr, promotion_name_ar, promotion_logo_url)
select coalesce(ps.promotion_number, 18),
       'iscae-promo-' || coalesce(ps.promotion_number, 18)::text,
       'iscae-promo-' || coalesce(ps.promotion_number, 18)::text || '.vercel.app',
       ps.promotion_name_fr, ps.promotion_name_ar,
       coalesce(ps.promotion_logo_url, ps.promotion_logo)
from public.promotion_settings ps
where ps.id = 1
on conflict (promotion_number) do update set
  promotion_name_fr = coalesce(public.promotions.promotion_name_fr, excluded.promotion_name_fr),
  promotion_name_ar = coalesce(public.promotions.promotion_name_ar, excluded.promotion_name_ar),
  promotion_logo_url = coalesce(public.promotions.promotion_logo_url, excluded.promotion_logo_url),
  updated_at = now();

insert into public.promotions (promotion_number, slug, domain)
values (18, 'iscae-promo-18', 'iscae-promo-18.vercel.app')
on conflict (promotion_number) do nothing;

-- 2) إضافة promotion_id للجداول التي تحتوي بيانات تخص دفعة واحدة.
alter table public.admins add column if not exists promotion_id uuid references public.promotions(id);
alter table public.students add column if not exists promotion_id uuid references public.promotions(id);
alter table public.specialties add column if not exists promotion_id uuid references public.promotions(id);
alter table public.settings add column if not exists promotion_id uuid references public.promotions(id);
alter table public.ceremonies add column if not exists promotion_id uuid references public.promotions(id);
alter table public.ceremony_card_types add column if not exists promotion_id uuid references public.promotions(id);
alter table public.student_ceremony_cards add column if not exists promotion_id uuid references public.promotions(id);
alter table public.notifications add column if not exists promotion_id uuid references public.promotions(id);
alter table public.push_subscriptions add column if not exists promotion_id uuid references public.promotions(id);
alter table public.site_visits add column if not exists promotion_id uuid references public.promotions(id);

-- جميع الصفوف القائمة تخص الدفعة 18. هذا لا ينسخها ولا يغير بياناتها.
do $$
declare v_promotion_id uuid;
begin
  select id into strict v_promotion_id from public.promotions where promotion_number = 18;
  update public.admins set promotion_id = v_promotion_id where promotion_id is null;
  update public.students set promotion_id = v_promotion_id where promotion_id is null;
  update public.specialties set promotion_id = v_promotion_id where promotion_id is null;
  update public.settings set promotion_id = v_promotion_id where promotion_id is null;
  update public.ceremonies set promotion_id = v_promotion_id where promotion_id is null;
  update public.ceremony_card_types set promotion_id = v_promotion_id where promotion_id is null;
  update public.student_ceremony_cards set promotion_id = v_promotion_id where promotion_id is null;
  update public.notifications set promotion_id = v_promotion_id where promotion_id is null;
  update public.push_subscriptions set promotion_id = v_promotion_id where promotion_id is null;
  update public.site_visits set promotion_id = v_promotion_id where promotion_id is null;
end $$;

alter table public.admins alter column promotion_id set not null;
alter table public.students alter column promotion_id set not null;
alter table public.specialties alter column promotion_id set not null;
alter table public.settings alter column promotion_id set not null;
alter table public.ceremonies alter column promotion_id set not null;
alter table public.ceremony_card_types alter column promotion_id set not null;
alter table public.student_ceremony_cards alter column promotion_id set not null;
alter table public.notifications alter column promotion_id set not null;
alter table public.push_subscriptions alter column promotion_id set not null;
alter table public.site_visits alter column promotion_id set not null;

-- إعدادات id=1 تصبح صفًا واحدًا لكل دفعة (بدل قيد عالمي واحد).
alter table public.settings drop constraint if exists settings_pkey;
alter table public.settings add constraint settings_pkey primary key (id, promotion_id);
insert into public.settings(id, promotion_id)
select 1, id from public.promotions where promotion_number=18
on conflict (id, promotion_id) do nothing;

-- role جديد لرئيس الدفعة. تبقى صلاحية رئيس التخصص مدعومة كما كانت.
do $$
declare r record;
begin
  for r in
    select conname from pg_constraint
    where conrelid = 'public.admins'::regclass and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%role%'
  loop execute format('alter table public.admins drop constraint %I', r.conname); end loop;
end $$;
alter table public.admins add constraint admins_role_check
  check (role = any (array['super_admin','dept_admin','promotion_admin']::text[]));

-- مفاتيح فريدة داخل الدفعة بدل منع تكرار الرمز أو رقم التسجيل في دفعات مختلفة.
alter table public.admins drop constraint if exists admins_user_id_key;
drop index if exists public.admins_user_id_key;
create unique index if not exists admins_user_promotion_uniq on public.admins(user_id, promotion_id);

alter table public.specialties drop constraint if exists specialties_name_key;
alter table public.specialties drop constraint if exists specialties_code_key;
drop index if exists public.specialties_name_key;
drop index if exists public.specialties_code_key;
create unique index if not exists specialties_promo_name_uniq on public.specialties(promotion_id, name);
create unique index if not exists specialties_promo_code_uniq on public.specialties(promotion_id, code) where code is not null;

alter table public.students drop constraint if exists students_registration_number_key;
drop index if exists public.students_registration_number_key;
drop index if exists public.students_registration_number_uniq;
create unique index if not exists students_promo_registration_uniq
  on public.students(promotion_id, upper(btrim(registration_number)));

create index if not exists students_promotion_idx on public.students(promotion_id);
create index if not exists specialties_promotion_idx on public.specialties(promotion_id);
create index if not exists admins_promotion_idx on public.admins(promotion_id);
create index if not exists ceremonies_promotion_idx on public.ceremonies(promotion_id);
create index if not exists cards_promotion_idx on public.student_ceremony_cards(promotion_id);
create index if not exists notifications_promotion_idx on public.notifications(promotion_id, created_at desc);
create index if not exists push_subscriptions_promotion_idx on public.push_subscriptions(promotion_id, is_active);
create index if not exists visits_promotion_idx on public.site_visits(promotion_id, visited_at);

-- علاقات مركبة تمنع ربط طالب/حفل/تخصص من دفعة أخرى حتى عند استدعاء Data API مباشرة.
create unique index if not exists specialties_id_promotion_uniq on public.specialties(id, promotion_id);
create unique index if not exists ceremonies_id_promotion_uniq on public.ceremonies(id, promotion_id);
create unique index if not exists card_types_id_promotion_uniq on public.ceremony_card_types(id, promotion_id);
create unique index if not exists students_id_promotion_uniq on public.students(id, promotion_id);
alter table public.students drop constraint if exists students_specialty_promotion_fkey;
alter table public.students add constraint students_specialty_promotion_fkey
  foreign key (specialty_id, promotion_id) references public.specialties(id, promotion_id) not valid;
alter table public.students validate constraint students_specialty_promotion_fkey;
alter table public.admins drop constraint if exists admins_specialty_promotion_fkey;
alter table public.admins add constraint admins_specialty_promotion_fkey
  foreign key (specialty_id, promotion_id) references public.specialties(id, promotion_id) not valid;
alter table public.admins validate constraint admins_specialty_promotion_fkey;
alter table public.ceremony_card_types drop constraint if exists card_types_ceremony_promotion_fkey;
alter table public.ceremony_card_types add constraint card_types_ceremony_promotion_fkey
  foreign key (ceremony_id, promotion_id) references public.ceremonies(id, promotion_id) not valid;
alter table public.ceremony_card_types validate constraint card_types_ceremony_promotion_fkey;
alter table public.student_ceremony_cards drop constraint if exists student_cards_student_promotion_fkey;
alter table public.student_ceremony_cards add constraint student_cards_student_promotion_fkey
  foreign key (student_id, promotion_id) references public.students(id, promotion_id) not valid;
alter table public.student_ceremony_cards validate constraint student_cards_student_promotion_fkey;
alter table public.student_ceremony_cards drop constraint if exists student_cards_ceremony_promotion_fkey;
alter table public.student_ceremony_cards add constraint student_cards_ceremony_promotion_fkey
  foreign key (ceremony_id, promotion_id) references public.ceremonies(id, promotion_id) not valid;
alter table public.student_ceremony_cards validate constraint student_cards_ceremony_promotion_fkey;
alter table public.student_ceremony_cards drop constraint if exists student_cards_type_promotion_fkey;
alter table public.student_ceremony_cards add constraint student_cards_type_promotion_fkey
  foreign key (card_type_id, promotion_id) references public.ceremony_card_types(id, promotion_id) not valid;
alter table public.student_ceremony_cards validate constraint student_cards_type_promotion_fkey;

-- بعض نسخ push_subscriptions القديمة تستخدم endpoint كمفتاح ولا تحتوي id.
alter table public.push_subscriptions add column if not exists id uuid default gen_random_uuid();
update public.push_subscriptions set id = gen_random_uuid() where id is null;
alter table public.push_subscriptions alter column id set default gen_random_uuid();
alter table public.push_subscriptions alter column id set not null;
create unique index if not exists push_subscriptions_id_uniq on public.push_subscriptions(id);

-- 3) صلاحيات موحّدة. هوية المشرف العام تُثبت بالبريد من auth.users، لا من إدخال واجهة.
create or replace function public.is_global_supervisor(_uid uuid default auth.uid())
returns boolean language sql stable security definer set search_path = public, auth as $$
  select exists (
    select 1 from auth.users u
    where u.id = _uid and lower(coalesce(u.email,'')) = 'agwfmhmd@gmail.com'
  );
$$;

create or replace function public.is_super_admin(_uid uuid default auth.uid())
returns boolean language sql stable security definer set search_path = public, auth as $$
  select public.is_global_supervisor(_uid);
$$;

create or replace function public.is_promotion_admin(_promotion_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_global_supervisor(auth.uid()) or exists (
    select 1 from public.admins a
    where a.user_id = auth.uid() and a.promotion_id = _promotion_id
      and a.role = 'promotion_admin' and coalesce(a.is_active,true)
  );
$$;

create or replace function public.can_manage_promotion_students(_promotion_id uuid, _specialty_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_promotion_admin(_promotion_id) or exists (
    select 1 from public.admins a
    where a.user_id = auth.uid() and a.promotion_id = _promotion_id
      and a.specialty_id = _specialty_id and a.role = 'dept_admin'
      and coalesce(a.is_active,true)
  );
$$;

-- حماية مسارات صور Storage؛ صور الملفات القديمة غير المقسمة تبقى قابلة للإدارة من أعضاء الدفعة 18 فقط.
create or replace function public.can_manage_iscae_photo_path(_name text)
returns boolean language plpgsql stable security definer set search_path = public as $$
declare v_root text; v_promo_text text; v_spec_text text; v_promo uuid; v_spec uuid;
begin
  if public.is_global_supervisor(auth.uid()) then return true; end if;
  v_root := split_part(coalesce(_name,''), '/', 1);
  v_promo_text := split_part(coalesce(_name,''), '/', 2);
  v_spec_text := split_part(coalesce(_name,''), '/', 3);
  if v_root = 'promotions' then
    begin v_promo := v_promo_text::uuid; exception when others then return false; end;
    return public.is_promotion_admin(v_promo);
  elsif v_root = 'students' then
    if v_promo_text !~* '^[0-9a-f-]{36}$' or v_spec_text !~* '^[0-9a-f-]{36}$' then
      return exists (
        select 1 from public.admins a join public.promotions p on p.id=a.promotion_id
        where a.user_id=auth.uid() and p.promotion_number=18 and coalesce(a.is_active,true)
      );
    end if;
    begin v_promo := v_promo_text::uuid; v_spec := v_spec_text::uuid;
    exception when others then return false; end;
    return public.can_manage_promotion_students(v_promo, v_spec);
  end if;
  return false;
end $$;

create or replace function public.request_promotion_id()
returns uuid language plpgsql stable security definer set search_path = public as $$
declare v_headers jsonb; v_origin text; v_host text; v_id uuid;
begin
  begin v_headers := nullif(current_setting('request.headers', true), '')::jsonb;
  exception when others then v_headers := '{}'::jsonb; end;
  v_origin := coalesce(v_headers->>'origin', v_headers->>'referer', '');
  v_host := lower(split_part(split_part(regexp_replace(v_origin, '^https?://', ''), '/', 1), ':', 1));
  select p.id into v_id from public.promotions p
    where lower(p.domain) = v_host or lower(p.slug) = split_part(v_host,'.',1)
    limit 1;
  -- Local development defaults to the existing cohort only.
  if v_id is null and (v_host = 'localhost' or v_host = '127.0.0.1') then
    select id into v_id from public.promotions where promotion_number = 18;
  end if;
  return v_id;
end $$;

create or replace function public.is_admin(_uid uuid default auth.uid())
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_global_supervisor(_uid) or exists (
    select 1 from public.admins a where a.user_id = _uid and coalesce(a.is_active,true)
  );
$$;

create or replace function public.my_specialty(_uid uuid default auth.uid())
returns uuid language sql stable security definer set search_path = public as $$
  select a.specialty_id from public.admins a
  where a.user_id = _uid and a.role = 'dept_admin' and coalesce(a.is_active,true)
  order by a.created_at limit 1;
$$;

-- إنشاء دفعة جديدة ذريًا. رابط vercel.app ينتج بالاسم، لكن يلزم تهيئة مشروع/alias في Vercel.
create or replace function public.create_promotion(_name_ar text default null, _name_fr text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_num integer; v_row public.promotions;
begin
  if not public.is_global_supervisor(auth.uid()) then raise exception 'FORBIDDEN'; end if;
  perform pg_advisory_xact_lock(hashtext('iscae-promotion-number'));
  select coalesce(max(promotion_number),0)+1 into v_num from public.promotions;
  insert into public.promotions(promotion_number, slug, domain, promotion_name_ar, promotion_name_fr, created_by)
  values (v_num, 'iscae-promo-'||v_num::text, 'iscae-promo-'||v_num::text||'.vercel.app',
          nullif(btrim(_name_ar),''), nullif(btrim(_name_fr),''), auth.uid())
  returning * into v_row;
  insert into public.settings(id, promotion_id, platform_name, promotion_label)
  values (1, v_row.id, 'ISCAE '||v_num::text||'ème Promotion', 'الدفعة '||v_num::text);
  return to_jsonb(v_row);
end $$;

-- 4) استبدال سياسات RLS القديمة بسياسات scoped. لا يُعتمد على ترشيح الواجهة وحده.
do $$
declare r record;
begin
  for r in select schemaname, tablename, policyname from pg_policies
    where schemaname='public' and tablename = any(array[
      'promotions','admins','students','specialties','settings','ceremonies',
      'ceremony_card_types','student_ceremony_cards','notifications',
      'push_subscriptions','site_visits'
    ])
  loop execute format('drop policy if exists %I on %I.%I', r.policyname, r.schemaname, r.tablename); end loop;
end $$;

alter table public.promotions enable row level security;
alter table public.admins enable row level security;
alter table public.students enable row level security;
alter table public.specialties enable row level security;
alter table public.settings enable row level security;
alter table public.ceremonies enable row level security;
alter table public.ceremony_card_types enable row level security;
alter table public.student_ceremony_cards enable row level security;
alter table public.notifications enable row level security;
alter table public.push_subscriptions enable row level security;
alter table public.site_visits enable row level security;

create policy promotions_read_current on public.promotions for select to anon, authenticated
  using (id = public.request_promotion_id() or public.is_global_supervisor());
create policy promotions_update_manager on public.promotions for update to authenticated
  using (public.is_promotion_admin(id)) with check (public.is_promotion_admin(id));
create policy promotions_insert_global on public.promotions for insert to authenticated
  with check (public.is_global_supervisor());
create policy promotions_delete_global on public.promotions for delete to authenticated
  using (public.is_global_supervisor());

create policy admins_read_scoped on public.admins for select to authenticated
  using (promotion_id = public.request_promotion_id() and (user_id = auth.uid() or public.is_promotion_admin(promotion_id))
    or public.is_global_supervisor());
create policy admins_write_scoped on public.admins for all to authenticated
  using (public.is_promotion_admin(promotion_id) and role <> 'super_admin')
  with check (public.is_promotion_admin(promotion_id) and (public.is_global_supervisor() or role = 'dept_admin'));

create policy specialties_read_scoped on public.specialties for select to anon, authenticated
  using (promotion_id = public.request_promotion_id() or public.is_promotion_admin(promotion_id));
create policy specialties_write_scoped on public.specialties for all to authenticated
  using (public.is_promotion_admin(promotion_id)) with check (public.is_promotion_admin(promotion_id));

create policy students_read_scoped on public.students for select to anon, authenticated
  using (promotion_id = public.request_promotion_id() or public.is_promotion_admin(promotion_id));
create policy students_insert_scoped on public.students for insert to authenticated
  with check (public.can_manage_promotion_students(promotion_id, specialty_id));
create policy students_update_scoped on public.students for update to authenticated
  using (public.can_manage_promotion_students(promotion_id, specialty_id)
    and (public.is_promotion_admin(promotion_id) or created_by is null or created_by = auth.uid()))
  with check (public.can_manage_promotion_students(promotion_id, specialty_id)
    and (public.is_promotion_admin(promotion_id) or created_by is null or created_by = auth.uid()));
create policy students_delete_scoped on public.students for delete to authenticated
  using (public.can_manage_promotion_students(promotion_id, specialty_id)
    and (public.is_promotion_admin(promotion_id) or created_by is null or created_by = auth.uid()));

create policy settings_read_scoped on public.settings for select to anon, authenticated
  using (promotion_id = public.request_promotion_id() or public.is_promotion_admin(promotion_id));
create policy settings_write_scoped on public.settings for all to authenticated
  using (public.is_promotion_admin(promotion_id)) with check (public.is_promotion_admin(promotion_id));

create policy ceremonies_read_scoped on public.ceremonies for select to anon, authenticated
  using (promotion_id = public.request_promotion_id() or public.is_promotion_admin(promotion_id));
create policy ceremonies_write_scoped on public.ceremonies for all to authenticated
  using (public.is_promotion_admin(promotion_id)) with check (public.is_promotion_admin(promotion_id));
create policy card_types_read_scoped on public.ceremony_card_types for select to anon, authenticated
  using (promotion_id = public.request_promotion_id() or public.is_promotion_admin(promotion_id));
create policy card_types_write_scoped on public.ceremony_card_types for all to authenticated
  using (public.is_promotion_admin(promotion_id)) with check (public.is_promotion_admin(promotion_id));
create policy student_cards_read_scoped on public.student_ceremony_cards for select to anon, authenticated
  using (promotion_id = public.request_promotion_id() or public.is_promotion_admin(promotion_id));
create policy student_cards_write_scoped on public.student_ceremony_cards for all to authenticated
  using (public.is_promotion_admin(promotion_id)) with check (public.is_promotion_admin(promotion_id));

create policy notifications_read_scoped on public.notifications for select to anon, authenticated
  using (promotion_id = public.request_promotion_id() or public.is_promotion_admin(promotion_id));
create policy notifications_insert_scoped on public.notifications for insert to authenticated
  with check (public.is_promotion_admin(promotion_id));
create policy notifications_update_scoped on public.notifications for update to authenticated
  using (public.is_promotion_admin(promotion_id)) with check (public.is_promotion_admin(promotion_id));
create policy notifications_delete_scoped on public.notifications for delete to authenticated
  using (public.is_promotion_admin(promotion_id));

create policy push_subscriptions_insert_scoped on public.push_subscriptions for insert to anon, authenticated
  with check (promotion_id = public.request_promotion_id());
create policy push_subscriptions_update_scoped on public.push_subscriptions for update to anon, authenticated
  using (promotion_id = public.request_promotion_id()) with check (promotion_id = public.request_promotion_id());
create policy push_subscriptions_delete_scoped on public.push_subscriptions for delete to anon, authenticated
  using (promotion_id = public.request_promotion_id());
create policy push_subscriptions_read_manager on public.push_subscriptions for select to authenticated
  using (public.is_promotion_admin(promotion_id));

create policy visits_read_manager on public.site_visits for select to authenticated
  using (public.is_promotion_admin(promotion_id));

-- عزل عمليات كتابة ملفات student-photos بحسب المسار، مع إبقاء سياسة القراءة العامة الحالية.
drop policy if exists student_photos_admin_insert on storage.objects;
drop policy if exists student_photos_admin_update on storage.objects;
drop policy if exists student_photos_admin_delete on storage.objects;
create policy student_photos_scoped_insert on storage.objects for insert to authenticated
  with check (bucket_id='student-photos' and public.can_manage_iscae_photo_path(name));
create policy student_photos_scoped_update on storage.objects for update to authenticated
  using (bucket_id='student-photos' and public.can_manage_iscae_photo_path(name))
  with check (bucket_id='student-photos' and public.can_manage_iscae_photo_path(name));
create policy student_photos_scoped_delete on storage.objects for delete to authenticated
  using (bucket_id='student-photos' and public.can_manage_iscae_photo_path(name));

-- صلاحيات Data API بعد استبدال السياسات.
grant select on public.promotions, public.admins, public.students, public.specialties, public.settings,
  public.ceremonies, public.ceremony_card_types, public.student_ceremony_cards, public.notifications to anon, authenticated;
grant insert, update, delete on public.admins, public.students, public.specialties, public.settings,
  public.ceremonies, public.ceremony_card_types, public.student_ceremony_cards to authenticated;
grant insert, update, delete on public.notifications to authenticated;
grant select, insert, update, delete on public.push_subscriptions to anon, authenticated;
grant select on public.site_visits to authenticated;

-- 5) RPCs: كل بحث/تحديث حساس مرتبط بدفعة محددة.
create or replace function public.search_student_for_promotion(_reg text, _promotion_id uuid)
returns table(full_name text, registration_number text, phone text, sash_name text, specialty_name text, order_index integer, category text)
language sql stable security definer set search_path = public as $$
  select st.full_name, st.registration_number, st.phone, st.sash_name, sp.name,
         st.order_index, public.student_category(st.order_index)
  from public.students st join public.specialties sp
    on sp.id = st.specialty_id and sp.promotion_id = st.promotion_id
  where st.promotion_id = _promotion_id
    and (_promotion_id = public.request_promotion_id() or public.is_promotion_admin(_promotion_id))
    and lower(trim(st.registration_number)) = lower(trim(_reg))
  limit 1;
$$;

create or replace function public.swap_student_order(_a uuid, _b uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_promotion uuid; v_spec_a uuid; v_spec_b uuid; oa integer; ob integer; v_tmp integer;
begin
  select promotion_id, specialty_id, order_index into v_promotion, v_spec_a, oa from public.students where id=_a;
  select specialty_id, order_index into v_spec_b, ob from public.students where id=_b and promotion_id=v_promotion;
  if v_promotion is null or v_spec_b is null or v_spec_a <> v_spec_b then raise exception 'STUDENTS_NOT_IN_SAME_PROMOTION_OR_SPECIALTY'; end if;
  if not public.can_manage_promotion_students(v_promotion, v_spec_a) then raise exception 'FORBIDDEN'; end if;
  select coalesce(max(order_index),0)+1 into v_tmp from public.students where promotion_id=v_promotion and specialty_id=v_spec_a;
  update public.students set order_index=v_tmp where id=_a and promotion_id=v_promotion;
  update public.students set order_index=oa where id=_b and promotion_id=v_promotion;
  update public.students set order_index=ob where id=_a and promotion_id=v_promotion;
end $$;

create or replace function public.ordered_students_for_cards(_promotion_id uuid)
returns table(student_id uuid, rn bigint) language sql stable security definer set search_path = public as $$
  with lim as (
    select coalesce((select cat_a_limit from public.settings where id=1 and promotion_id=_promotion_id),100) a,
           coalesce((select cat_b_limit from public.settings where id=1 and promotion_id=_promotion_id),100) b,
           coalesce((select cat_c_limit from public.settings where id=1 and promotion_id=_promotion_id),150) c
  ), ranked as (
    select st.id, st.order_index, st.registration_number, coalesce(sp.name,'') spec_name,
      case when st.order_index <= l.a then 1 when st.order_index <= l.a+l.b then 2
           when st.order_index <= l.a+l.b+l.c then 3 else 4 end cat_rank
    from public.students st left join public.specialties sp
      on sp.id=st.specialty_id and sp.promotion_id=st.promotion_id
    cross join lim l where st.promotion_id=_promotion_id
      and (_promotion_id=public.request_promotion_id() or public.is_promotion_admin(_promotion_id))
  )
  select id, row_number() over(order by cat_rank,order_index,spec_name,registration_number)
  from ranked;
$$;

create or replace function public.get_student_cards(_student_id uuid)
returns table(ceremony_id uuid, ceremony_name text, ceremony_name_fr text, ceremony_type text,
  card_type_id uuid, card_type_name text, card_type_name_fr text, card_color text, quantity integer)
language sql stable security definer set search_path = public as $$
  select c.id,c.name,c.name_fr,c.type,ct.id,ct.name,ct.name_fr,ct.color,scc.quantity
  from public.student_ceremony_cards scc
  join public.students st on st.id=scc.student_id and st.promotion_id=scc.promotion_id
  join public.ceremonies c on c.id=scc.ceremony_id and c.promotion_id=scc.promotion_id
  left join public.ceremony_card_types ct on ct.id=scc.card_type_id and ct.promotion_id=scc.promotion_id
  where scc.student_id=_student_id and scc.promotion_id=public.request_promotion_id()
     or (scc.student_id=_student_id and public.is_promotion_admin(scc.promotion_id))
  order by (c.type='night'),ct.created_at nulls first;
$$;

-- إعادة توزيع البطاقات داخل دفعة الحفل فقط.
create or replace function public.redistribute_ceremony_cards(_ceremony_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare cer public.ceremonies; n integer; rec public.ceremony_card_types; base integer; rem integer; types_sum integer; v_promotion uuid;
begin
  select * into cer from public.ceremonies where id=_ceremony_id;
  if cer.id is null then raise exception 'CEREMONY_NOT_FOUND'; end if;
  v_promotion := cer.promotion_id;
  if not public.is_promotion_admin(v_promotion) then raise exception 'FORBIDDEN'; end if;
  select count(*) into n from public.students where promotion_id=v_promotion;
  delete from public.student_ceremony_cards where ceremony_id=_ceremony_id and promotion_id=v_promotion;
  if n=0 then
    update public.ceremonies set updated_at=now() where id=_ceremony_id and promotion_id=v_promotion;
    return jsonb_build_object('students',0,'distributed',0);
  end if;
  if cer.type='graduation' then
    select coalesce(sum(total_cards),0) into types_sum from public.ceremony_card_types
      where ceremony_id=_ceremony_id and promotion_id=v_promotion;
    if types_sum<>cer.total_cards then raise exception 'CARD_TOTALS_MISMATCH: % <> %',types_sum,cer.total_cards; end if;
    for rec in select * from public.ceremony_card_types where ceremony_id=_ceremony_id and promotion_id=v_promotion order by created_at,id loop
      base:=rec.total_cards/n; rem:=rec.total_cards%n;
      insert into public.student_ceremony_cards(student_id,ceremony_id,card_type_id,quantity,promotion_id)
      select o.student_id,_ceremony_id,rec.id,base+case when o.rn<=rem then 1 else 0 end,v_promotion
      from public.ordered_students_for_cards(v_promotion) o
      where base+case when o.rn<=rem then 1 else 0 end>0;
    end loop;
  else
    base:=cer.total_cards/n; rem:=cer.total_cards%n;
    insert into public.student_ceremony_cards(student_id,ceremony_id,card_type_id,quantity,promotion_id)
    select o.student_id,_ceremony_id,null,base+case when o.rn<=rem then 1 else 0 end,v_promotion
    from public.ordered_students_for_cards(v_promotion) o
    where base+case when o.rn<=rem then 1 else 0 end>0;
  end if;
  update public.ceremonies set updated_at=now() where id=_ceremony_id and promotion_id=v_promotion;
  return jsonb_build_object('students',n,'distributed',
    (select coalesce(sum(quantity),0) from public.student_ceremony_cards where ceremony_id=_ceremony_id and promotion_id=v_promotion));
end $$;

-- تتبع الزيارات وإحصاؤها لكل دفعة.
drop function if exists public.track_visit(text,text,text,text);
create or replace function public.track_visit(_visitor text,_lang text default null,_device text default null,_path text default null,_promotion_id uuid default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  if _visitor is null or char_length(_visitor) not between 8 and 64 then return; end if;
  if _promotion_id is null or (_promotion_id<>public.request_promotion_id() and not public.is_promotion_admin(_promotion_id)) then return; end if;
  insert into public.site_visits(visitor_id,lang,device,path,promotion_id)
  values (_visitor,left(_lang,8),left(_device,16),left(_path,200),_promotion_id);
end $$;

drop function if exists public.get_visit_stats(timestamptz,timestamptz,text,text);
create or replace function public.get_visit_stats(_from timestamptz,_to timestamptz,_tz text,_bucket text,_promotion_id uuid)
returns table(day date,visits bigint,unique_visitors bigint)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_promotion_admin(_promotion_id) then raise exception 'FORBIDDEN'; end if;
  if _bucket not in ('day','week','month') then _bucket:='day'; end if;
  return query select date_trunc(_bucket,v.visited_at at time zone _tz)::date,count(*)::bigint,count(distinct v.visitor_id)::bigint
  from public.site_visits v where v.promotion_id=_promotion_id and v.visited_at>=_from and v.visited_at<_to group by 1 order by 1;
end $$;

drop function if exists public.get_visit_totals(timestamptz,timestamptz);
create or replace function public.get_visit_totals(_from timestamptz,_to timestamptz,_promotion_id uuid)
returns table(visits bigint,unique_visitors bigint)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_promotion_admin(_promotion_id) then raise exception 'FORBIDDEN'; end if;
  return query select count(*)::bigint,count(distinct v.visitor_id)::bigint from public.site_visits v
    where v.promotion_id=_promotion_id and v.visited_at>=_from and v.visited_at<_to;
end $$;

-- Web Push: اشتراك الجهاز وسجل الإشعارات مفصولان حسب الدفعة.
drop function if exists public.save_push_subscription(text,text,text,text,text,text);
create or replace function public.save_push_subscription(p_endpoint text,p_p256dh text,p_auth text,p_device_id text default null,
  p_user_agent text default null,p_lang text default 'ar',p_promotion_id uuid default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if p_endpoint is null or p_p256dh is null or p_auth is null then raise exception 'endpoint/p256dh/auth are required'; end if;
  if p_promotion_id is null or p_promotion_id<>public.request_promotion_id() then raise exception 'PROMOTION_MISMATCH'; end if;
  insert into public.push_subscriptions(id,endpoint,p256dh,auth,device_id,user_agent,lang,is_active,user_id,updated_at,promotion_id)
  values(gen_random_uuid(),p_endpoint,p_p256dh,p_auth,p_device_id,left(coalesce(p_user_agent,''),300),coalesce(p_lang,'ar'),true,auth.uid(),now(),p_promotion_id)
  on conflict(endpoint) do update set p256dh=excluded.p256dh,auth=excluded.auth,
    device_id=coalesce(excluded.device_id,push_subscriptions.device_id),user_agent=coalesce(excluded.user_agent,push_subscriptions.user_agent),
    lang=coalesce(excluded.lang,push_subscriptions.lang),is_active=true,user_id=coalesce(excluded.user_id,push_subscriptions.user_id),
    updated_at=now(),promotion_id=excluded.promotion_id
  returning id into v_id;
  return v_id;
end $$;

create or replace function public.count_active_push_subscriptions(p_promotion_id uuid)
returns integer language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_promotion_admin(p_promotion_id) then raise exception 'FORBIDDEN'; end if;
  return (select count(*)::int from public.push_subscriptions where promotion_id=p_promotion_id and is_active);
end $$;

create or replace function public.get_active_push_subscriptions(p_promotion_id uuid)
returns table(id uuid,endpoint text,p256dh text,auth text)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_promotion_admin(p_promotion_id) then raise exception 'FORBIDDEN'; end if;
  return query select s.id,s.endpoint,s.p256dh,s.auth from public.push_subscriptions s
    where s.promotion_id=p_promotion_id and s.is_active and s.endpoint is not null and s.p256dh is not null and s.auth is not null;
end $$;

create or replace function public.delete_push_subscriptions(p_ids uuid[],p_promotion_id uuid)
returns integer language plpgsql security definer set search_path = public as $$
declare v_count integer;
begin
  if not public.is_promotion_admin(p_promotion_id) then raise exception 'FORBIDDEN'; end if;
  delete from public.push_subscriptions where id=any(coalesce(p_ids,'{}'::uuid[])) and promotion_id=p_promotion_id;
  get diagnostics v_count=row_count;
  return v_count;
end $$;

-- صلاحيات تنفيذ RPCs.
revoke all on function public.create_promotion(text,text) from public;
grant execute on function public.create_promotion(text,text) to authenticated;
revoke all on function public.search_student_for_promotion(text,uuid) from public;
grant execute on function public.search_student_for_promotion(text,uuid) to anon,authenticated;
revoke all on function public.ordered_students_for_cards(uuid) from public;
grant execute on function public.ordered_students_for_cards(uuid) to authenticated,service_role;
revoke all on function public.get_student_cards(uuid) from public;
grant execute on function public.get_student_cards(uuid) to anon,authenticated;
revoke all on function public.redistribute_ceremony_cards(uuid) from public;
grant execute on function public.redistribute_ceremony_cards(uuid) to authenticated;
revoke all on function public.track_visit(text,text,text,text,uuid) from public;
grant execute on function public.track_visit(text,text,text,text,uuid) to anon,authenticated;
revoke all on function public.get_visit_stats(timestamptz,timestamptz,text,text,uuid) from public;
grant execute on function public.get_visit_stats(timestamptz,timestamptz,text,text,uuid) to authenticated;
revoke all on function public.get_visit_totals(timestamptz,timestamptz,uuid) from public;
grant execute on function public.get_visit_totals(timestamptz,timestamptz,uuid) to authenticated;
revoke all on function public.save_push_subscription(text,text,text,text,text,text,uuid) from public;
grant execute on function public.save_push_subscription(text,text,text,text,text,text,uuid) to anon,authenticated,service_role;
revoke all on function public.count_active_push_subscriptions(uuid) from public;
grant execute on function public.count_active_push_subscriptions(uuid) to authenticated,service_role;
revoke all on function public.get_active_push_subscriptions(uuid) from public;
grant execute on function public.get_active_push_subscriptions(uuid) to authenticated,service_role;
revoke all on function public.delete_push_subscriptions(uuid[],uuid) from public;
grant execute on function public.delete_push_subscriptions(uuid[],uuid) to authenticated,service_role;
revoke all on function public.can_manage_iscae_photo_path(text) from public;
grant execute on function public.can_manage_iscae_photo_path(text) to authenticated,service_role;
grant execute on function public.is_global_supervisor(uuid) to anon,authenticated,service_role;
grant execute on function public.is_super_admin(uuid) to anon,authenticated,service_role;
grant execute on function public.is_promotion_admin(uuid) to anon,authenticated,service_role;
grant execute on function public.request_promotion_id() to anon,authenticated,service_role;

commit;

-- ملاحظة النشر: migrate DB ثم نشر الموقع ودالة create-admin.
-- مسار /api/public/promotions/provision ينشئ مشروع Vercel عند إعداد أسرار VERCEL_* على الخادم.
-- لا تشغّل الترحيل على الإنتاج قبل النسخ الاحتياطي واختبار السياسات والقيود على نسخة منفصلة.
