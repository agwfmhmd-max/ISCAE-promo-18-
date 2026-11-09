begin;

-- Optional roster mode: older promotions keep the existing student self-entry flow.
alter table public.promotions
  add column if not exists graduate_roster_uploaded boolean not null default false;
alter table public.students
  add column if not exists full_name_fr text;
alter table public.graduate_accounts
  add column if not exists full_name_fr text;

-- A roster is authoritative for imported promotions. Do not reject a verified
-- existing registration number merely because an older mask does not describe it.
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

create or replace function public.lookup_graduate_registration(_promotion_id uuid,_registration_number text)
returns jsonb language plpgsql stable security definer set search_path=public as $$
declare st public.students; sp public.specialties;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  if public.current_promotion_id() is distinct from _promotion_id and not public.is_platform_admin() then raise exception 'PROMOTION_CONTEXT_REQUIRED'; end if;
  select s.* into st from public.students s where s.promotion_id=_promotion_id and upper(btrim(s.registration_number))=upper(btrim(coalesce(_registration_number,''))) order by s.created_at,s.id limit 1;
  if not found then return null; end if;
  select * into sp from public.specialties where id=st.specialty_id and promotion_id=_promotion_id;
  return jsonb_build_object('student_id',st.id,'full_name',st.full_name,'full_name_fr',st.full_name_fr,'registration_number',st.registration_number,'specialty_id',st.specialty_id,'specialty_ar',sp.name,'specialty_fr',sp.name_fr);
end $$;
revoke all on function public.lookup_graduate_registration(uuid,text) from public,anon;
grant execute on function public.lookup_graduate_registration(uuid,text) to authenticated;

-- The platform administrator uploads one bilingual list per promotion.
create or replace function public.platform_import_graduate_roster(_promotion_id uuid,_rows jsonb)
returns jsonb language plpgsql security definer set search_path=public as $$
declare r jsonb; v_ar text; v_fr text; v_reg text; v_sp_ar text; v_sp_fr text; v_sp uuid; v_student uuid; v_order integer; inserted_count integer:=0; updated_count integer:=0;
begin
  if not public.is_platform_admin() then raise exception 'FORBIDDEN'; end if;
  if not exists(select 1 from public.promotions where id=_promotion_id) then raise exception 'PROMOTION_NOT_FOUND'; end if;
  if jsonb_typeof(_rows) is distinct from 'array' or jsonb_array_length(_rows)<1 or jsonb_array_length(_rows)>5000 then raise exception 'INVALID_ROSTER_ROWS'; end if;
  perform 1 from public.promotions where id=_promotion_id for update;
  select coalesce(max(order_index),0)+1 into v_order from public.students where promotion_id=_promotion_id;
  for r in select value from jsonb_array_elements(_rows) loop
    v_ar:=left(btrim(coalesce(r->>'full_name_ar','')),160);
    v_fr:=left(btrim(coalesce(r->>'full_name_fr','')),160);
    v_reg:=upper(left(btrim(coalesce(r->>'registration_number','')),40));
    v_sp_ar:=left(btrim(coalesce(r->>'specialty_ar','')),120);
    v_sp_fr:=left(btrim(coalesce(r->>'specialty_fr','')),120);
    if length(v_ar)<2 or length(v_fr)<2 or v_reg='' or length(v_sp_ar)<2 or length(v_sp_fr)<2 then raise exception 'INVALID_ROSTER_ROW'; end if;
    select id into v_sp from public.specialties where promotion_id=_promotion_id and lower(btrim(name))=lower(v_sp_ar) limit 1;
    if v_sp is null then
      insert into public.specialties(promotion_id,name,name_fr) values(_promotion_id,v_sp_ar,v_sp_fr) returning id into v_sp;
    else
      update public.specialties set name_fr=v_sp_fr,updated_at=now() where id=v_sp;
    end if;
    select id into v_student from public.students where promotion_id=_promotion_id and upper(btrim(registration_number))=v_reg order by created_at,id limit 1;
    if v_student is null then
      insert into public.students(full_name,full_name_fr,registration_number,specialty_id,order_index,created_by,promotion_id)
      values(v_ar,v_fr,v_reg,v_sp,v_order,auth.uid(),_promotion_id) returning id into v_student;
      v_order:=v_order+1; inserted_count:=inserted_count+1;
    else
      update public.students set full_name=v_ar,full_name_fr=v_fr,specialty_id=v_sp,updated_at=now() where id=v_student;
      updated_count:=updated_count+1;
    end if;
    v_sp:=null; v_student:=null;
  end loop;
  update public.promotions set graduate_roster_uploaded=true,updated_at=now() where id=_promotion_id;
  return jsonb_build_object('inserted',inserted_count,'updated',updated_count,'total',jsonb_array_length(_rows));
