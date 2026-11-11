begin;

-- Add a separately configurable ceiling for category D. On the first application,
-- preserve the current remainder for each existing promotion; new promotions default to 0.
do $$
declare
  v_had_d boolean;
begin
  select exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'settings' and column_name = 'cat_d_limit'
  ) into v_had_d;
  if not v_had_d then
    alter table public.settings add column cat_d_limit integer not null default 0;
    update public.settings s
    set cat_d_limit = greatest(
      (select count(*)::integer from public.students st where st.promotion_id = s.promotion_id)
      - coalesce(s.cat_a_limit, 100) - coalesce(s.cat_b_limit, 100) - coalesce(s.cat_c_limit, 150),
      0
    );
  end if;
end;
$$;

do $$
begin
  update public.settings
  set cat_a_limit = greatest(coalesce(cat_a_limit, 100), 0),
      cat_b_limit = greatest(coalesce(cat_b_limit, 100), 0),
      cat_c_limit = greatest(coalesce(cat_c_limit, 150), 0),
      cat_d_limit = greatest(coalesce(cat_d_limit, 0), 0);
  if not exists (select 1 from pg_constraint where conrelid = 'public.settings'::regclass and conname = 'settings_cat_a_limit_nonnegative') then
    alter table public.settings add constraint settings_cat_a_limit_nonnegative check (cat_a_limit >= 0);
  end if;
  if not exists (select 1 from pg_constraint where conrelid = 'public.settings'::regclass and conname = 'settings_cat_b_limit_nonnegative') then
    alter table public.settings add constraint settings_cat_b_limit_nonnegative check (cat_b_limit >= 0);
  end if;
  if not exists (select 1 from pg_constraint where conrelid = 'public.settings'::regclass and conname = 'settings_cat_c_limit_nonnegative') then
    alter table public.settings add constraint settings_cat_c_limit_nonnegative check (cat_c_limit >= 0);
  end if;
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.settings'::regclass and conname = 'settings_cat_d_limit_nonnegative'
  ) then
    alter table public.settings add constraint settings_cat_d_limit_nonnegative check (cat_d_limit >= 0);
  end if;
end;
$$;

-- Category is based on a promotion-wide approved-payment rank and never on upload order.
create or replace function public.student_category(_order integer, _promotion_id uuid)
returns text
language sql stable security definer set search_path = public as $$
  select case
    when _order is null or _order < 1 then null
    when _order <= greatest(coalesce(s.cat_a_limit, 100), 0) then 'A'
    when _order <= greatest(coalesce(s.cat_a_limit, 100), 0) + greatest(coalesce(s.cat_b_limit, 100), 0) then 'B'
    when _order <= greatest(coalesce(s.cat_a_limit, 100), 0) + greatest(coalesce(s.cat_b_limit, 100), 0) + greatest(coalesce(s.cat_c_limit, 150), 0) then 'C'
    when _order <= greatest(coalesce(s.cat_a_limit, 100), 0) + greatest(coalesce(s.cat_b_limit, 100), 0) + greatest(coalesce(s.cat_c_limit, 150), 0) + greatest(coalesce(s.cat_d_limit, 0), 0) then 'D'
    else null
  end
  from public.settings s
  where s.promotion_id = _promotion_id
  order by s.id
  limit 1;
$$;

-- Compatibility wrapper for older database callers; it remains tenant scoped.
create or replace function public.student_category(_order integer)
returns text
language sql stable security definer set search_path = public as $$
  select public.student_category(_order, public.current_promotion_id());
$$;

