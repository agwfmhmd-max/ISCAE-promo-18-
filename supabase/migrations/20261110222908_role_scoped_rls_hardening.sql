begin;

-- Row-scoped promotion head/platform access. Legacy is_super_admin() checked
-- the caller's role but not the target row's promotion_id, so replace it with
-- can_manage_promotion(row.promotion_id) to prevent cross-promotion writes.
drop policy if exists admins_super_write on public.admins;
create policy admins_super_write on public.admins
  for all to authenticated
  using (public.can_manage_promotion(promotion_id))
  with check (public.can_manage_promotion(promotion_id));

drop policy if exists mp_scope_select on public.admins;
drop policy if exists mp_scope_insert on public.admins;
drop policy if exists mp_scope_update on public.admins;
drop policy if exists mp_scope_delete on public.admins;

drop policy if exists specialties_write on public.specialties;
create policy specialties_write on public.specialties
  for all to authenticated
  using (public.can_manage_promotion(promotion_id))
  with check (public.can_manage_promotion(promotion_id));
drop policy if exists mp_scope_insert on public.specialties;
drop policy if exists mp_scope_update on public.specialties;
drop policy if exists mp_scope_delete on public.specialties;

drop policy if exists settings_write on public.settings;
create policy settings_write on public.settings
  for all to authenticated
  using (public.can_manage_promotion(promotion_id))
  with check (public.can_manage_promotion(promotion_id));
drop policy if exists mp_scope_insert on public.settings;
drop policy if exists mp_scope_update on public.settings;
drop policy if exists mp_scope_delete on public.settings;

drop policy if exists "super admin can update promotion" on public.promotion_settings;
create policy "super admin can update promotion" on public.promotion_settings
  for update to authenticated
  using (public.can_manage_promotion(promotion_id))
  with check (public.can_manage_promotion(promotion_id));
drop policy if exists mp_scope_insert on public.promotion_settings;
drop policy if exists mp_scope_update on public.promotion_settings;
drop policy if exists mp_scope_delete on public.promotion_settings;

drop policy if exists ceremonies_write_super on public.ceremonies;
create policy ceremonies_write_super on public.ceremonies
  for all to authenticated
  using (public.can_manage_promotion(promotion_id))
  with check (public.can_manage_promotion(promotion_id));
drop policy if exists mp_scope_insert on public.ceremonies;
drop policy if exists mp_scope_update on public.ceremonies;
drop policy if exists mp_scope_delete on public.ceremonies;

drop policy if exists card_types_write_super on public.ceremony_card_types;
create policy card_types_write_super on public.ceremony_card_types
  for all to authenticated
  using (public.can_manage_promotion(promotion_id))
  with check (public.can_manage_promotion(promotion_id));
drop policy if exists mp_scope_insert on public.ceremony_card_types;
drop policy if exists mp_scope_update on public.ceremony_card_types;
drop policy if exists mp_scope_delete on public.ceremony_card_types;

drop policy if exists student_cards_write_super on public.student_ceremony_cards;
create policy student_cards_write_super on public.student_ceremony_cards
  for all to authenticated
  using (public.can_manage_promotion(promotion_id))
  with check (public.can_manage_promotion(promotion_id));
drop policy if exists mp_scope_insert on public.student_ceremony_cards;
drop policy if exists mp_scope_update on public.student_ceremony_cards;
drop policy if exists mp_scope_delete on public.student_ceremony_cards;

drop policy if exists mp_scope_insert on public.notifications;
drop policy if exists mp_scope_update on public.notifications;
drop policy if exists mp_scope_delete on public.notifications;
create policy promotion_managers_delete_notifications on public.notifications
  for delete to authenticated using (public.can_manage_promotion(promotion_id));

-- Roster imports belong to the platform or the promotion head; specialty heads
-- may only edit/delete students within their own assigned specialty and promotion.
drop policy if exists mp_scope_insert on public.students;
drop policy if exists mp_scope_update on public.students;
drop policy if exists mp_scope_delete on public.students;
create policy students_promotion_head_insert on public.students
  for insert to authenticated
  with check (public.mp_feature_admin(promotion_id, array['super_admin']::text[]));
