begin;

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
    perform 1 from public.promotions where id=v.promotion_id for update;
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