-- Rebuild all approved payment ranks atomically for one promotion. Rows without an
-- approved subscription have NULL rank and therefore no individually assigned category.
create or replace function public.rebuild_promotion_payment_order(_promotion_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if _promotion_id is null then raise exception 'PROMOTION_CONTEXT_REQUIRED'; end if;
  update public.students
  set payment_order_index = null
  where promotion_id = _promotion_id and payment_order_index is not null;

  with approved as (
    select distinct on (s.id)
      s.id as student_id,
      coalesce(r.reviewed_at, r.created_at) as paid_at,
      r.id as request_id
    from public.graduate_accounts g
    join public.subscription_requests r
      on r.account_id = g.id and r.promotion_id = g.promotion_id and r.status = 'approved'
    join lateral (
      select candidate.id, candidate.promotion_id
      from public.students candidate
      where candidate.promotion_id = g.promotion_id
        and (candidate.id = g.student_id or (g.student_id is null and upper(btrim(candidate.registration_number)) = upper(btrim(g.registration_number))))
      order by (candidate.id = g.student_id) desc nulls last, candidate.id
      limit 1
    ) s on true
    where g.promotion_id = _promotion_id
    order by s.id, coalesce(r.reviewed_at, r.created_at), r.id
  ), ranked as (
    select a.student_id,
           row_number() over (order by a.paid_at, a.request_id, a.student_id)::integer as payment_order_index
    from approved a
  )
  update public.students s
  set payment_order_index = ranked.payment_order_index
  from ranked
  where s.id = ranked.student_id and s.promotion_id = _promotion_id;
end;
$$;
revoke all on function public.rebuild_promotion_payment_order(uuid) from public, anon, authenticated;

-- Every approval immediately refreshes promotion-wide order, serialized by the promotion row lock.
create or replace function public.refresh_payment_rank_after_approval()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'approved' then
    if tg_op = 'INSERT' then
      perform 1 from public.promotions where id = new.promotion_id for update;
      perform public.rebuild_promotion_payment_order(new.promotion_id);
    elsif old.status is distinct from new.status then
      perform 1 from public.promotions where id = new.promotion_id for update;
      perform public.rebuild_promotion_payment_order(new.promotion_id);
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists subscription_requests_refresh_payment_rank on public.subscription_requests;
create trigger subscription_requests_refresh_payment_rank
after insert or update of status on public.subscription_requests
for each row execute function public.refresh_payment_rank_after_approval();

-- Repair ranks already present in the database, based solely on verified approval timestamps.
do $$
declare
  p record;
begin
  for p in select id from public.promotions loop
    perform public.rebuild_promotion_payment_order(p.id);
  end loop;
end;
$$;

-- Replace the public roster summary: before any approved payment it reports only
-- aggregate planned seat counts; after payments begin it reports actual assigned categories.
create or replace function public.public_graduate_roster_stats(_promotion_id uuid)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_a integer := 100;
  v_b integer := 100;
  v_c integer := 150;
  v_d integer := 0;
  v_total bigint := 0;
  v_paid bigint := 0;
  v_cat_a bigint := 0;
  v_cat_b bigint := 0;
  v_cat_c bigint := 0;
  v_cat_d bigint := 0;
  v_specialties jsonb := '{}'::jsonb;
begin
  if _promotion_id is null or not public.mp_can_read(_promotion_id) then
    raise exception 'PROMOTION_CONTEXT_REQUIRED';
  end if;

  select coalesce(s.cat_a_limit, 100), coalesce(s.cat_b_limit, 100), coalesce(s.cat_c_limit, 150), coalesce(s.cat_d_limit, 0)
    into v_a, v_b, v_c, v_d
  from public.settings s
  where s.promotion_id = _promotion_id
  order by s.id
  limit 1;
  v_a := greatest(coalesce(v_a, 100), 0);
  v_b := greatest(coalesce(v_b, 100), 0);
  v_c := greatest(coalesce(v_c, 150), 0);
  v_d := greatest(coalesce(v_d, 0), 0);

  select count(*), count(*) filter (where st.payment_order_index is not null)
    into v_total, v_paid
  from public.students st
  where st.promotion_id = _promotion_id;

  if v_paid = 0 then
    v_cat_a := least(v_total, v_a);
    v_cat_b := least(greatest(v_total - v_cat_a, 0), v_b);
    v_cat_c := least(greatest(v_total - v_cat_a - v_cat_b, 0), v_c);
    v_cat_d := least(greatest(v_total - v_cat_a - v_cat_b - v_cat_c, 0), v_d);
  else
    select count(*) filter (where public.student_category(st.payment_order_index, _promotion_id) = 'A'),
           count(*) filter (where public.student_category(st.payment_order_index, _promotion_id) = 'B'),
           count(*) filter (where public.student_category(st.payment_order_index, _promotion_id) = 'C'),
           count(*) filter (where public.student_category(st.payment_order_index, _promotion_id) = 'D')
      into v_cat_a, v_cat_b, v_cat_c, v_cat_d
    from public.students st
    where st.promotion_id = _promotion_id and st.payment_order_index is not null;
  end if;

  select coalesce(jsonb_object_agg(counts.specialty_id::text, counts.n), '{}'::jsonb)
    into v_specialties
  from (
    select st.specialty_id, count(*)::integer as n
    from public.students st
    where st.promotion_id = _promotion_id and st.specialty_id is not null
    group by st.specialty_id
  ) counts;

  return jsonb_build_object(
    'total', v_total,
    'categories', jsonb_build_object('A', v_cat_a, 'B', v_cat_b, 'C', v_cat_c, 'D', v_cat_d),
    'specialties', v_specialties
  );
end;
$$;
revoke all on function public.public_graduate_roster_stats(uuid) from public;
grant execute on function public.public_graduate_roster_stats(uuid) to anon, authenticated;

-- Public lookup returns paid graduates only, ranked by approved payment order and bounded category capacity.
create or replace function public.search_student(_reg text)
returns table(full_name text, full_name_fr text, registration_number text, phone text, sash_name text, specialty_name text, specialty_name_fr text, order_index integer, category text)
language sql stable security definer set search_path = public as $$
  select st.full_name, st.full_name_fr, st.registration_number, st.phone, st.sash_name,
         sp.name, sp.name_fr, st.payment_order_index,
         public.student_category(st.payment_order_index, st.promotion_id)
  from public.students st
  join public.specialties sp on sp.id = st.specialty_id and sp.promotion_id = st.promotion_id
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

-- Keep imports coherent: reassign verified ranks across the whole promotion, not within each specialty.
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
    where promotion_id = _promotion_id and upper(btrim(registration_number)) = v_reg;
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
    where promotion_id = _promotion_id and upper(btrim(registration_number)) = v_reg
    limit 1;
    if v_student is null then
      insert into public.students(full_name, full_name_fr, registration_number, specialty_id, order_index, created_by, promotion_id)
      values (v_ar, v_fr, v_reg, v_sp, v_order, auth.uid(), _promotion_id)
      returning id into v_student;
      inserted_count := inserted_count + 1;
    else
      update public.students
      set full_name = v_ar, full_name_fr = v_fr, specialty_id = v_sp,
          order_index = v_order, updated_at = now()
      where id = v_student;
      updated_count := updated_count + 1;
    end if;

    select count(*) into v_account_count
    from public.graduate_accounts
    where promotion_id = _promotion_id and upper(btrim(registration_number)) = v_reg;
    if v_account_count > 1 then raise exception 'DUPLICATE_GRADUATE_ACCOUNT_REGISTRATION'; end if;
    update public.graduate_accounts
    set student_id = v_student, specialty_id = v_sp, full_name = v_ar,
        full_name_fr = v_fr, updated_at = now()
    where promotion_id = _promotion_id
      and upper(btrim(registration_number)) = v_reg
      and (student_id is distinct from v_student or specialty_id is distinct from v_sp
        or full_name is distinct from v_ar or full_name_fr is distinct from v_fr);

    v_sp := null;
    v_student := null;
  end loop;

  update public.promotions set graduate_roster_uploaded = true, updated_at = now()
  where id = _promotion_id;

  perform public.rebuild_promotion_payment_order(_promotion_id);
  return jsonb_build_object(
    'inserted', inserted_count, 'updated', updated_count,
    'total', jsonb_array_length(_rows), 'order_source', 'latest_roster_upload',
    'paid_rank_source', 'approved_subscription_time_global'
  );
end;
$$;
revoke all on function public.platform_import_graduate_roster(uuid, jsonb) from public, anon;
grant execute on function public.platform_import_graduate_roster(uuid, jsonb) to authenticated;

commit;
