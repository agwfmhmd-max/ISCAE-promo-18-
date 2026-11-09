begin;

-- Preserve all existing rows; NOT VALID composite foreign keys enforce tenant pairing on future writes.
do $$ begin
  if not exists (select 1 from pg_constraint where conname='graduate_accounts_id_promotion_key' and conrelid='public.graduate_accounts'::regclass) then
    alter table public.graduate_accounts add constraint graduate_accounts_id_promotion_key unique(id,promotion_id);
  end if;
  if not exists (select 1 from pg_constraint where conname='subscription_requests_account_promotion_fkey' and conrelid='public.subscription_requests'::regclass) then
    alter table public.subscription_requests add constraint subscription_requests_account_promotion_fkey foreign key(account_id,promotion_id) references public.graduate_accounts(id,promotion_id) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname='graduate_memories_account_promotion_fkey' and conrelid='public.graduate_memories'::regclass) then
    alter table public.graduate_memories add constraint graduate_memories_account_promotion_fkey foreign key(account_id,promotion_id) references public.graduate_accounts(id,promotion_id) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname='graduate_accounts_user_id_key' and conrelid='public.graduate_accounts'::regclass) then
    if exists(select 1 from public.graduate_accounts group by user_id having count(distinct promotion_id)>1) then raise exception 'DUPLICATE_GRADUATE_PROMOTION_ACCOUNTS'; end if;
    alter table public.graduate_accounts add constraint graduate_accounts_user_id_key unique(user_id);
  end if;
end $$;

create or replace function public.graduate_account_is_elsewhere()
returns boolean language sql stable security definer set search_path=public as $$
  select auth.uid() is not null and exists(select 1 from public.graduate_accounts g where g.user_id=auth.uid() and g.promotion_id is distinct from public.current_promotion_id());
$$;
revoke all on function public.graduate_account_is_elsewhere() from public,anon;
grant execute on function public.graduate_account_is_elsewhere() to authenticated;

create or replace function public.guard_graduate_account_promotion_scope()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if auth.uid() is not null and new.user_id=auth.uid() and exists(select 1 from public.graduate_accounts g where g.user_id=auth.uid() and g.promotion_id is distinct from new.promotion_id) then
    raise exception 'ACCOUNT_PROMOTION_MISMATCH';
  end if;
  return new;
end $$;
drop trigger if exists graduate_account_promotion_scope_guard on public.graduate_accounts;
create trigger graduate_account_promotion_scope_guard before insert or update of promotion_id,user_id on public.graduate_accounts for each row execute function public.guard_graduate_account_promotion_scope();

drop policy if exists subscription_requests_insert on public.subscription_requests;
create policy subscription_requests_insert on public.subscription_requests for insert to authenticated
with check (exists(select 1 from public.graduate_accounts g where g.id=subscription_requests.account_id and g.user_id=auth.uid() and g.promotion_id=subscription_requests.promotion_id));
drop policy if exists subscription_requests_scope on public.subscription_requests;
create policy subscription_requests_scope on public.subscription_requests for select to authenticated
using ((exists(select 1 from public.graduate_accounts g where g.id=subscription_requests.account_id and g.user_id=auth.uid() and g.promotion_id=subscription_requests.promotion_id)) or public.mp_feature_admin(subscription_requests.promotion_id,array['finance','super_admin']));
drop policy if exists graduate_memories_owner_write on public.graduate_memories;
create policy graduate_memories_owner_write on public.graduate_memories for all to authenticated
using (exists(select 1 from public.graduate_accounts g where g.id=graduate_memories.account_id and g.user_id=auth.uid() and g.promotion_id=graduate_memories.promotion_id))
with check (exists(select 1 from public.graduate_accounts g where g.id=graduate_memories.account_id and g.user_id=auth.uid() and g.promotion_id=graduate_memories.promotion_id));
drop policy if exists graduate_memories_scope on public.graduate_memories;
create policy graduate_memories_scope on public.graduate_memories for select to authenticated
using ((exists(select 1 from public.graduate_accounts g where g.id=graduate_memories.account_id and g.user_id=auth.uid() and g.promotion_id=graduate_memories.promotion_id)
  or (public.mp_feature_admin(graduate_memories.promotion_id) and exists(select 1 from public.graduate_accounts g where g.id=graduate_memories.account_id and g.promotion_id=graduate_memories.promotion_id)))
  and (graduate_memories.visibility <> 'private' or exists(select 1 from public.graduate_accounts g where g.id=graduate_memories.account_id and g.user_id=auth.uid() and g.promotion_id=graduate_memories.promotion_id)));

