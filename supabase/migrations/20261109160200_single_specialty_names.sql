begin;
create or replace function public.platform_set_single_specialty(_promotion_id uuid,_enabled boolean,_name_ar text default null,_name_fr text default null)
returns public.specialties language plpgsql security definer set search_path=public as $func$
declare v public.specialties; n integer;
begin
  if not public.is_platform_admin() then raise exception 'FORBIDDEN'; end if;
  if not coalesce(_enabled,false) then update public.promotions set single_specialty_enabled=false,updated_at=now() where id=_promotion_id; return null; end if;
  if length(btrim(coalesce(_name_ar,'')))<2 or length(btrim(coalesce(_name_fr,'')))<2 then raise exception 'SPECIALTY_NAMES_REQUIRED'; end if;
  select count(*) into n from public.specialties where promotion_id=_promotion_id;
  if n>1 then raise exception 'PROMOTION_HAS_MULTIPLE_SPECIALTIES'; end if;
  if n=0 then insert into public.specialties(promotion_id,name,name_fr) values(_promotion_id,left(btrim(_name_ar),120),left(btrim(_name_fr),120)) returning * into v;
  else update public.specialties set name=left(btrim(_name_ar),120),name_fr=left(btrim(_name_fr),120),updated_at=now() where promotion_id=_promotion_id returning * into v; end if;
  update public.promotions set single_specialty_enabled=true,updated_at=now() where id=_promotion_id;
  return v;
end $func$;
revoke all on function public.platform_set_single_specialty(uuid,boolean,text,text) from public,anon;
grant execute on function public.platform_set_single_specialty(uuid,boolean,text,text) to authenticated,service_role;
commit;
