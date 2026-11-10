begin;

alter table public.students add column if not exists payment_order_index integer;
create index if not exists students_payment_order_idx on public.students(promotion_id,specialty_id,payment_order_index);
create unique index if not exists students_specialty_payment_order_uniq
  on public.students(specialty_id,payment_order_index)
  where payment_order_index is not null;

-- Backfill only approved subscriptions. Import order is intentionally ignored.
with paid as (
  select distinct on (g.student_id)
    g.student_id,
    row_number() over (
      partition by g.promotion_id,g.specialty_id
      order by coalesce(r.reviewed_at,r.created_at),r.id
    )::integer as rn
  from public.graduate_accounts g
  join public.subscription_requests r
    on r.account_id=g.id and r.promotion_id=g.promotion_id and r.status='approved'
  where g.student_id is not null
  order by g.student_id,coalesce(r.reviewed_at,r.created_at),r.id
)
update public.students s
set payment_order_index=paid.rn
from paid
where s.id=paid.student_id and s.payment_order_index is null;

create or replace function public.review_subscription_request(_request_id uuid,_status text,_reason text default null)
returns public.subscription_requests language plpgsql security definer set search_path=public as $$
declare
  v public.subscription_requests; g public.graduate_accounts; s public.students;
  v_spec uuid; v_spec_count integer; v_paid_order integer;
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
      v_spec_count:=1;
    end if;
    if v_spec_count>1 then
      if g.specialty_id is null or not exists(select 1 from public.specialties where id=g.specialty_id and promotion_id=g.promotion_id) then raise exception 'SPECIALTY_REQUIRED'; end if;
      v_spec:=g.specialty_id;
    elsif v_spec_count=1 then v_spec:=coalesce(g.specialty_id,v_spec);
    end if;
    select * into s from public.students where promotion_id=g.promotion_id and upper(btrim(registration_number))=upper(btrim(g.registration_number)) limit 1 for update;
    if found then
      if s.specialty_id<>v_spec then raise exception 'STUDENT_SPECIALTY_MISMATCH'; end if;
      update public.students set full_name=g.full_name,full_name_fr=coalesce(g.full_name_fr,full_name_fr),phone=coalesce(nullif(g.phone,''),phone),certificate_name=coalesce(nullif(g.certificate_name,''),certificate_name),sash_name=coalesce(nullif(g.sash_name,''),sash_name) where id=s.id;
    else
      insert into public.students(full_name,full_name_fr,registration_number,phone,certificate_name,sash_name,specialty_id,created_by,promotion_id)
      values(g.full_name,g.full_name_fr,g.registration_number,g.phone,g.certificate_name,g.sash_name,v_spec,auth.uid(),g.promotion_id) returning * into s;
    end if;
    select coalesce(max(payment_order_index),0)+1 into v_paid_order from public.students where promotion_id=v.promotion_id and specialty_id=v_spec;
    update public.students set payment_order_index=v_paid_order where id=s.id;
    update public.graduate_accounts set membership_status='active',student_id=s.id,specialty_id=v_spec,updated_at=now() where id=g.id;
    update public.subscription_requests set status='approved',rejection_reason=null,reviewed_by=auth.uid(),reviewed_at=now(),updated_at=now() where id=v.id returning * into v;
    insert into public.graduate_notifications(promotion_id,user_id,title,body,url) values(v.promotion_id,g.user_id,'تم قبول الاشتراك','تم قبول طلب اشتراكك وتفعيل عضويتك، وإضافتك إلى قائمة طلاب تخصصك.','?graduate=1');
  else
    update public.subscription_requests set status='rejected',rejection_reason=btrim(_reason),reviewed_by=auth.uid(),reviewed_at=now(),updated_at=now() where id=v.id returning * into v;
    insert into public.graduate_notifications(promotion_id,user_id,title,body,url) values(v.promotion_id,g.user_id,'تم رفض الاشتراك','تم رفض طلب اشتراكك: '||btrim(_reason)||'. يمكنك إعادة التقديم.','?graduate=1');
  end if;
  return v;
end $$;
revoke all on function public.review_subscription_request(uuid,text,text) from public,anon;
grant execute on function public.review_subscription_request(uuid,text,text) to authenticated;

drop function if exists public.search_student(text);
create function public.search_student(_reg text)
returns table(full_name text,full_name_fr text,registration_number text,phone text,sash_name text,specialty_name text,specialty_name_fr text,order_index integer,category text)
language sql stable security definer set search_path=public as $$
  select st.full_name,st.full_name_fr,st.registration_number,st.phone,st.sash_name,sp.name,sp.name_fr,coalesce(st.payment_order_index,st.order_index),public.student_category(coalesce(st.payment_order_index,st.order_index))
  from public.students st
  join public.specialties sp on sp.id=st.specialty_id and sp.promotion_id=st.promotion_id
  where lower(trim(st.registration_number))=lower(trim(_reg)) and public.mp_can_read(st.promotion_id)
    and exists(select 1 from public.graduate_accounts g join public.subscription_requests r on r.account_id=g.id and r.promotion_id=g.promotion_id where g.promotion_id=st.promotion_id and (g.student_id=st.id or upper(btrim(g.registration_number))=upper(btrim(st.registration_number))) and r.status='approved')
  order by st.payment_order_index nulls last,st.id limit 1;
$$;
revoke all on function public.search_student(text) from public;
grant execute on function public.search_student(text) to anon,authenticated;

create or replace function public.ordered_students_for_cards()
returns table(student_id uuid,rn bigint) language sql stable security definer set search_path=public as $$
  with lim as (select coalesce((select cat_a_limit from public.settings where promotion_id=public.current_promotion_id() order by id limit 1),100) a,coalesce((select cat_b_limit from public.settings where promotion_id=public.current_promotion_id() order by id limit 1),100) b,coalesce((select cat_c_limit from public.settings where promotion_id=public.current_promotion_id() order by id limit 1),150) c), ranked as (select st.id,coalesce(st.payment_order_index,st.order_index) effective_order,case when coalesce(st.payment_order_index,st.order_index)<=l.a then 1 when coalesce(st.payment_order_index,st.order_index)<=l.a+l.b then 2 when coalesce(st.payment_order_index,st.order_index)<=l.a+l.b+l.c then 3 else 4 end cat_rank,st.registration_number,coalesce(sp.name,'') spec_name from public.students st left join public.specialties sp on sp.id=st.specialty_id and sp.promotion_id=st.promotion_id cross join lim l where st.promotion_id=public.current_promotion_id() and public.mp_can_read(st.promotion_id)) select id,row_number() over(order by cat_rank,effective_order,spec_name,registration_number) from ranked;
$$;

commit;
