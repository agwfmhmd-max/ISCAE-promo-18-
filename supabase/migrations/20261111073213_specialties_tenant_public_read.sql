begin;

drop policy if exists mp_scope_select on public.specialties;
create policy specialties_tenant_public_read on public.specialties
  for select to anon, authenticated
  using (
    promotion_id = public.current_promotion_id()
    or public.is_platform_admin()
  );

commit;
