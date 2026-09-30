-- ============================================================================
-- MULTI-HEADS.sql — السماح بأكثر من رئيس لنفس التخصص + منع تكرار الترتيب والطلاب
-- ينفَّذ مرة واحدة في Supabase ▸ SQL Editor (آمن لإعادة التنفيذ: idempotent).
-- ============================================================================

-- 1) إزالة أي قيد/فهرس UNIQUE يحصر جدول admins في «رئيس واحد لكل تخصص»
--    (يُحذف فقط ما كان عموده الوحيد specialty_id؛ المفتاح الأساسي وقيود user_id/email لا تُمس).
do $$
declare r record;
begin
  for r in
    select i.indexrelid::regclass::text as idx_name,
           c.conname                    as con_name
    from pg_index i
    join pg_class t on t.oid = i.indrelid
    join pg_namespace n on n.oid = t.relnamespace
    left join pg_constraint c on c.conindid = i.indexrelid and c.contype = 'u'
    where n.nspname = 'public' and t.relname = 'admins'
      and i.indisunique and not i.indisprimary
      and i.indnatts = 1
      and i.indkey[0] = (select attnum from pg_attribute
                         where attrelid = t.oid and attname = 'specialty_id')
  loop
    if r.con_name is not null then
      execute format('alter table public.admins drop constraint %I', r.con_name);
    else
      execute format('drop index if exists %s', r.idx_name);
    end if;
    raise notice 'Dropped one-head-per-specialty restriction: %', coalesce(r.con_name, r.idx_name);
  end loop;
end $$;

-- 2) طلاب التخصص مشتركون بين كل رؤساء ذلك التخصص (التصفية في الموقع حسب specialty_id)،
--    ولمنع تكرار الطالب: رقم التسجيل فريد (بغضّ النظر عن حالة الأحرف/الفراغات).
do $$
begin
  if exists (
    select 1 from public.students
    group by upper(btrim(registration_number)) having count(*) > 1
  ) then
    raise notice 'يوجد طلاب بنفس رقم التسجيل — لم يُنشأ الفهرس الفريد. راجع التكرارات ثم أعد التنفيذ:';
    raise notice 'select upper(btrim(registration_number)), count(*) from public.students group by 1 having count(*) > 1;';
  else
    create unique index if not exists students_registration_number_uniq
      on public.students (upper(btrim(registration_number)));
  end if;
end $$;

-- 3) إصلاح أي ترتيب مكرر حالياً داخل التخصص: إعادة ترقيم 1..n مع الحفاظ على الترتيب النسبي
--    (لا يُمس إلا التخصصات التي فيها تكرار فعلي).
do $$
declare r record;
begin
  for r in
    select specialty_id from public.students
    where specialty_id is not null
    group by specialty_id, order_index having count(*) > 1
  loop
    with ranked as (
      select id, row_number() over (order by order_index, created_at, id) as rn
      from public.students where specialty_id = r.specialty_id
    )
    update public.students s set order_index = -k.rn from ranked k where s.id = k.id;   -- قيم مؤقتة سالبة فريدة
    update public.students set order_index = -order_index
      where specialty_id = r.specialty_id and order_index < 0;
    raise notice 'Renumbered specialty %', r.specialty_id;
  end loop;
end $$;

-- 4) إسناد الترتيب عند الإضافة تحت قفل لكل تخصص: إذا أضاف رئيسان طالبين في اللحظة نفسها
--    يحصل كل طالب على ترتيب تالٍ مختلف (لا تكرار).
create or replace function public.students_assign_order_locked()
returns trigger language plpgsql as $$
begin
  if new.specialty_id is not null then
    perform pg_advisory_xact_lock(hashtext('students_order:' || new.specialty_id::text));
    select coalesce(max(order_index), 0) + 1 into new.order_index
    from public.students where specialty_id = new.specialty_id;
  end if;
  return new;
end $$;

drop trigger if exists zz_students_assign_order_locked on public.students;
create trigger zz_students_assign_order_locked          -- الاسم يبدأ بـ zz ليعمل بعد أي trigger سابق
  before insert on public.students
  for each row execute function public.students_assign_order_locked();

-- 5) فهرس فريد (التخصص + الترتيب) إن لم يكن موجوداً مسبقاً بأي اسم
do $$
begin
  if not exists (
    select 1 from pg_index i
    join pg_class t on t.oid = i.indrelid
    where t.relname = 'students' and i.indisunique and i.indnatts = 2
      and (select array_agg(a.attname order by a.attname) from pg_attribute a
           where a.attrelid = t.oid and a.attnum = any (i.indkey::int2[]))
          = array['order_index','specialty_id']::name[]
  ) then
    create unique index students_specialty_order_uniq on public.students (specialty_id, order_index);
  end if;
end $$;

-- ملاحظة: إن ظهرت رسالة خطأ عند إضافة الرئيس الثاني بعد تنفيذ هذا الملف، فالمنع موجود داخل
-- Edge Function باسم create-admin (خارج هذا المشروع) — أرسل كودها لتعديله.
