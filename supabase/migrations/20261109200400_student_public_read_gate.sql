begin;

-- PostgreSQL permissive SELECT policies are OR-combined. Restrict the existing
-- tenant-scope policy as well as the paid-only public policy to close that path.
drop policy if exists mp_scope_select on public.students;
create policy mp_scope_select on public.students for select to anon,authenticated using (
  public.mp_can_read(promotion_id) and (
    exists(select 1 from public.graduate_accounts g join public.subscription_requests r on r.account_id=g.id and r.promotion_id=g.promotion_id where g.student_id=students.id and g.promotion_id=students.promotion_id and r.status='approved')
    or public.mp_feature_admin(promotion_id,array['super_admin'])
    or (public.is_admin() and specialty_id=public.my_specialty())
    or public.is_super_admin()
  )
);
drop policy if exists students_read on public.students;
create policy students_read on public.students for select to anon,authenticated using (
  public.mp_can_read(promotion_id) and (
    exists(select 1 from public.graduate_accounts g join public.subscription_requests r on r.account_id=g.id and r.promotion_id=g.promotion_id where g.student_id=students.id and g.promotion_id=students.promotion_id and r.status='approved')
    or public.mp_feature_admin(promotion_id,array['super_admin'])
    or (public.is_admin() and specialty_id=public.my_specialty())
    or public.is_super_admin()
  )
);

commit;
