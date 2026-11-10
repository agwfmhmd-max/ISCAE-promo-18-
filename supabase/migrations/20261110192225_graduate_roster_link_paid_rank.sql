begin;

-- A registration number may belong to at most one graduate account within a promotion.
-- Checked before adding this index: no duplicate promotion/registration groups exist.
create unique index if not exists graduate_accounts_promotion_registration_unique
  on public.graduate_accounts (promotion_id, upper(btrim(registration_number)));

-- A roster can be uploaded after a graduate account and its approved payment already exist.
-- Link only an unambiguous exact registration match; copy the latest official bilingual identity.
with matches as (
  select g.id as account_id, (array_agg(s.id))[1] as student_id
  from public.graduate_accounts g
  join public.students s
    on s.promotion_id = g.promotion_id
   and upper(btrim(s.registration_number)) = upper(btrim(g.registration_number))
  group by g.id
  having count(s.id) = 1
)
update public.graduate_accounts g
set student_id = s.id,
    specialty_id = s.specialty_id,
    full_name = s.full_name,
    full_name_fr = s.full_name_fr,
    updated_at = now()
from matches m
join public.students s on s.id = m.student_id
where g.id = m.account_id
  and (g.student_id is distinct from s.id
    or g.specialty_id is distinct from s.specialty_id
    or g.full_name is distinct from s.full_name
    or g.full_name_fr is distinct from s.full_name_fr);

-- Rebuild ranks only from approved payments; imported order_index is never used.
update public.students set payment_order_index = null where payment_order_index is not null;
with approved as (
  select distinct on (s.id)
    s.id as student_id,
    s.promotion_id,
    s.specialty_id,
    coalesce(r.reviewed_at, r.created_at) as paid_at,
    r.id as request_id
  from public.graduate_accounts g
  join public.subscription_requests r
    on r.account_id = g.id
   and r.promotion_id = g.promotion_id
   and r.status = 'approved'
  join public.students s
    on s.id = g.student_id
   and s.promotion_id = g.promotion_id
  order by s.id, coalesce(r.reviewed_at, r.created_at), r.id
), ranked as (
  select a.student_id,
         row_number() over (
           partition by a.promotion_id, a.specialty_id
           order by a.paid_at, a.request_id, a.student_id
         )::integer as payment_order_index
  from approved a
)
update public.students s
set payment_order_index = ranked.payment_order_index
from ranked
where s.id = ranked.student_id
  and s.payment_order_index is null;

-- Keep the database search result strictly paid-only and return the actual payment rank.
create or replace function public.search_student(_reg text)
returns table(
  full_name text,
  full_name_fr text,
  registration_number text,
  phone text,
  sash_name text,
  specialty_name text,
  specialty_name_fr text,
  order_index integer,
  category text
)
language sql stable security definer set search_path = public as $$
  select st.full_name,
         st.full_name_fr,
         st.registration_number,
         st.phone,
         st.sash_name,
         sp.name,
         sp.name_fr,
         st.payment_order_index,
         public.student_category(st.payment_order_index)
  from public.students st
  join public.specialties sp
    on sp.id = st.specialty_id and sp.promotion_id = st.promotion_id
  where lower(trim(st.registration_number)) = lower(trim(_reg))
    and st.payment_order_index is not null
    and public.mp_can_read(st.promotion_id)
    and exists (
      select 1
      from public.graduate_accounts g
      join public.subscription_requests r
        on r.account_id = g.id and r.promotion_id = g.promotion_id
      where g.promotion_id = st.promotion_id
        and (g.student_id = st.id or upper(btrim(g.registration_number)) = upper(btrim(st.registration_number)))
        and r.status = 'approved'
    )
  order by st.payment_order_index, st.id
  limit 1;
$$;
revoke all on function public.search_student(text) from public;
grant execute on function public.search_student(text) to anon, authenticated;

-- Keep future roster uploads from severing accounts created before the roster was uploaded.
create or replace function public.platform_import_graduate_roster(_promotion_id uuid, _rows jsonb)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  r jsonb;
  v_ar text;
  v_fr text;
  v_reg text;
  v_sp_ar text;
  v_sp_fr text;
  v_sp uuid;
  v_student uuid;
  v_order integer := 0;
  v_student_count integer;
  v_account_count integer;
  inserted_count integer := 0;
  updated_count integer := 0;