end $$;
revoke all on function public.platform_import_graduate_roster(uuid,jsonb) from public,anon;
grant execute on function public.platform_import_graduate_roster(uuid,jsonb) to authenticated;

-- Keep the legacy seven-argument registration flow intact for non-roster promotions.
-- In roster mode, verified roster data overrides client-supplied identity/specialty.
create or replace function public.register_graduate(
  _promotion_id uuid,_full_name text,_registration_number text,_phone text,
  _specialty_id uuid,_certificate_name text,_sash_name text
)
returns public.graduate_accounts language plpgsql security definer set search_path=public as $$
declare v public.graduate_accounts; st public.students; p public.promotions; reg text; v_specialty uuid; v_count integer;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  if length(btrim(coalesce(_phone,'')))<6 or length(btrim(coalesce(_phone,'')))>30 then raise exception 'INVALID_PHONE'; end if;
  if length(btrim(coalesce(_certificate_name,'')))<2 or length(btrim(coalesce(_certificate_name,'')))>160 then raise exception 'INVALID_CERTIFICATE_NAME'; end if;
  if length(btrim(coalesce(_sash_name,'')))<2 or length(btrim(coalesce(_sash_name,'')))>160 then raise exception 'INVALID_SASH_NAME'; end if;
  select * into p from public.promotions where id=_promotion_id;
  if not found then raise exception 'PROMOTION_NOT_FOUND'; end if;
  if public.current_promotion_id() is distinct from _promotion_id and not public.is_platform_admin() then raise exception 'PROMOTION_CONTEXT_REQUIRED'; end if;
  reg:=upper(btrim(coalesce(_registration_number,'')));
  if reg='' or length(reg)>40 then raise exception 'INVALID_REGISTRATION_NUMBER'; end if;
  select * into st from public.students where promotion_id=_promotion_id and upper(btrim(registration_number))=reg order by created_at,id limit 1;
  if p.graduate_roster_uploaded then
    if not found then raise exception 'STUDENT_NOT_FOUND_IN_PROMOTION'; end if;
    v_specialty:=st.specialty_id;
    if v_specialty is null then raise exception 'STUDENT_SPECIALTY_MISSING'; end if;
  else
    if reg !~ public.registration_mask_regex(p.registration_mask) then raise exception 'INVALID_REGISTRATION_NUMBER'; end if;
    select count(*) into v_count from public.specialties where promotion_id=_promotion_id;
    select id into v_specialty from public.specialties where promotion_id=_promotion_id order by created_at,id limit 1;
    if v_count>1 then
      if _specialty_id is null or not exists(select 1 from public.specialties where id=_specialty_id and promotion_id=_promotion_id) then raise exception 'SPECIALTY_NOT_IN_PROMOTION'; end if;
      v_specialty:=_specialty_id;
    elsif v_count=1 and _specialty_id is not null and _specialty_id<>v_specialty then raise exception 'SPECIALTY_NOT_IN_PROMOTION'; end if;
  end if;
  insert into public.graduate_accounts(user_id,promotion_id,student_id,specialty_id,full_name,full_name_fr,registration_number,phone,certificate_name,sash_name)
  values(auth.uid(),_promotion_id,case when p.graduate_roster_uploaded then st.id else null end,v_specialty,
    case when p.graduate_roster_uploaded then st.full_name else btrim(_full_name) end,
    case when p.graduate_roster_uploaded then st.full_name_fr else null end,
    reg,nullif(btrim(_phone),''),btrim(_certificate_name),btrim(_sash_name))
  on conflict (promotion_id,user_id) do update set student_id=excluded.student_id,specialty_id=excluded.specialty_id,
    full_name=excluded.full_name,full_name_fr=excluded.full_name_fr,registration_number=excluded.registration_number,
    phone=excluded.phone,certificate_name=excluded.certificate_name,sash_name=excluded.sash_name,updated_at=now()
  returning * into v;
  return v;
end $$;
revoke all on function public.register_graduate(uuid,text,text,text,uuid,text,text) from public,anon;
grant execute on function public.register_graduate(uuid,text,text,text,uuid,text,text) to authenticated;

