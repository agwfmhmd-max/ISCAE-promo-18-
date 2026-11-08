begin;

alter table public.graduate_accounts
  add column if not exists specialty_id uuid references public.specialties(id) on delete set null;
create index if not exists graduate_accounts_specialty_idx on public.graduate_accounts(promotion_id, specialty_id);

update public.graduate_accounts g
set student_id=coalesce(g.student_id,s.id), specialty_id=coalesce(g.specialty_id,s.specialty_id), updated_at=now()
from public.students s
where s.promotion_id=g.promotion_id
  and upper(btrim(s.registration_number))=upper(btrim(g.registration_number))
  and (g.student_id is null or g.specialty_id is null);

do $$
declare
  g public.graduate_accounts;
  v_specialty uuid;
  v_specialty_count integer;
  v_student public.students;
begin
  for g in
    select ga.* from public.graduate_accounts ga
    where ga.student_id is null
      and exists(select 1 from public.subscription_requests sr where sr.account_id=ga.id and sr.promotion_id=ga.promotion_id and sr.status='approved')
  loop
    select * into v_student from public.students
    where promotion_id=g.promotion_id and upper(btrim(registration_number))=upper(btrim(g.registration_number))
    order by created_at,id limit 1;
    if found then
      update public.graduate_accounts set student_id=v_student.id,specialty_id=coalesce(specialty_id,v_student.specialty_id),updated_at=now() where id=g.id;
      continue;
    end if;
    select count(*) into v_specialty_count from public.specialties where promotion_id=g.promotion_id;
    v_specialty := g.specialty_id;
    if v_specialty is null and v_specialty_count=1 then
      select id into v_specialty from public.specialties where promotion_id=g.promotion_id order by created_at,id limit 1;
    end if;
    if v_specialty is null or not exists(select 1 from public.specialties where id=v_specialty and promotion_id=g.promotion_id) then
      raise notice 'Approved graduate account % needs a valid specialty before student linkage.', g.id;
      continue;
    end if;
    insert into public.students(full_name,registration_number,phone,specialty_id,created_by,promotion_id)
    values(g.full_name,g.registration_number,g.phone,v_specialty,g.user_id,g.promotion_id)
    returning * into v_student;
    update public.graduate_accounts set student_id=v_student.id,specialty_id=v_specialty,updated_at=now() where id=g.id;
  end loop;
end $$;