create policy students_promotion_head_or_specialty_update on public.students
  for update to authenticated
  using (
    public.mp_feature_admin(promotion_id, array['super_admin']::text[])
    or exists (
      select 1 from public.admins a
      where a.user_id = auth.uid() and a.role = 'dept_admin'
        and coalesce(a.is_active, true) and a.promotion_id = students.promotion_id
        and a.specialty_id = students.specialty_id
    )
  )
  with check (
    public.mp_feature_admin(promotion_id, array['super_admin']::text[])
    or exists (
      select 1 from public.admins a
      where a.user_id = auth.uid() and a.role = 'dept_admin'
        and coalesce(a.is_active, true) and a.promotion_id = students.promotion_id
        and a.specialty_id = students.specialty_id
    )
  );
create policy students_promotion_head_or_specialty_delete on public.students
  for delete to authenticated
  using (
    public.mp_feature_admin(promotion_id, array['super_admin']::text[])
    or exists (
      select 1 from public.admins a
      where a.user_id = auth.uid() and a.role = 'dept_admin'
        and coalesce(a.is_active, true) and a.promotion_id = students.promotion_id
        and a.specialty_id = students.specialty_id
    )
  );

-- Site visits are recorded through the existing server/RPC path; do not let a
-- promotion admin alter visit logs through generic direct-table policies.
drop policy if exists mp_scope_insert on public.site_visits;
drop policy if exists mp_scope_update on public.site_visits;
drop policy if exists mp_scope_delete on public.site_visits;

-- Push endpoints and key material are private. Only the head/platform admin can
-- read tenant subscriptions; subscribers can write/delete only their own record.
drop policy if exists mp_scope_select on public.push_subscriptions;
drop policy if exists mp_scope_update on public.push_subscriptions;
drop policy if exists mp_scope_delete on public.push_subscriptions;
drop policy if exists push_subscriptions_tenant_update on public.push_subscriptions;
create policy push_subscriptions_tenant_update on public.push_subscriptions
  for update to anon, authenticated
  using (
    promotion_id = public.current_promotion_id()
    and (user_id is null or user_id = auth.uid())
  )
  with check (
    promotion_id = public.current_promotion_id()
    and (user_id is null or user_id = auth.uid())
  );
create policy push_subscriptions_tenant_delete on public.push_subscriptions
  for delete to anon, authenticated
  using (
    promotion_id = public.current_promotion_id()
    and (user_id is null or user_id = auth.uid())
  );

-- Assigned card records are private to the graduate and promotion head. The
-- RPC applies the same authorization even when called through SECURITY DEFINER.
drop policy if exists mp_scope_select on public.student_ceremony_cards;
drop policy if exists mp_night_event_visibility_select on public.student_ceremony_cards;
create policy student_cards_owner_or_head_select on public.student_ceremony_cards
  for select to authenticated
  using (
    public.mp_can_read_ceremony(promotion_id, ceremony_id)
    and (
      public.mp_feature_admin(promotion_id, array['super_admin']::text[])
      or exists (
        select 1 from public.graduate_accounts g
        where g.student_id = student_ceremony_cards.student_id
          and g.promotion_id = student_ceremony_cards.promotion_id
          and g.user_id = auth.uid()
      )
    )
  );

create or replace function public.get_student_cards(_student_id uuid)
returns table(
  ceremony_id uuid,
  ceremony_name text,
  ceremony_name_fr text,
  ceremony_type text,
  card_type_id uuid,
  card_type_name text,
  card_type_name_fr text,
  card_color text,
  quantity integer
)
language sql
stable
security definer
set search_path = public
as $$
  select c.id, c.name, c.name_fr, c.type,
         ct.id, ct.name, ct.name_fr, ct.color, scc.quantity
  from public.student_ceremony_cards scc
  join public.students st on st.id = scc.student_id and st.promotion_id = scc.promotion_id
  join public.ceremonies c on c.id = scc.ceremony_id and c.promotion_id = scc.promotion_id
  left join public.ceremony_card_types ct
    on ct.id = scc.card_type_id and ct.promotion_id = scc.promotion_id
  where st.id = _student_id
    and public.mp_can_read_ceremony(st.promotion_id, c.id)
    and (
      public.mp_feature_admin(st.promotion_id, array['super_admin']::text[])
      or exists (
        select 1 from public.graduate_accounts g
        where g.student_id = st.id and g.promotion_id = st.promotion_id
          and g.user_id = auth.uid()
      )
    )
  order by (c.type = 'night'), ct.created_at nulls first;
$$;

commit;