-- Server-side amount is always the fixed promotion subscription amount.
create or replace function public.enforce_fixed_subscription_amount()
returns trigger language plpgsql security definer set search_path=public as $$
declare v_amount numeric;
begin
  select amount into v_amount from public.subscription_settings where promotion_id=new.promotion_id;
  if not found or v_amount<=0 then raise exception 'SUBSCRIPTION_AMOUNT_NOT_CONFIGURED'; end if;
  new.amount:=v_amount;
  return new;
end $$;
drop trigger if exists subscription_request_fixed_amount on public.subscription_requests;
create trigger subscription_request_fixed_amount before insert on public.subscription_requests for each row execute function public.enforce_fixed_subscription_amount();

-- Financial staff cannot skip an earlier pending request in the same promotion.
create or replace function public.guard_subscription_review_fifo()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if old.status='pending' and new.status in ('approved','rejected') and exists(
    select 1 from public.subscription_requests r where r.promotion_id=old.promotion_id and r.status='pending'
      and (r.created_at,r.id)<(old.created_at,old.id)
  ) then raise exception 'PREVIOUS_REQUEST_UNREVIEWED'; end if;
  return new;
end $$;
drop trigger if exists subscription_request_review_fifo on public.subscription_requests;
create trigger subscription_request_review_fifo before update of status on public.subscription_requests for each row execute function public.guard_subscription_review_fifo();

-- Public search/read shows only students whose subscription was approved; admins
-- retain access to the full imported roster for management.
drop policy if exists students_read on public.students;
create policy students_read on public.students for select to anon,authenticated using (
  exists(select 1 from public.graduate_accounts g join public.subscription_requests r on r.account_id=g.id and r.promotion_id=g.promotion_id
    where g.student_id=students.id and g.promotion_id=students.promotion_id and r.status='approved')
  or public.mp_feature_admin(promotion_id,array['super_admin'])
  or (public.is_admin() and specialty_id=public.my_specialty())
);

-- Finance may prepare draft reports; only a batch president/platform admin can publish.
drop policy if exists financial_reports_manage on public.promotion_financial_reports;
drop policy if exists financial_reports_scope on public.promotion_financial_reports;
create policy financial_reports_scope on public.promotion_financial_reports for select to authenticated
using (status='published' or public.mp_feature_admin(promotion_id,array['finance','super_admin']));
create policy financial_reports_manage on public.promotion_financial_reports for all to authenticated
using (status='draft' and public.mp_feature_admin(promotion_id,array['finance','super_admin']))
with check (status='draft' and public.mp_feature_admin(promotion_id,array['finance','super_admin']));
drop policy if exists financial_entries_manage on public.financial_report_entries;
drop policy if exists financial_entries_scope on public.financial_report_entries;
create policy financial_entries_scope on public.financial_report_entries for select to authenticated using (
  exists(select 1 from public.promotion_financial_reports r where r.id=report_id and (r.status='published' or public.mp_feature_admin(r.promotion_id,array['finance','super_admin'])))
);
create policy financial_entries_manage on public.financial_report_entries for all to authenticated using (
  exists(select 1 from public.promotion_financial_reports r where r.id=report_id and r.status='draft' and public.mp_feature_admin(r.promotion_id,array['finance','super_admin']))
) with check (
  exists(select 1 from public.promotion_financial_reports r where r.id=report_id and r.promotion_id=financial_report_entries.promotion_id and r.status='draft' and public.mp_feature_admin(r.promotion_id,array['finance','super_admin']))
);
create or replace function public.publish_promotion_financial_report(_report_id uuid)
returns public.promotion_financial_reports language plpgsql security definer set search_path=public as $$
declare v public.promotion_financial_reports;
begin
  select * into v from public.promotion_financial_reports where id=_report_id for update;
  if not found then raise exception 'REPORT_NOT_FOUND'; end if;
  if not public.mp_feature_admin(v.promotion_id,array['super_admin']) then raise exception 'FORBIDDEN'; end if;
  if v.status<>'draft' then raise exception 'REPORT_NOT_DRAFT'; end if;
  update public.promotion_financial_reports set status='published',published_at=now(),published_by=auth.uid(),updated_at=now() where id=_report_id returning * into v;
  return v;
end $$;
revoke all on function public.publish_promotion_financial_report(uuid) from public,anon;
grant execute on function public.publish_promotion_financial_report(uuid) to authenticated;

commit;