create or replace function public.enforce_student_registration_mask()
returns trigger language plpgsql security definer set search_path=public as $$
declare v_mask text; v_reg text;
begin
  if tg_op='UPDATE' and upper(btrim(coalesce(new.registration_number,'')))=upper(btrim(coalesce(old.registration_number,''))) then return new; end if;
  if new.promotion_id is null then raise exception 'PROMOTION_REQUIRED'; end if;
  select registration_mask into v_mask from public.promotions where id=new.promotion_id;
  if not found then raise exception 'PROMOTION_NOT_FOUND'; end if;
  v_reg:=upper(btrim(coalesce(new.registration_number,'')));
  if v_reg='' or v_reg !~ public.registration_mask_regex(v_mask) then raise exception 'INVALID_REGISTRATION_NUMBER'; end if;
  new.registration_number:=v_reg;
  return new;
end $$;
drop trigger if exists students_registration_mask_guard on public.students;
create trigger students_registration_mask_guard before insert or update of registration_number,promotion_id on public.students for each row execute function public.enforce_student_registration_mask();

create or replace function public.guard_graduate_account_edit_lock()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if auth.uid() is not null and (tg_op='INSERT' or new.user_id=auth.uid()) and exists(select 1 from public.promotions p where p.id=new.promotion_id and p.graduate_editing_locked) then
    raise exception 'GRADUATE_EDITING_LOCKED';
  end if;
  return new;
end $$;
drop trigger if exists graduate_account_edit_lock_guard on public.graduate_accounts;
create trigger graduate_account_edit_lock_guard before insert or update on public.graduate_accounts for each row execute function public.guard_graduate_account_edit_lock();

create or replace function public.guard_payment_schedule_delegation()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if auth.uid() is not null and new.payment_start_delegated is distinct from old.payment_start_delegated and not public.is_platform_admin() then
    raise exception 'PAYMENT_DELEGATION_FORBIDDEN';
  end if;
  return new;
end $$;
drop trigger if exists subscription_schedule_delegation_guard on public.subscription_settings;
create trigger subscription_schedule_delegation_guard before update of payment_start_delegated on public.subscription_settings for each row execute function public.guard_payment_schedule_delegation();

create or replace function public.update_payment_start_by_batch(_promotion_id uuid,_starts_at timestamptz)
returns public.subscription_settings language plpgsql security definer set search_path=public as $$
declare v public.subscription_settings;
begin
  if not exists(select 1 from public.admins a where a.user_id=auth.uid() and a.role='super_admin' and a.is_active and a.promotion_id=_promotion_id) then raise exception 'FORBIDDEN'; end if;
  if not exists(select 1 from public.subscription_settings s where s.promotion_id=_promotion_id and s.payment_start_delegated) then raise exception 'PAYMENT_SCHEDULE_NOT_DELEGATED'; end if;
  update public.subscription_settings set payment_starts_at=_starts_at,updated_by=auth.uid(),updated_at=now() where promotion_id=_promotion_id returning * into v;
  if not found then raise exception 'SUBSCRIPTION_SETTINGS_NOT_FOUND'; end if;
  return v;
end $$;
revoke all on function public.update_payment_start_by_batch(uuid,timestamptz) from public,anon;
grant execute on function public.update_payment_start_by_batch(uuid,timestamptz) to authenticated,service_role;

