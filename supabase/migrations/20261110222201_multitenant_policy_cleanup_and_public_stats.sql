begin;

-- Remove legacy permissive policies that OR-ed with the promotion-scoped policies.
-- These exact policy names were verified on the live ISCAE database. The scoped
-- mp_* policies remain in force, so each request is still tied to its tenant JWT.
drop policy if exists admins_self_read on public.admins;

drop policy if exists ceremonies_read_all on public.ceremonies;
drop policy if exists card_types_read_all on public.ceremony_card_types;
drop policy if exists student_cards_read_all on public.student_ceremony_cards;

drop policy if exists "notifications are public to read" on public.notifications;
drop policy if exists "notifications public read" on public.notifications;
drop policy if exists "notifications super admin delete" on public.notifications;
drop policy if exists "notifications super admin update" on public.notifications;
drop policy if exists "notifications super admin write" on public.notifications;

drop policy if exists "promotion_settings readable by everyone" on public.promotion_settings;
drop policy if exists settings_read on public.settings;
drop policy if exists specialties_read on public.specialties;

drop policy if exists students_dept_delete on public.students;
drop policy if exists students_dept_update on public.students;
drop policy if exists students_owner_delete_guard on public.students;
drop policy if exists students_owner_update_guard on public.students;

-- Old push policies allowed anonymous writes/deletes/updates without a tenant
-- constraint. Keep reads scoped and allow a subscriber to bind only its own user.
drop policy if exists "anyone can subscribe" on public.push_subscriptions;
drop policy if exists "device can delete own subscription" on public.push_subscriptions;
drop policy if exists "device can update own subscription" on public.push_subscriptions;
drop policy if exists "push subscribe" on public.push_subscriptions;
drop policy if exists "push unsubscribe" on public.push_subscriptions;
drop policy if exists mp_scope_insert on public.push_subscriptions;
create policy mp_scope_insert on public.push_subscriptions for insert to anon, authenticated
with check (
  promotion_id = public.current_promotion_id()
  and (user_id is null or user_id = auth.uid())
);
create policy push_subscriptions_tenant_update on public.push_subscriptions for update to anon, authenticated
using (
  promotion_id = public.current_promotion_id()
  and (user_id is null or user_id = auth.uid())
)
with check (
  promotion_id = public.current_promotion_id()
  and (user_id is null or user_id = auth.uid())
);

-- Aggregate counts are public-safe, contain no names/IDs/PII, and are tenant-bound.
-- They count the complete official roster, while the student search remains paid-only.
create or replace function public.public_graduate_roster_stats(_promotion_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_a integer := 100;
  v_b integer := 100;
  v_c integer := 150;
  v_total bigint := 0;
  v_cat_a bigint := 0;
  v_cat_b bigint := 0;
  v_cat_c bigint := 0;
  v_cat_d bigint := 0;
  v_specialties jsonb := '{}'::jsonb;
begin
  if _promotion_id is null or not public.mp_can_read(_promotion_id) then
    raise exception 'PROMOTION_CONTEXT_REQUIRED';
  end if;

  select coalesce(s.cat_a_limit, 100), coalesce(s.cat_b_limit, 100), coalesce(s.cat_c_limit, 150)
    into v_a, v_b, v_c
  from public.settings s
  where s.promotion_id = _promotion_id
  order by s.id
  limit 1;
  v_a := coalesce(v_a, 100);
  v_b := coalesce(v_b, 100);
  v_c := coalesce(v_c, 150);

  select count(*),
         count(*) filter (where st.order_index <= v_a),
         count(*) filter (where st.order_index > v_a and st.order_index <= v_a + v_b),
         count(*) filter (where st.order_index > v_a + v_b and st.order_index <= v_a + v_b + v_c),
         count(*) filter (where st.order_index > v_a + v_b + v_c)
    into v_total, v_cat_a, v_cat_b, v_cat_c, v_cat_d
  from public.students st
  where st.promotion_id = _promotion_id;

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

commit;
