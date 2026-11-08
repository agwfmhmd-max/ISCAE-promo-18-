begin;

create or replace function public.mp_feature_admin(_promotion_id uuid, _roles text[] default null)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_platform_admin() or exists (
    select 1 from public.admins a
    where a.user_id = auth.uid() and coalesce(a.is_active,true)
      and (a.is_platform or a.promotion_id = _promotion_id)
      and (a.role = 'super_admin' or (a.role = 'dept_admin' and a.specialty_id is null) or _roles is null or a.role = any(_roles))
  ) or exists (
    select 1 from public.promotion_staff s
    where s.user_id = auth.uid() and s.promotion_id = _promotion_id and s.is_active
      and (_roles is null or s.role = any(_roles))
  );
$$;

revoke all on function public.mp_feature_admin(uuid,text[]) from public, anon;
grant execute on function public.mp_feature_admin(uuid,text[]) to authenticated, service_role;

commit;