create or replace function public.issue_night_event_cards(_ceremony_id uuid)
returns table(card_id uuid, raw_token text, owner_student_id uuid, card_type_id uuid) language plpgsql security definer set search_path=public as $$
declare c public.ceremonies; a record; tok text; cid uuid;
begin
  select * into c from public.ceremonies where id=_ceremony_id;
  if not found or c.type<>'night' then raise exception 'NIGHT_CEREMONY_REQUIRED'; end if;
  if not exists(select 1 from public.promotions p where p.id=c.promotion_id and p.night_event_enabled) then raise exception 'NIGHT_EVENT_DISABLED'; end if;
  if not public.mp_feature_admin(c.promotion_id,array['night_event','super_admin']) then raise exception 'FORBIDDEN'; end if;
  for a in select scc.student_id,scc.card_type_id,scc.quantity from public.student_ceremony_cards scc where scc.ceremony_id=_ceremony_id and scc.promotion_id=c.promotion_id and scc.quantity>0 loop
    for i in 1..a.quantity loop
      tok=encode(gen_random_bytes(24),'hex');
      insert into public.night_event_cards(promotion_id,ceremony_id,card_type_id,owner_student_id,token_hash) values(c.promotion_id,_ceremony_id,a.card_type_id,a.student_id,encode(digest(tok,'sha256'),'hex')) returning id into cid;
      card_id=cid; raw_token=tok; owner_student_id=a.student_id; card_type_id=a.card_type_id; return next;
    end loop;
  end loop;
end $$;
revoke all on function public.issue_night_event_cards(uuid) from public,anon;
grant execute on function public.issue_night_event_cards(uuid) to authenticated,service_role;

