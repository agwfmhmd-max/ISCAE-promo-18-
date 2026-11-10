begin;

-- Legacy approvals may predate student_id linking. Match only inside the same promotion and normalized registration number.
update public.graduate_accounts g
set student_id=s.id,
    specialty_id=coalesce(g.specialty_id,s.specialty_id),
    full_name=coalesce(nullif(g.full_name,''),s.full_name),
    full_name_fr=coalesce(nullif(g.full_name_fr,''),s.full_name_fr),
    updated_at=now()
from public.students s
where g.student_id is null
  and exists(select 1 from public.subscription_requests r where r.account_id=g.id and r.promotion_id=g.promotion_id and r.status='approved')
  and s.promotion_id=g.promotion_id
  and upper(btrim(s.registration_number))=upper(btrim(g.registration_number));

with paid as (
  select distinct on (g.student_id)
    g.student_id,
    row_number() over (
      partition by g.promotion_id,g.specialty_id
      order by coalesce(r.reviewed_at,r.created_at),r.id
    )::integer as rn
  from public.graduate_accounts g
  join public.subscription_requests r on r.account_id=g.id and r.promotion_id=g.promotion_id and r.status='approved'
  where g.student_id is not null
  order by g.student_id,coalesce(r.reviewed_at,r.created_at),r.id
)
update public.students s
set payment_order_index=paid.rn
from paid
where s.id=paid.student_id;

commit;
