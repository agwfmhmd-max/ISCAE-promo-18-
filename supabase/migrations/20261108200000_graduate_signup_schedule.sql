begin;

alter table public.graduate_accounts
  add column if not exists certificate_name text,
  add column if not exists sash_name text;
alter table public.subscription_settings
  add column if not exists payment_starts_at timestamptz;

update public.graduate_accounts g
set certificate_name=coalesce(nullif(btrim(g.certificate_name),''),(select s.certificate_name from public.students s where s.promotion_id=g.promotion_id and upper(btrim(s.registration_number))=upper(btrim(g.registration_number)) order by s.created_at,s.id limit 1)),
    sash_name=coalesce(nullif(btrim(g.sash_name),''),(select s.sash_name from public.students s where s.promotion_id=g.promotion_id and upper(btrim(s.registration_number))=upper(btrim(g.registration_number)) order by s.created_at,s.id limit 1)),
    updated_at=now()
where nullif(btrim(g.certificate_name),'') is null or nullif(btrim(g.sash_name),'') is null;

create or replace function public.register_graduate(
  _promotion_id uuid,
  _full_name text,
  _registration_number text,
  _phone text,
  _specialty_id uuid,
  _certificate_name text,
  _sash_name text
)
returns public.graduate_accounts language plpgsql security definer set search_path=public as $$
declare
  v public.graduate_accounts;
  v_count integer;
  v_specialty uuid;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  if length(btrim(coalesce(_full_name,''))) < 2 or length(btrim(coalesce(_full_name,''))) > 160 then raise exception 'INVALID_FULL_NAME'; end if;
  if length(btrim(coalesce(_registration_number,''))) < 1 or length(btrim(coalesce(_registration_number,''))) > 40 then raise exception 'INVALID_REGISTRATION_NUMBER'; end if;
  if length(btrim(coalesce(_phone,''))) < 6 or length(btrim(coalesce(_phone,''))) > 30 then raise exception 'INVALID_PHONE'; end if;
  if length(btrim(coalesce(_certificate_name,''))) < 2 or length(btrim(coalesce(_certificate_name,''))) > 160 then raise exception 'INVALID_CERTIFICATE_NAME'; end if;
  if length(btrim(coalesce(_sash_name,''))) < 2 or length(btrim(coalesce(_sash_name,''))) > 160 then raise exception 'INVALID_SASH_NAME'; end if;
  if not exists (select 1 from public.promotions where id=_promotion_id) then raise exception 'PROMOTION_NOT_FOUND'; end if;
  select count(*) into v_count from public.specialties where promotion_id=_promotion_id;
  select id into v_specialty from public.specialties where promotion_id=_promotion_id order by created_at,id limit 1;
  if v_count > 1 then
    if _specialty_id is null then raise exception 'SPECIALTY_REQUIRED'; end if;
    if not exists (select 1 from public.specialties where id=_specialty_id and promotion_id=_promotion_id) then raise exception 'SPECIALTY_NOT_IN_PROMOTION'; end if;
    v_specialty := _specialty_id;
  elsif v_count = 1 then
    if _specialty_id is not null and _specialty_id <> v_specialty then raise exception 'SPECIALTY_NOT_IN_PROMOTION'; end if;
  else
    v_specialty := null;
  end if;
  insert into public.graduate_accounts(user_id,promotion_id,full_name,registration_number,phone,specialty_id,certificate_name,sash_name)
  values(auth.uid(),_promotion_id,btrim(_full_name),btrim(_registration_number),nullif(btrim(_phone),''),v_specialty,nullif(btrim(coalesce(_certificate_name,'')),''),nullif(btrim(coalesce(_sash_name,'')),''))
  on conflict (user_id) do update set
    full_name=excluded.full_name,
    registration_number=excluded.registration_number,
    phone=excluded.phone,
    specialty_id=coalesce(excluded.specialty_id, public.graduate_accounts.specialty_id),
    certificate_name=coalesce(excluded.certificate_name,public.graduate_accounts.certificate_name),
    sash_name=coalesce(excluded.sash_name,public.graduate_accounts.sash_name),
    updated_at=now()
  where public.graduate_accounts.promotion_id=excluded.promotion_id
  returning * into v;
  if not found then raise exception 'ACCOUNT_PROMOTION_MISMATCH'; end if;
  return v;