create or replace function public.redeem_night_event_card(_token text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v public.night_event_cards;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  select * into v from public.night_event_cards where token_hash=encode(digest(_token,'sha256'),'hex') for update;
  if not found then return jsonb_build_object('ok',false,'status','invalid'); end if;
  if not exists(select 1 from public.promotions p where p.id=v.promotion_id and p.night_event_enabled) then raise exception 'NIGHT_EVENT_DISABLED'; end if;
  if not public.mp_feature_admin(v.promotion_id,array['night_event','super_admin']) then raise exception 'FORBIDDEN'; end if;
  insert into public.night_event_card_scans(card_id,promotion_id,scanned_by,was_already_used,metadata)
  values(v.id,v.promotion_id,auth.uid(),v.used_at is not null,jsonb_build_object('first_used_at',v.used_at));
  if v.used_at is not null then return jsonb_build_object('ok',false,'status','used','used_at',v.used_at); end if;
  update public.night_event_cards set used_at=now(),used_by=auth.uid(),updated_at=now() where id=v.id returning * into v;
  return jsonb_build_object('ok',true,'status','accepted','card_id',v.id,'owner_student_id',v.owner_student_id,'beneficiary_name',v.beneficiary_name,'used_at',v.used_at);
end $$;
revoke all on function public.redeem_night_event_card(text) from public,anon;
grant execute on function public.redeem_night_event_card(text) to authenticated,service_role;

-- Store access also verifies an owned account in the promotion encoded in the path.
create or replace function public.mp_can_access_graduate_storage(_name text,_roles text[] default null)
returns boolean language plpgsql stable security definer set search_path=public as $$
declare v_promotion uuid; v_owner uuid;
begin
  if _name !~ '^(proofs|memories)/[0-9a-f-]{36}/[0-9a-f-]{36}/[^/]+$' then return false; end if;
  v_promotion:=split_part(_name,'/',2)::uuid; v_owner:=split_part(_name,'/',3)::uuid;
  return exists(select 1 from public.graduate_accounts g where g.promotion_id=v_promotion and g.user_id=v_owner and g.user_id=auth.uid())
    or public.mp_can_manage_graduate_storage(_name,_roles);
exception when others then return false;
end $$;
revoke all on function public.mp_can_access_graduate_storage(text,text[]) from public,anon;
grant execute on function public.mp_can_access_graduate_storage(text,text[]) to authenticated,service_role;
drop policy if exists graduate_private_insert on storage.objects;
create policy graduate_private_insert on storage.objects for insert to authenticated with check(bucket_id='graduate-private' and public.mp_can_access_graduate_storage(name,array['finance','night_event','super_admin']));
drop policy if exists graduate_private_select on storage.objects;
create policy graduate_private_select on storage.objects for select to authenticated using(bucket_id='graduate-private' and public.mp_can_access_graduate_storage(name,array['finance','night_event','super_admin']));
drop policy if exists graduate_private_update on storage.objects;
create policy graduate_private_update on storage.objects for update to authenticated using(bucket_id='graduate-private' and public.mp_can_access_graduate_storage(name,array['finance','night_event','super_admin'])) with check(bucket_id='graduate-private' and public.mp_can_access_graduate_storage(name,array['finance','night_event','super_admin']));
drop policy if exists graduate_private_delete on storage.objects;
create policy graduate_private_delete on storage.objects for delete to authenticated using(bucket_id='graduate-private' and public.mp_can_access_graduate_storage(name,array['finance','night_event','super_admin']));

-- Disabled night events retain records but expose neither cards nor scan history and reject direct writes.
drop policy if exists night_cards_scope on public.night_event_cards;
create policy night_cards_scope on public.night_event_cards for select to authenticated using (
  exists(select 1 from public.promotions p where p.id=night_event_cards.promotion_id and p.night_event_enabled)
  and (public.mp_feature_admin(night_event_cards.promotion_id,array['night_event','super_admin'])
    or exists(select 1 from public.graduate_accounts g where g.student_id=night_event_cards.owner_student_id and g.user_id=auth.uid() and g.promotion_id=night_event_cards.promotion_id))
);
drop policy if exists night_cards_manage on public.night_event_cards;
create policy night_cards_manage on public.night_event_cards for all to authenticated
using (exists(select 1 from public.promotions p where p.id=night_event_cards.promotion_id and p.night_event_enabled) and public.mp_feature_admin(night_event_cards.promotion_id,array['night_event','super_admin']))
with check (exists(select 1 from public.promotions p where p.id=night_event_cards.promotion_id and p.night_event_enabled) and public.mp_feature_admin(night_event_cards.promotion_id,array['night_event','super_admin']));
drop policy if exists night_scans_scope on public.night_event_card_scans;
create policy night_scans_scope on public.night_event_card_scans for select to authenticated using (
  exists(select 1 from public.promotions p where p.id=night_event_card_scans.promotion_id and p.night_event_enabled)
  and public.mp_feature_admin(night_event_card_scans.promotion_id,array['night_event','super_admin'])
);

-- Match the setting toggle for every viewer, including promotion managers.
create or replace function public.mp_can_read_ceremony(_promotion_id uuid,_ceremony_id uuid)
returns boolean language sql stable security definer set search_path=public as $$
  select public.mp_can_read(_promotion_id) and exists(
    select 1 from public.ceremonies c join public.promotions p on p.id=c.promotion_id
    where c.id=_ceremony_id and c.promotion_id=_promotion_id and (c.type is distinct from 'night' or p.night_event_enabled is true)
  );
$$;
revoke all on function public.mp_can_read_ceremony(uuid,uuid) from public;
grant execute on function public.mp_can_read_ceremony(uuid,uuid) to anon,authenticated,service_role;

create or replace function public.platform_set_single_specialty(_promotion_id uuid,_enabled boolean,_name_ar text default null,_name_fr text default null)
returns public.specialties language plpgsql security definer set search_path=public as $$
declare v public.specialties; n integer;
begin
  if not public.is_platform_admin() then raise exception 'FORBIDDEN'; end if;
  perform 1 from public.promotions where id=_promotion_id for update;
  if not found then raise exception 'PROMOTION_NOT_FOUND'; end if;
  if not coalesce(_enabled,false) then update public.promotions set single_specialty_enabled=false,updated_at=now() where id=_promotion_id; return null; end if;
  if length(btrim(coalesce(_name_ar,'')))<2 or length(btrim(coalesce(_name_fr,'')))<2 or length(btrim(_name_ar))>120 or length(btrim(_name_fr))>120 then raise exception 'SPECIALTY_NAMES_REQUIRED'; end if;
  select count(*) into n from public.specialties where promotion_id=_promotion_id;
  if n>1 then raise exception 'PROMOTION_HAS_MULTIPLE_SPECIALTIES'; end if;
  if n=0 then insert into public.specialties(promotion_id,name,name_fr) values(_promotion_id,left(btrim(_name_ar),120),left(btrim(_name_fr),120)) returning * into v;
  else update public.specialties set name=left(btrim(_name_ar),120),name_fr=left(btrim(_name_fr),120),updated_at=now() where promotion_id=_promotion_id returning * into v; end if;
  update public.promotions set single_specialty_enabled=true,updated_at=now() where id=_promotion_id;
  return v;
end $$;
revoke all on function public.platform_set_single_specialty(uuid,boolean,text,text) from public,anon;
grant execute on function public.platform_set_single_specialty(uuid,boolean,text,text) to authenticated,service_role;

commit;
