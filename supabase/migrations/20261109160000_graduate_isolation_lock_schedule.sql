begin;

-- A user may legitimately have a separate graduate account in each promotion.
alter table public.graduate_accounts drop constraint if exists graduate_accounts_user_id_key;
create unique index if not exists graduate_accounts_promotion_user_uidx on public.graduate_accounts(promotion_id, user_id);

alter table public.promotions add column if not exists graduate_editing_locked boolean not null default false;
alter table public.subscription_settings add column if not exists payment_start_delegated boolean not null default false;

alter table public.specialties add column if not exists name_fr text;

create or replace function public.registration_mask_regex(_mask text)
returns text language sql immutable as $$
  select '^' || regexp_replace(regexp_replace(upper(btrim(coalesce(_mask,''))), '([\\.\\+\\?\\(\\)\\[\\]\\{\\}\\|\\^\\$])', '\\\\1', 'g'), '#', '[0-9]', 'g') || '$';
$$;

create or replace function public.register_graduate(_promotion_id uuid, _full_name text, _registration_number text, _phone text default null)
returns public.graduate_accounts language plpgsql security definer set search_path = public as $$
declare v public.graduate_accounts; st public.students; p public.promotions; reg text;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  select * into p from public.promotions where id=_promotion_id;
  if not found then raise exception 'PROMOTION_NOT_FOUND'; end if;
  if not public.is_platform_admin() and public.current_promotion_id() is distinct from _promotion_id then raise exception 'PROMOTION_CONTEXT_REQUIRED'; end if;
  reg := upper(btrim(coalesce(_registration_number,'')));
  if reg = '' or reg !~ public.registration_mask_regex(p.registration_mask) then raise exception 'INVALID_REGISTRATION_NUMBER'; end if;
  select * into st from public.students where promotion_id=_promotion_id and upper(btrim(registration_number))=reg limit 1;
  if not found then raise exception 'STUDENT_NOT_FOUND_IN_PROMOTION'; end if;
  insert into public.graduate_accounts(user_id,promotion_id,student_id,specialty_id,full_name,registration_number,phone,certificate_name,sash_name)
  values(auth.uid(),_promotion_id,st.id,st.specialty_id,btrim(_full_name),reg,nullif(btrim(_phone),''),coalesce(nullif(btrim(st.certificate_name),''),btrim(_full_name)),coalesce(nullif(btrim(st.sash_name),''),btrim(_full_name)))
  on conflict (promotion_id,user_id) do update set student_id=excluded.student_id,specialty_id=excluded.specialty_id,full_name=excluded.full_name,registration_number=excluded.registration_number,phone=excluded.phone,updated_at=now()
  returning * into v;
  return v;
end $$;

create or replace function public.update_graduate_display_names(_certificate_name text, _sash_name text)
returns public.graduate_accounts language plpgsql security definer set search_path=public as $$
declare v public.graduate_accounts;
begin
  select g.* into v from public.graduate_accounts g where g.user_id=auth.uid() and g.promotion_id=public.current_promotion_id() limit 1 for update;
  if not found then raise exception 'GRADUATE_ACCOUNT_NOT_FOUND'; end if;
  if exists(select 1 from public.promotions p where p.id=v.promotion_id and p.graduate_editing_locked) then raise exception 'GRADUATE_EDITING_LOCKED'; end if;
  update public.graduate_accounts set certificate_name=nullif(left(btrim(_certificate_name),160),''),sash_name=nullif(left(btrim(_sash_name),160),''),updated_at=now() where id=v.id returning * into v;
  return v;
end $$;
revoke all on function public.update_graduate_display_names(text,text) from public,anon;
grant execute on function public.update_graduate_display_names(text,text) to authenticated,service_role;

create or replace function public.platform_update_graduate_editing_lock(_promotion_id uuid,_locked boolean)
returns void language plpgsql security definer set search_path=public as $$
begin
  if not public.is_platform_admin() then raise exception 'FORBIDDEN'; end if;
  update public.promotions set graduate_editing_locked=coalesce(_locked,false),updated_at=now() where id=_promotion_id;
  if not found then raise exception 'PROMOTION_NOT_FOUND'; end if;
end $$;
revoke all on function public.platform_update_graduate_editing_lock(uuid,boolean) from public,anon;
grant execute on function public.platform_update_graduate_editing_lock(uuid,boolean) to authenticated,service_role;

create or replace function public.update_payment_schedule(_promotion_id uuid,_starts_at timestamptz,_delegate_to_batch boolean default false)
returns public.subscription_settings language plpgsql security definer set search_path=public as $$
declare v public.subscription_settings;
begin
  if not public.is_platform_admin() then raise exception 'FORBIDDEN'; end if;
  insert into public.subscription_settings(promotion_id,payment_starts_at,payment_start_delegated,updated_by)
  values(_promotion_id,_starts_at,coalesce(_delegate_to_batch,false),auth.uid())
  on conflict(promotion_id) do update set payment_starts_at=excluded.payment_starts_at,payment_start_delegated=excluded.payment_start_delegated,updated_by=auth.uid(),updated_at=now()
  returning * into v;
  return v;
end $$;
revoke all on function public.update_payment_schedule(uuid,timestamptz,boolean) from public,anon;
grant execute on function public.update_payment_schedule(uuid,timestamptz,boolean) to authenticated,service_role;

create or replace function public.update_payment_start_by_batch(_promotion_id uuid,_starts_at timestamptz)
returns public.subscription_settings language plpgsql security definer set search_path=public as $$
declare v public.subscription_settings;
begin
  if not exists(select 1 from public.admins a where a.user_id=auth.uid() and a.role='super_admin' and a.is_active and a.promotion_id=_promotion_id) then raise exception 'FORBIDDEN'; end if;
  if not exists(select 1 from public.subscription_settings s where s.promotion_id=_promotion_id and s.payment_start_delegated) then raise exception 'PAYMENT_SCHEDULE_NOT_DELEGATED'; end if;
  update public.subscription_settings set payment_starts_at=_starts_at,updated_by=auth.uid(),updated_at=now() where promotion_id=_promotion_id returning * into v;
  return v;
end $$;
revoke all on function public.update_payment_start_by_batch(uuid,timestamptz) from public,anon;
grant execute on function public.update_payment_start_by_batch(uuid,timestamptz) to authenticated,service_role;

-- Graduate accounts are visible only inside the active tenant context, except the platform admin.
drop policy if exists graduate_accounts_self on public.graduate_accounts;
create policy graduate_accounts_self on public.graduate_accounts for select to authenticated using ((user_id=auth.uid() and promotion_id=public.current_promotion_id()) or public.mp_feature_admin(promotion_id));
drop policy if exists graduate_accounts_update_self on public.graduate_accounts;

commit;