end $$;
revoke all on function public.register_graduate(uuid,text,text,text,uuid,text,text) from public, anon;
grant execute on function public.register_graduate(uuid,text,text,text,uuid,text,text) to authenticated;

create or replace function public.can_schedule_graduate_payments(_promotion_id uuid)
returns boolean language sql stable security definer set search_path=public as $$
  select auth.role()='service_role' or public.is_platform_admin() or exists(
    select 1 from public.admins a where a.user_id=auth.uid() and a.is_active
      and a.role='super_admin' and a.promotion_id=_promotion_id
  );
$$;
revoke all on function public.can_schedule_graduate_payments(uuid) from public, anon;
grant execute on function public.can_schedule_graduate_payments(uuid) to authenticated, service_role;

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

create or replace function public.guard_graduate_payment_schedule()
returns trigger language plpgsql security definer set search_path=public as $$
declare
  v_promotion_id uuid;
  v_start timestamptz;
begin
  if tg_op='INSERT' then
    v_promotion_id := new.promotion_id;
    v_start := new.payment_starts_at;
    if v_start is not null and not public.can_schedule_graduate_payments(v_promotion_id) then raise exception 'PAYMENT_SCHEDULE_FORBIDDEN'; end if;
  else
    v_promotion_id := new.promotion_id;
    v_start := new.payment_starts_at;
    if v_start is distinct from old.payment_starts_at and not public.can_schedule_graduate_payments(v_promotion_id) then raise exception 'PAYMENT_SCHEDULE_FORBIDDEN'; end if;
  end if;
  return new;
end $$;
drop trigger if exists guard_graduate_payment_schedule on public.subscription_settings;
create trigger guard_graduate_payment_schedule before insert or update of payment_starts_at on public.subscription_settings
for each row execute function public.guard_graduate_payment_schedule();

create or replace function public.guard_graduate_subscription_insert()
returns trigger language plpgsql security definer set search_path=public as $$
declare
  g public.graduate_accounts;
  v_starts_at timestamptz;
begin
  select * into g from public.graduate_accounts where id=new.account_id and promotion_id=new.promotion_id for update;
  if not found then raise exception 'GRADUATE_ACCOUNT_NOT_FOUND'; end if;
  if g.user_id <> auth.uid() and not public.mp_feature_admin(new.promotion_id,array['finance','super_admin']) then raise exception 'FORBIDDEN'; end if;
  if g.membership_status='active' or exists(select 1 from public.subscription_requests where account_id=g.id and status='approved') then
    raise exception 'SUBSCRIPTION_ALREADY_APPROVED';
  end if;
  if exists(select 1 from public.subscription_requests where account_id=g.id and status='pending') then
    raise exception 'SUBSCRIPTION_PENDING';
  end if;
  select payment_starts_at into v_starts_at from public.subscription_settings where promotion_id=new.promotion_id;
  if v_starts_at is not null and now() < v_starts_at then raise exception 'PAYMENT_NOT_OPEN'; end if;
  if new.bank_id is not null and not exists(select 1 from public.payment_banks where id=new.bank_id and promotion_id=new.promotion_id and is_active) then
    raise exception 'PAYMENT_BANK_UNAVAILABLE';
  end if;
  return new;
end $$;

create or replace function public.review_subscription_request(_request_id uuid, _status text, _reason text default null)
returns public.subscription_requests language plpgsql security definer set search_path=public as $$
declare
  v public.subscription_requests;
  g public.graduate_accounts;
  s public.students;
  v_spec uuid;
  v_spec_count integer;
