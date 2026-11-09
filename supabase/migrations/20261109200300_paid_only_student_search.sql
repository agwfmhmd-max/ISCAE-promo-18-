begin;

-- The original search_student RPC is SECURITY DEFINER, so enforce approved
-- subscription status inside the function rather than relying on table RLS.
create or replace function public.search_student(_reg text)
returns table(full_name text,registration_number text,phone text,sash_name text,specialty_name text,order_index integer,category text)
language sql stable security definer set search_path=public as $$
  select st.full_name,st.registration_number,st.phone,st.sash_name,sp.name,st.order_index,public.student_category(st.order_index)
  from public.students st
  join public.specialties sp on sp.id=st.specialty_id and sp.promotion_id=st.promotion_id
  where lower(trim(st.registration_number))=lower(trim(_reg))
    and public.mp_can_read(st.promotion_id)
    and exists(
      select 1 from public.graduate_accounts g
      join public.subscription_requests r on r.account_id=g.id and r.promotion_id=g.promotion_id
      where g.student_id=st.id and g.promotion_id=st.promotion_id and r.status='approved'
    )
  order by st.id
  limit 1;
$$;
revoke all on function public.search_student(text) from public;
grant execute on function public.search_student(text) to anon,authenticated;

commit;