begin
  if not public.is_platform_admin() then raise exception 'FORBIDDEN'; end if;
  if not exists (select 1 from public.promotions where id = _promotion_id) then raise exception 'PROMOTION_NOT_FOUND'; end if;
  if jsonb_typeof(_rows) is distinct from 'array'
     or jsonb_array_length(_rows) < 1
     or jsonb_array_length(_rows) > 5000 then
    raise exception 'INVALID_ROSTER_ROWS';
  end if;
  perform 1 from public.promotions where id = _promotion_id for update;
  update public.students set payment_order_index = null
  where promotion_id = _promotion_id and payment_order_index is not null;

  for r in select value from jsonb_array_elements(_rows) loop
    v_order := v_order + 1;
    v_ar := left(btrim(coalesce(r->>'full_name_ar', '')), 160);
    v_fr := left(btrim(coalesce(r->>'full_name_fr', '')), 160);
    v_reg := upper(left(btrim(coalesce(r->>'registration_number', '')), 40));
    v_sp_ar := left(btrim(coalesce(r->>'specialty_ar', '')), 120);
    v_sp_fr := left(btrim(coalesce(r->>'specialty_fr', '')), 120);
    if length(v_ar) < 2 or length(v_fr) < 2 or v_reg = ''
       or length(v_sp_ar) < 2 or length(v_sp_fr) < 2 then
      raise exception 'INVALID_ROSTER_ROW';
    end if;

    select count(*) into v_student_count
    from public.students
    where promotion_id = _promotion_id
      and upper(btrim(registration_number)) = v_reg;
    if v_student_count > 1 then raise exception 'DUPLICATE_STUDENT_REGISTRATION'; end if;

    select id into v_sp
    from public.specialties
    where promotion_id = _promotion_id and lower(btrim(name)) = lower(v_sp_ar)
    limit 1;
    if v_sp is null then
      insert into public.specialties(promotion_id, name, name_fr)
      values (_promotion_id, v_sp_ar, v_sp_fr)
      returning id into v_sp;
    else
      update public.specialties
      set name = v_sp_ar, name_fr = v_sp_fr, updated_at = now()
      where id = v_sp;
    end if;

    select id into v_student
    from public.students
    where promotion_id = _promotion_id
      and upper(btrim(registration_number)) = v_reg
    limit 1;
    if v_student is null then
      insert into public.students(full_name, full_name_fr, registration_number, specialty_id, order_index, created_by, promotion_id)
      values (v_ar, v_fr, v_reg, v_sp, v_order, auth.uid(), _promotion_id)
      returning id into v_student;
      inserted_count := inserted_count + 1;
    else
      update public.students
      set full_name = v_ar,
          full_name_fr = v_fr,
          specialty_id = v_sp,
          order_index = v_order,
          updated_at = now()
      where id = v_student;
      updated_count := updated_count + 1;
    end if;

    select count(*) into v_account_count
    from public.graduate_accounts
    where promotion_id = _promotion_id
      and upper(btrim(registration_number)) = v_reg;
    if v_account_count > 1 then raise exception 'DUPLICATE_GRADUATE_ACCOUNT_REGISTRATION'; end if;
    update public.graduate_accounts
    set student_id = v_student,
        specialty_id = v_sp,
        full_name = v_ar,
        full_name_fr = v_fr,
        updated_at = now()
    where promotion_id = _promotion_id
      and upper(btrim(registration_number)) = v_reg
      and (student_id is distinct from v_student
        or specialty_id is distinct from v_sp
        or full_name is distinct from v_ar
        or full_name_fr is distinct from v_fr);

    v_sp := null;
    v_student := null;
  end loop;

  update public.promotions
  set graduate_roster_uploaded = true, updated_at = now()
  where id = _promotion_id;

  -- Re-rank confirmed payments chronologically by approval time, never by upload order.
  with approved as (
    select distinct on (s.id)
      s.id as student_id,
      s.promotion_id,
      s.specialty_id,
      coalesce(r.reviewed_at, r.created_at) as paid_at,
      r.id as request_id
    from public.graduate_accounts g
    join public.subscription_requests r
      on r.account_id = g.id and r.promotion_id = g.promotion_id and r.status = 'approved'
    join public.students s on s.id = g.student_id and s.promotion_id = g.promotion_id
    where g.promotion_id = _promotion_id
    order by s.id, coalesce(r.reviewed_at, r.created_at), r.id
  ), ranked as (
    select a.student_id,
           row_number() over (
             partition by a.promotion_id, a.specialty_id
             order by a.paid_at, a.request_id, a.student_id
           )::integer as payment_order_index
    from approved a
  )
  update public.students s
  set payment_order_index = ranked.payment_order_index
  from ranked
  where s.id = ranked.student_id and s.payment_order_index is null;

  return jsonb_build_object(
    'inserted', inserted_count,
    'updated', updated_count,
    'total', jsonb_array_length(_rows),
    'order_source', 'latest_roster_upload',
    'paid_rank_source', 'approved_subscription_time'
  );
end;
$$;
revoke all on function public.platform_import_graduate_roster(uuid, jsonb) from public, anon;
grant execute on function public.platform_import_graduate_roster(uuid, jsonb) to authenticated;

commit;
