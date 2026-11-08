begin;

create or replace function public.platform_assign_promotion_staff(
  _promotion_id uuid,
  _email text,
  _role text,
  _specialty_id uuid default null
)
returns uuid language plpgsql security definer set search_path=public as $$
declare v_user uuid; v_id uuid;
begin
  if not (public.is_platform_admin() or exists (
    select 1 from public.admins a
    where a.user_id=auth.uid() and a.is_active and a.role='super_admin' and a.promotion_id=_promotion_id
  )) then raise exception 'FORBIDDEN'; end if;
  if _role not in ('finance','specialty','night_event') then raise exception 'INVALID_STAFF_ROLE'; end if;
  select id into v_user from auth.users where lower(email)=lower(btrim(_email)) limit 1;
  if v_user is null then raise exception 'USER_NOT_FOUND'; end if;
  if _role='specialty' and not exists (select 1 from public.specialties where id=_specialty_id and promotion_id=_promotion_id) then raise exception 'SPECIALTY_NOT_IN_PROMOTION'; end if;
  if _role <> 'specialty' then _specialty_id := null; end if;
  insert into public.promotion_staff(promotion_id,user_id,role,specialty_id,is_active,created_by)
  values(_promotion_id,v_user,_role,_specialty_id,true,auth.uid())
  on conflict (promotion_id,user_id,role) do update set specialty_id=excluded.specialty_id,is_active=true
  returning id into v_id;
  return v_id;
end $$;
revoke all on function public.platform_assign_promotion_staff(uuid,text,text,uuid) from public,anon;
grant execute on function public.platform_assign_promotion_staff(uuid,text,text,uuid) to authenticated,service_role;

commit;
