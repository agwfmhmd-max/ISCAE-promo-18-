begin;

create or replace function public.can_manage_graduate_role(_promotion_id uuid,_role text)
returns boolean language sql stable security definer set search_path=public as $$
  select case
    when _role='super_admin' then public.is_platform_admin() or exists(
      select 1 from public.admins a where a.user_id=auth.uid() and a.is_active
        and a.role='super_admin' and (a.is_platform or a.promotion_id=_promotion_id)
    )
    when _role in ('finance','night_event') then public.is_platform_admin() or exists(
      select 1 from public.admins a where a.user_id=auth.uid() and a.is_active
        and a.role='super_admin' and (a.is_platform or a.promotion_id=_promotion_id)
    ) or exists(
      select 1 from public.promotion_staff ps where ps.promotion_id=_promotion_id
        and ps.user_id=auth.uid() and ps.is_active and ps.role=_role
    )
    else false
  end;
$$;
revoke all on function public.can_manage_graduate_role(uuid,text) from public, anon;
grant execute on function public.can_manage_graduate_role(uuid,text) to authenticated, service_role;

commit;