-- Keep the original four-argument RPC working for older clients, while new clients
-- can choose a specialty explicitly through this overload.
create or replace function public.register_graduate(
  _promotion_id uuid,
  _full_name text,
  _registration_number text,
  _phone text,
  _specialty_id uuid
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
  insert into public.graduate_accounts(user_id,promotion_id,full_name,registration_number,phone,specialty_id)
  values(auth.uid(),_promotion_id,btrim(_full_name),btrim(_registration_number),nullif(btrim(_phone),''),v_specialty)
  on conflict (user_id) do update set
    promotion_id=excluded.promotion_id,
    full_name=excluded.full_name,
    registration_number=excluded.registration_number,
    phone=excluded.phone,
    specialty_id=coalesce(excluded.specialty_id, public.graduate_accounts.specialty_id),
    updated_at=now()
  returning * into v;
  if v.promotion_id <> _promotion_id then raise exception 'ACCOUNT_PROMOTION_MISMATCH'; end if;
  return v;
end $$;
revoke all on function public.register_graduate(uuid,text,text,text,uuid) from public, anon;
grant execute on function public.register_graduate(uuid,text,text,text,uuid) to authenticated;

create or replace function public.guard_graduate_subscription_insert()
returns trigger language plpgsql security definer set search_path=public as $$
declare g public.graduate_accounts;
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
  if new.bank_id is not null and not exists(select 1 from public.payment_banks where id=new.bank_id and promotion_id=new.promotion_id and is_active) then
    raise exception 'PAYMENT_BANK_UNAVAILABLE';
  end if;
  return new;
end $$;
drop trigger if exists guard_graduate_subscription_insert on public.subscription_requests;
create trigger guard_graduate_subscription_insert before insert on public.subscription_requests
for each row execute function public.guard_graduate_subscription_insert();

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
    if g.membership_status='active' or exists(select 1 from public.subscription_requests where account_id=g.id and status='approved' and id<>v.id) then
      raise exception 'SUBSCRIPTION_ALREADY_APPROVED';
    end if;
    select count(*) into v_spec_count from public.specialties where promotion_id=v.promotion_id;
    select id into v_spec from public.specialties where promotion_id=v.promotion_id order by created_at,id limit 1;
    if v_spec_count > 1 then
      if g.specialty_id is null or not exists(select 1 from public.specialties where id=g.specialty_id and promotion_id=g.promotion_id) then raise exception 'SPECIALTY_REQUIRED'; end if;
      v_spec := g.specialty_id;
    elsif v_spec_count = 1 then
      v_spec := coalesce(g.specialty_id,v_spec);
    else
      raise exception 'SPECIALTY_REQUIRED';
    end if;
    select * into s from public.students
      where promotion_id=g.promotion_id and upper(btrim(registration_number))=upper(btrim(g.registration_number))
      limit 1 for update;
    if found then
      if s.specialty_id <> v_spec then raise exception 'STUDENT_SPECIALTY_MISMATCH'; end if;
    else
      insert into public.students(full_name,registration_number,phone,specialty_id,created_by,promotion_id)
      values(g.full_name,g.registration_number,g.phone,v_spec,auth.uid(),g.promotion_id)
      returning * into s;
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

create or replace function public.platform_list_promotion_staff(_promotion_id uuid)
returns table(id uuid,user_id uuid,email text,full_name text,role text,is_active boolean,created_at timestamptz)
language plpgsql security definer set search_path=public as $$
begin
  if not (public.is_platform_admin() or exists(select 1 from public.admins a where a.user_id=auth.uid() and a.is_active and a.role='super_admin' and a.promotion_id=_promotion_id)) then raise exception 'FORBIDDEN'; end if;
  return query
    select ps.id,ps.user_id,u.email::text,
      coalesce(nullif(u.raw_user_meta_data->>'full_name',''),nullif(u.raw_user_meta_data->>'name',''),u.email)::text,
      ps.role,ps.is_active,ps.created_at
    from public.promotion_staff ps join auth.users u on u.id=ps.user_id
    where ps.promotion_id=_promotion_id and ps.role in ('finance','night_event')
    order by ps.is_active desc,ps.created_at desc;
end $$;
revoke all on function public.platform_list_promotion_staff(uuid) from public, anon;
grant execute on function public.platform_list_promotion_staff(uuid) to authenticated, service_role;

create or replace function public.platform_update_promotion_staff(_promotion_id uuid,_user_id uuid,_current_role text,_new_role text)
returns void language plpgsql security definer set search_path=public as $$
begin
  if not (public.is_platform_admin() or exists(select 1 from public.admins a where a.user_id=auth.uid() and a.is_active and a.role='super_admin' and a.promotion_id=_promotion_id)) then raise exception 'FORBIDDEN'; end if;
  if _current_role not in ('finance','night_event') or _new_role not in ('finance','night_event') then raise exception 'INVALID_STAFF_ROLE'; end if;
  if not exists(select 1 from public.promotion_staff where promotion_id=_promotion_id and user_id=_user_id and role=_current_role and is_active) then raise exception 'STAFF_NOT_FOUND'; end if;
  if _current_role <> _new_role then
    update public.promotion_staff set is_active=false where promotion_id=_promotion_id and user_id=_user_id and role=_current_role;
    insert into public.promotion_staff(promotion_id,user_id,role,is_active,created_by)
    values(_promotion_id,_user_id,_new_role,true,auth.uid())
    on conflict(promotion_id,user_id,role) do update set is_active=true;
  end if;
end $$;
revoke all on function public.platform_update_promotion_staff(uuid,uuid,text,text) from public, anon;
grant execute on function public.platform_update_promotion_staff(uuid,uuid,text,text) to authenticated, service_role;

create or replace function public.platform_remove_promotion_staff(_promotion_id uuid,_user_id uuid,_role text)
returns void language plpgsql security definer set search_path=public as $$
begin
  if not (public.is_platform_admin() or exists(select 1 from public.admins a where a.user_id=auth.uid() and a.is_active and a.role='super_admin' and a.promotion_id=_promotion_id)) then raise exception 'FORBIDDEN'; end if;
  if _role not in ('finance','night_event') then raise exception 'INVALID_STAFF_ROLE'; end if;
  update public.promotion_staff set is_active=false where promotion_id=_promotion_id and user_id=_user_id and role=_role and is_active;
  if not found then raise exception 'STAFF_NOT_FOUND'; end if;
end $$;
revoke all on function public.platform_remove_promotion_staff(uuid,uuid,text) from public, anon;
grant execute on function public.platform_remove_promotion_staff(uuid,uuid,text) to authenticated, service_role;

commit;
