begin;

alter table public.graduate_accounts
  add column if not exists password_reset_required boolean not null default false;
alter table public.subscription_requests
  add column if not exists sender_phone text;
create index if not exists graduate_accounts_registration_lookup_idx
  on public.graduate_accounts (promotion_id, upper(btrim(registration_number)));

-- Serialize writes for the same normalized registration number. This protects
-- concurrent account creation even though legacy data contains one duplicate group.
-- Existing duplicate rows are deliberately preserved; no account/profile is deleted.
create or replace function public.guard_graduate_registration_uniqueness()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare
  v_registration text;
  v_conflict uuid;
begin
  v_registration := upper(btrim(coalesce(new.registration_number,'')));
  if v_registration = '' then raise exception 'INVALID_REGISTRATION_NUMBER'; end if;

  if tg_op='UPDATE' and new.promotion_id is distinct from old.promotion_id
     and auth.uid() is not null and not public.is_platform_admin() then
    raise exception 'REGISTRATION_NUMBER_IMMUTABLE';
  end if;

  if tg_op='UPDATE'
     and new.promotion_id is not distinct from old.promotion_id
     and v_registration = upper(btrim(old.registration_number)) then
    return new;
  end if;

  if tg_op='UPDATE' and auth.uid() is not null
     and v_registration <> upper(btrim(old.registration_number))
     and not public.is_platform_admin() then
    raise exception 'REGISTRATION_NUMBER_IMMUTABLE';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(new.promotion_id::text || ':' || v_registration, 0));
  select g.id into v_conflict
  from public.graduate_accounts g
  where g.promotion_id=new.promotion_id
    and upper(btrim(g.registration_number))=v_registration
    and g.id is distinct from new.id
  limit 1;
  if found then raise exception 'REGISTRATION_NUMBER_ALREADY_USED'; end if;

  new.registration_number := v_registration;
  return new;
end $$;
drop trigger if exists graduate_registration_uniqueness_guard on public.graduate_accounts;
create trigger graduate_registration_uniqueness_guard
before insert or update of promotion_id,registration_number on public.graduate_accounts
for each row execute function public.guard_graduate_registration_uniqueness();
revoke all on function public.guard_graduate_registration_uniqueness() from public,anon,authenticated;

-- Require the originating phone on every new payment request; legacy requests
-- remain valid and are not rewritten.
create or replace function public.require_subscription_sender_phone()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  new.sender_phone := btrim(coalesce(new.sender_phone,''));
  if char_length(new.sender_phone)<6 or char_length(new.sender_phone)>30 then
    raise exception 'TRANSFER_PHONE_REQUIRED';
  end if;
  return new;
end $$;
drop trigger if exists subscription_sender_phone_guard on public.subscription_requests;
create trigger subscription_sender_phone_guard
before insert or update of sender_phone on public.subscription_requests
for each row execute function public.require_subscription_sender_phone();
revoke all on function public.require_subscription_sender_phone() from public,anon,authenticated;

-- Main platform admin explicitly authorizes one account's password recovery.
create or replace function public.platform_enable_graduate_password_reset(_promotion_id uuid,_registration_number text)
returns boolean language plpgsql security definer set search_path=public as $$
declare v_count integer; v_account uuid;
begin
  if not public.is_platform_admin() then raise exception 'FORBIDDEN'; end if;
  select count(*),(array_agg(g.id order by g.created_at,g.id))[1]
  into v_count,v_account
  from public.graduate_accounts g
  where g.promotion_id=_promotion_id
    and upper(btrim(g.registration_number))=upper(btrim(coalesce(_registration_number,'')));
  if v_count=0 then raise exception 'GRADUATE_ACCOUNT_NOT_FOUND'; end if;
  if v_count<>1 then raise exception 'DUPLICATE_REGISTRATION_ACCOUNT'; end if;
  update public.graduate_accounts set password_reset_required=true,updated_at=now() where id=v_account;
  return true;
end $$;
revoke all on function public.platform_enable_graduate_password_reset(uuid,text) from public,anon;
grant execute on function public.platform_enable_graduate_password_reset(uuid,text) to authenticated;

-- Private service-role lookup: return an auth user only for one explicitly
-- authorized account; duplicate legacy registrations are treated as ambiguous.
create or replace function public.resolve_graduate_password_reset(_promotion_id uuid,_registration_number text)
returns uuid language plpgsql stable security definer set search_path=public as $$
declare v_count integer; v_user uuid; v_enabled boolean;
begin
  select count(*),(array_agg(g.user_id order by g.created_at,g.id))[1],coalesce(bool_and(g.password_reset_required),false)
  into v_count,v_user,v_enabled
  from public.graduate_accounts g
  where g.promotion_id=_promotion_id
    and upper(btrim(g.registration_number))=upper(btrim(coalesce(_registration_number,'')));
  if v_count=1 and v_enabled then return v_user; end if;
  return null;
end $$;
revoke all on function public.resolve_graduate_password_reset(uuid,text) from public,anon,authenticated;
grant execute on function public.resolve_graduate_password_reset(uuid,text) to service_role;

create or replace function public.graduate_complete_password_reset()
returns boolean language plpgsql security definer set search_path=public as $$
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  update public.graduate_accounts set password_reset_required=false,updated_at=now()
  where user_id=auth.uid() and password_reset_required;
  if not found then raise exception 'PASSWORD_RESET_NOT_AUTHORIZED'; end if;
  return true;