begin
  select * into v from public.subscription_requests where id=_request_id for update;
  if not found then raise exception 'REQUEST_NOT_FOUND'; end if;
  if not public.mp_feature_admin(v.promotion_id,array['finance','super_admin']) then raise exception 'FORBIDDEN'; end if;
  if _status not in ('approved','rejected') then raise exception 'INVALID_DECISION'; end if;
  if _status='rejected' and length(btrim(coalesce(_reason,'')))<3 then raise exception 'REJECTION_REASON_REQUIRED'; end if;
  select * into g from public.graduate_accounts where id=v.account_id and promotion_id=v.promotion_id for update;
  if not found then raise exception 'GRADUATE_ACCOUNT_NOT_FOUND'; end if;
  if v.status <> 'pending' then raise exception 'REQUEST_ALREADY_REVIEWED'; end if;
  if _status='approved' then
    if g.membership_status='active' or exists(select 1 from public.subscription_requests where account_id=g.id and status='approved' and id<>v.id) then raise exception 'SUBSCRIPTION_ALREADY_APPROVED'; end if;
    select count(*) into v_spec_count from public.specialties where promotion_id=v.promotion_id;
    select id into v_spec from public.specialties where promotion_id=v.promotion_id order by created_at,id limit 1;
    if v_spec_count=0 then
      insert into public.specialties(name,code,promotion_id) values('عام','GEN',v.promotion_id) returning id into v_spec;
      v_spec_count := 1;
    end if;
    if v_spec_count > 1 then
      if g.specialty_id is null or not exists(select 1 from public.specialties where id=g.specialty_id and promotion_id=g.promotion_id) then raise exception 'SPECIALTY_REQUIRED'; end if;
      v_spec := g.specialty_id;
    elsif v_spec_count = 1 then
      v_spec := coalesce(g.specialty_id,v_spec);
    end if;
    select * into s from public.students where promotion_id=g.promotion_id and upper(btrim(registration_number))=upper(btrim(g.registration_number)) limit 1 for update;
    if found then
      if s.specialty_id <> v_spec then raise exception 'STUDENT_SPECIALTY_MISMATCH'; end if;
      update public.students set full_name=g.full_name,phone=coalesce(nullif(g.phone,''),phone),certificate_name=coalesce(nullif(g.certificate_name,''),certificate_name),sash_name=coalesce(nullif(g.sash_name,''),sash_name) where id=s.id;
    else
      insert into public.students(full_name,registration_number,phone,certificate_name,sash_name,specialty_id,created_by,promotion_id)
      values(g.full_name,g.registration_number,g.phone,g.certificate_name,g.sash_name,v_spec,auth.uid(),g.promotion_id) returning * into s;
    end if;
    update public.graduate_accounts set membership_status='active',student_id=s.id,specialty_id=v_spec,updated_at=now() where id=g.id;
    update public.subscription_requests set status='approved',rejection_reason=null,reviewed_by=auth.uid(),reviewed_at=now(),updated_at=now() where id=v.id returning * into v;
    insert into public.graduate_notifications(promotion_id,user_id,title,body,url)
    values(v.promotion_id,g.user_id,'تم قبول الاشتراك','تم قبول طلب اشتراكك وتفعيل عضويتك، وإضافتك إلى قائمة طلاب تخصصك.','?graduate=1');
  else
    update public.subscription_requests set status='rejected',rejection_reason=btrim(_reason),reviewed_by=auth.uid(),reviewed_at=now(),updated_at=now() where id=v.id returning * into v;
    insert into public.graduate_notifications(promotion_id,user_id,title,body,url)
    values(v.promotion_id,g.user_id,'تم رفض الاشتراك','تم رفض طلب اشتراكك: '||btrim(_reason)||'. يمكنك إعادة التقديم.','?graduate=1');
  end if;
  return v;
end $$;
revoke all on function public.review_subscription_request(uuid,text,text) from public, anon;
grant execute on function public.review_subscription_request(uuid,text,text) to authenticated;

commit;
