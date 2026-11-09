begin;

create or replace function public.register_graduate(
  _promotion_id uuid,
  _full_name text,
  _registration_number text,
  _phone text,
  _specialty_id uuid,
  _certificate_name text,
  _sash_name text
)
returns public.graduate_accounts
language plpgsql security definer set search_path=public as $$
declare
  v public.graduate_accounts;
  st public.students;
  p public.promotions;
  reg text;
  v_specialty uuid;
  v_count integer;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  if length(btrim(coalesce(_full_name,''))) < 2 or length(btrim(coalesce(_full_name,''))) > 160 then raise exception 'INVALID_FULL_NAME'; end if;
  if length(btrim(coalesce(_phone,''))) < 6 or length(btrim(coalesce(_phone,''))) > 30 then raise exception 'INVALID_PHONE'; end if;
  if length(btrim(coalesce(_certificate_name,''))) < 2 or length(btrim(coalesce(_certificate_name,''))) > 160 then raise exception 'INVALID_CERTIFICATE_NAME'; end if;
  if length(btrim(coalesce(_sash_name,''))) < 2 or length(btrim(coalesce(_sash_name,''))) > 160 then raise exception 'INVALID_SASH_NAME'; end if;
  select * into p from public.promotions where id=_promotion_id;
  if not found then raise exception 'PROMOTION_NOT_FOUND'; end if;
  if public.current_promotion_id() is distinct from _promotion_id and not public.is_platform_admin() then raise exception 'PROMOTION_CONTEXT_REQUIRED'; end if;
  reg:=upper(btrim(coalesce(_registration_number,'')));
  if reg='' or reg !~ public.registration_mask_regex(p.registration_mask) then raise exception 'INVALID_REGISTRATION_NUMBER'; end if;
  select count(*) into v_count from public.specialties where promotion_id=_promotion_id;
  select id into v_specialty from public.specialties where promotion_id=_promotion_id order by created_at,id limit 1;
  if v_count > 1 then
    if _specialty_id is null or not exists(select 1 from public.specialties where id=_specialty_id and promotion_id=_promotion_id) then raise exception 'SPECIALTY_NOT_IN_PROMOTION'; end if;
    v_specialty := _specialty_id;
  elsif v_count = 1 and _specialty_id is not null and _specialty_id <> v_specialty then raise exception 'SPECIALTY_NOT_IN_PROMOTION'; end if;
  select * into st from public.students where promotion_id=_promotion_id and upper(btrim(registration_number))=reg limit 1;
  if not found then raise exception 'STUDENT_NOT_FOUND_IN_PROMOTION'; end if;
  if v_specialty is not null and st.specialty_id is distinct from v_specialty then raise exception 'STUDENT_SPECIALTY_MISMATCH'; end if;
  insert into public.graduate_accounts(user_id,promotion_id,student_id,specialty_id,full_name,registration_number,phone,certificate_name,sash_name)
  values(auth.uid(),_promotion_id,st.id,st.specialty_id,btrim(_full_name),reg,nullif(btrim(_phone),''),btrim(_certificate_name),btrim(_sash_name))
  on conflict (promotion_id,user_id) do update set student_id=excluded.student_id,specialty_id=excluded.specialty_id,full_name=excluded.full_name,registration_number=excluded.registration_number,phone=excluded.phone,certificate_name=excluded.certificate_name,sash_name=excluded.sash_name,updated_at=now()
  returning * into v;
  return v;
end $$;
revoke all on function public.register_graduate(uuid,text,text,text,uuid,text,text) from public, anon;
grant execute on function public.register_graduate(uuid,text,text,text,uuid,text,text) to authenticated;

create index if not exists graduate_accounts_user_promotion_idx on public.graduate_accounts(user_id,promotion_id);
commit;