end $$;
revoke all on function public.graduate_complete_password_reset() from public,anon;
grant execute on function public.graduate_complete_password_reset() to authenticated;

-- Supervisors may change names and the two award-name fields only. The batch
-- head may still reorder; only the platform admin can change identity/contact,
-- specialty, photo, promotion, or delete a student.
create or replace function public.guard_student_edit_scope()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if auth.uid() is null or public.is_platform_admin() then return new; end if;
  if new.id is distinct from old.id
     or new.created_at is distinct from old.created_at
     or new.registration_number is distinct from old.registration_number
     or new.phone is distinct from old.phone
     or new.specialty_id is distinct from old.specialty_id
     or new.photo_url is distinct from old.photo_url
     or new.promotion_id is distinct from old.promotion_id
     or new.created_by is distinct from old.created_by then
    raise exception 'STUDENT_EDIT_FIELDS_RESTRICTED';
  end if;
  if new.order_index is distinct from old.order_index
     and not public.mp_feature_admin(old.promotion_id,array['super_admin']) then
    raise exception 'STUDENT_ORDER_EDIT_FORBIDDEN';
  end if;
  return new;
end $$;
drop trigger if exists students_edit_scope_guard on public.students;
create trigger students_edit_scope_guard before update on public.students
for each row execute function public.guard_student_edit_scope();
revoke all on function public.guard_student_edit_scope() from public,anon,authenticated;

create or replace function public.guard_student_delete_scope()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if auth.uid() is not null and not public.is_platform_admin() then
    raise exception 'ONLY_PLATFORM_ADMIN_CAN_DELETE_STUDENT';
  end if;
  return old;
end $$;
drop trigger if exists students_delete_scope_guard on public.students;
create trigger students_delete_scope_guard before delete on public.students
for each row execute function public.guard_student_delete_scope();
revoke all on function public.guard_student_delete_scope() from public,anon,authenticated;

-- Keep the linked graduate profile synchronized when an authorized admin edits
-- the authoritative student record. Names and award names are preserved; no row
-- is created or removed by this synchronization.
create or replace function public.sync_student_to_graduate_account()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  update public.graduate_accounts g set
    full_name=new.full_name,
    full_name_fr=new.full_name_fr,
    registration_number=new.registration_number,
    phone=new.phone,
    specialty_id=new.specialty_id,
    sash_name=new.sash_name,
    certificate_name=new.certificate_name,
    updated_at=now()
  where g.promotion_id=new.promotion_id
    and (g.student_id=new.id or (g.student_id is null and upper(btrim(g.registration_number))=upper(btrim(old.registration_number))));
  return new;
end $$;
drop trigger if exists students_sync_graduate_account on public.students;
create trigger students_sync_graduate_account
after update of full_name,full_name_fr,registration_number,phone,specialty_id,sash_name,certificate_name
on public.students for each row execute function public.sync_student_to_graduate_account();
revoke all on function public.sync_student_to_graduate_account() from public,anon,authenticated;

-- Payment-status summaries expose no email, phone, transfer proof, or amounts.
-- Scope department supervisors to their specialty; heads, finance, and platform
-- admins can view the promotion-wide aggregate and status rows.
create or replace function public.get_graduate_student_payment_status(_promotion_id uuid)
returns table(student_id uuid,payment_status text)
language plpgsql stable security definer set search_path=public as $$
declare v_all boolean:=false; v_role text; v_specialty uuid;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  if public.is_platform_admin() then
    v_all:=true;
  else
    select a.role,a.specialty_id into v_role,v_specialty
    from public.admins a
    where a.user_id=auth.uid() and a.promotion_id=_promotion_id and a.is_active
      and a.role in ('super_admin','dept_admin')
    order by case a.role when 'super_admin' then 0 else 1 end
    limit 1;
    if v_role='super_admin' then
      v_all:=true;
    elsif v_role='dept_admin' and v_specialty is not null then
      v_all:=false;
    elsif public.mp_feature_admin(_promotion_id,array['finance']) then
      v_all:=true;
    else
      select ps.specialty_id into v_specialty
      from public.promotion_staff ps
      where ps.user_id=auth.uid() and ps.promotion_id=_promotion_id
        and ps.role='specialty' and ps.is_active and ps.specialty_id is not null
      limit 1;
      if not found then raise exception 'FORBIDDEN'; end if;
      v_all:=false;
    end if;
  end if;

  return query
  select s.id,
    case
      when exists(
        select 1 from public.graduate_accounts g
        join public.subscription_requests r on r.account_id=g.id and r.promotion_id=g.promotion_id
        where g.promotion_id=_promotion_id
          and (g.student_id=s.id or upper(btrim(g.registration_number))=upper(btrim(s.registration_number)))
          and r.status='approved'
      ) then 'paid'
      when exists(
        select 1 from public.graduate_accounts g
        join public.subscription_requests r on r.account_id=g.id and r.promotion_id=g.promotion_id
        where g.promotion_id=_promotion_id
          and (g.student_id=s.id or upper(btrim(g.registration_number))=upper(btrim(s.registration_number)))
          and r.status='pending'
      ) then 'pending'
      else 'unpaid'
    end
  from public.students s
  where s.promotion_id=_promotion_id and (v_all or s.specialty_id=v_specialty)
  order by s.specialty_id,s.order_index,s.id;
end $$;
revoke all on function public.get_graduate_student_payment_status(uuid) from public,anon;
grant execute on function public.get_graduate_student_payment_status(uuid) to authenticated;

commit;
