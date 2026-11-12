begin;

-- Notify the finance staff immediately when a new payment request is created.
create or replace function public.notify_finance_on_subscription_request()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text;
  v_reg text;
  v_title text;
  v_body text;
begin
  select coalesce(ga.full_name, 'خريج'), coalesce(ga.registration_number, '')
    into v_name, v_reg
  from public.graduate_accounts ga
  where ga.id = new.account_id;

  v_title := 'طلب اشتراك مالي جديد';
  v_body := 'أرسل ' || v_name || ' طلب اشتراك جديد' ||
            case when v_reg <> '' then ' — رقم التسجيل ' || v_reg else '' end ||
            '. يرجى التحقق من إثبات الدفع.';

  insert into public.graduate_notifications (promotion_id, user_id, title, body, url)
  select new.promotion_id, recipients.user_id, v_title, v_body, '?graduate=1'
  from (
    select ps.user_id
    from public.promotion_staff ps
    where ps.promotion_id = new.promotion_id
      and ps.role = 'finance'
      and ps.is_active
    union
    select a.user_id
    from public.admins a
    where a.promotion_id = new.promotion_id
      and a.role = 'super_admin'
      and coalesce(a.is_active, true)
  ) recipients
  where recipients.user_id is not null;

  return new;
end;
$$;

drop trigger if exists subscription_request_finance_notification on public.subscription_requests;
create trigger subscription_request_finance_notification
after insert on public.subscription_requests
for each row execute function public.notify_finance_on_subscription_request();

revoke all on function public.notify_finance_on_subscription_request() from public, anon, authenticated;

-- Keep the card distribution RPC tenant-safe and deterministic.
create or replace function public.redistribute_ceremony_cards(_ceremony_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
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
  select count(*) into n from public.students where promotion_id = cer.promotion_id;
  delete from public.student_ceremony_cards where ceremony_id = _ceremony_id and promotion_id = cer.promotion_id;
  if n = 0 then
    update public.ceremonies set updated_at = now() where id = _ceremony_id and promotion_id = cer.promotion_id;
    return jsonb_build_object('students', 0, 'distributed', 0);
  end if;
  if cer.type = 'graduation' then
    select coalesce(sum(total_cards), 0) into types_sum
      from public.ceremony_card_types
      where ceremony_id = _ceremony_id and promotion_id = cer.promotion_id;
    if types_sum <> coalesce(cer.total_cards, 0) then
      raise exception 'CARD_TOTALS_MISMATCH: % <> %', types_sum, cer.total_cards;
    end if;
    for rec in select * from public.ceremony_card_types
      where ceremony_id = _ceremony_id and promotion_id = cer.promotion_id
      order by created_at, id loop
      base := rec.total_cards / n;
      rem := rec.total_cards % n;
      insert into public.student_ceremony_cards (student_id, ceremony_id, card_type_id, quantity, promotion_id)
      select ordered.id, _ceremony_id, rec.id,
             base + case when ordered.rn <= rem then 1 else 0 end,
             cer.promotion_id
      from (
        select st.id, row_number() over(order by st.order_index, st.id) rn
        from public.students st
        where st.promotion_id = cer.promotion_id
      ) ordered
      where base + case when ordered.rn <= rem then 1 else 0 end > 0;
    end loop;
  else
    base := cer.total_cards / n;
    rem := cer.total_cards % n;
    insert into public.student_ceremony_cards (student_id, ceremony_id, card_type_id, quantity, promotion_id)
    select ordered.id, _ceremony_id, null,
           base + case when ordered.rn <= rem then 1 else 0 end,
           cer.promotion_id
    from (
      select st.id, row_number() over(order by st.order_index, st.id) rn
      from public.students st
      where st.promotion_id = cer.promotion_id
    ) ordered
    where base + case when ordered.rn <= rem then 1 else 0 end > 0;
  end if;
  update public.ceremonies set updated_at = now() where id = _ceremony_id and promotion_id = cer.promotion_id;
  return jsonb_build_object('students', n, 'distributed', (select coalesce(sum(quantity), 0) from public.student_ceremony_cards where ceremony_id = _ceremony_id and promotion_id = cer.promotion_id));
end;
$$;

revoke all on function public.redistribute_ceremony_cards(uuid) from public, anon;
grant execute on function public.redistribute_ceremony_cards(uuid) to authenticated, service_role;

commit;
