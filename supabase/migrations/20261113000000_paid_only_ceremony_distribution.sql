begin;

-- Both ceremony types use the approved subscription set as their only
-- distribution audience. Graduation ceremonies keep card_type_id/colors;
-- night ceremonies always create untyped Scan-card allocations.
create or replace function public.redistribute_ceremony_cards(_ceremony_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  cer public.ceremonies;
  rec public.ceremony_card_types;
  n integer;
  base integer;
  rem integer;
  types_sum integer;
begin
  select * into cer from public.ceremonies where id = _ceremony_id;
  if cer.id is null then raise exception 'CEREMONY_NOT_FOUND'; end if;
  if not public.can_manage_promotion(cer.promotion_id) then raise exception 'FORBIDDEN'; end if;

  -- A student is eligible only when the subscription request was approved.
  select count(*) into n
  from public.students st
  where st.promotion_id = cer.promotion_id
    and exists (
      select 1
      from public.graduate_accounts g
      join public.subscription_requests r
        on r.account_id = g.id
       and r.promotion_id = g.promotion_id
       and r.status = 'approved'
      where g.promotion_id = st.promotion_id
        and (g.student_id = st.id
          or upper(btrim(g.registration_number)) = upper(btrim(st.registration_number)))
    );

  -- A redistribution invalidates previously issued Scan tokens for this
  -- ceremony. They must be issued again from the resulting paid-only set.
  if cer.type = 'night' then
    delete from public.night_event_cards
    where ceremony_id = _ceremony_id and promotion_id = cer.promotion_id;
  end if;
  delete from public.student_ceremony_cards
  where ceremony_id = _ceremony_id and promotion_id = cer.promotion_id;

  if n = 0 then
    update public.ceremonies
       set updated_at = now()
     where id = _ceremony_id and promotion_id = cer.promotion_id;
    return jsonb_build_object('students', 0, 'distributed', 0, 'paid_only', true);
  end if;

  if cer.type = 'graduation' then
    select coalesce(sum(total_cards), 0) into types_sum
    from public.ceremony_card_types
    where ceremony_id = _ceremony_id and promotion_id = cer.promotion_id;
    if types_sum <> coalesce(cer.total_cards, 0) then
      raise exception 'CARD_TOTALS_MISMATCH: % <> %', types_sum, cer.total_cards;
    end if;

    for rec in
      select * from public.ceremony_card_types
      where ceremony_id = _ceremony_id and promotion_id = cer.promotion_id
      order by created_at, id
    loop
      base := rec.total_cards / n;
      rem := rec.total_cards % n;
      insert into public.student_ceremony_cards
        (student_id, ceremony_id, card_type_id, quantity, promotion_id)
      select paid.id, _ceremony_id, rec.id,
             base + case when paid.rn <= rem then 1 else 0 end,
             cer.promotion_id
      from (
        select st.id,
               row_number() over (
                 order by st.payment_order_index nulls last, st.order_index, st.id
               ) rn
        from public.students st
        where st.promotion_id = cer.promotion_id
          and exists (
            select 1
            from public.graduate_accounts g
            join public.subscription_requests r
              on r.account_id = g.id
             and r.promotion_id = g.promotion_id
             and r.status = 'approved'
            where g.promotion_id = st.promotion_id
              and (g.student_id = st.id
                or upper(btrim(g.registration_number)) = upper(btrim(st.registration_number)))
          )
      ) paid
      where base + case when paid.rn <= rem then 1 else 0 end > 0;
    end loop;
  else
    -- Night events have no card types or colors: every allocation is an
    -- untyped card that can later receive a secure Scan token.
    base := cer.total_cards / n;
    rem := cer.total_cards % n;
    insert into public.student_ceremony_cards
      (student_id, ceremony_id, card_type_id, quantity, promotion_id)
    select paid.id, _ceremony_id, null,
           base + case when paid.rn <= rem then 1 else 0 end,
           cer.promotion_id
    from (
      select st.id, st.promotion_id,
             row_number() over (
               order by st.payment_order_index nulls last, st.order_index, st.id
             ) rn
      from public.students st
      where st.promotion_id = cer.promotion_id
        and exists (
          select 1
          from public.graduate_accounts g
          join public.subscription_requests r
            on r.account_id = g.id
           and r.promotion_id = g.promotion_id
           and r.status = 'approved'
          where g.promotion_id = st.promotion_id
            and (g.student_id = st.id
              or upper(btrim(g.registration_number)) = upper(btrim(st.registration_number)))
        )
    ) paid
    where base + case when paid.rn <= rem then 1 else 0 end > 0;
  end if;

  update public.ceremonies
     set updated_at = now()
   where id = _ceremony_id and promotion_id = cer.promotion_id;
  return jsonb_build_object(
    'students', n,
    'distributed', (select coalesce(sum(quantity), 0)
                    from public.student_ceremony_cards
                    where ceremony_id = _ceremony_id
                      and promotion_id = cer.promotion_id),
    'paid_only', true,
    'card_mode', case when cer.type = 'night' then 'scan' else 'colored' end
  );
end;
$$;

revoke all on function public.redistribute_ceremony_cards(uuid) from public, anon;
grant execute on function public.redistribute_ceremony_cards(uuid) to authenticated, service_role;

commit;
