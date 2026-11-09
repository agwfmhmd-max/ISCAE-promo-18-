begin;

create or replace function public.enforce_student_registration_mask()
returns trigger language plpgsql security definer set search_path=public as $$
declare v_mask text; v_reg text; v_roster boolean;
begin
  if tg_op='UPDATE' and upper(btrim(coalesce(new.registration_number,'')))=upper(btrim(coalesce(old.registration_number,''))) then return new; end if;
  if new.promotion_id is null then raise exception 'PROMOTION_REQUIRED'; end if;
  select registration_mask,graduate_roster_uploaded into v_mask,v_roster from public.promotions where id=new.promotion_id;
  if not found then raise exception 'PROMOTION_NOT_FOUND'; end if;
  v_reg:=upper(btrim(coalesce(new.registration_number,'')));
  if v_reg='' or length(v_reg)>40 then raise exception 'INVALID_REGISTRATION_NUMBER'; end if;
  if not coalesce(v_roster,false) and v_mask is not null and v_reg !~ public.registration_mask_regex(v_mask) then raise exception 'INVALID_REGISTRATION_NUMBER'; end if;
  new.registration_number:=v_reg;
  return new;
end $$;

commit;
