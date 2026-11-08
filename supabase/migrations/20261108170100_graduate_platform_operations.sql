begin;

create or replace function public.review_subscription_request(_request_id uuid, _status text, _reason text default null)
returns public.subscription_requests language plpgsql security definer set search_path=public as $$
declare v public.subscription_requests; g public.graduate_accounts;
begin
  select * into v from public.subscription_requests where id=_request_id for update;
  if not found then raise exception 'REQUEST_NOT_FOUND'; end if;
  if not public.mp_feature_admin(v.promotion_id,array['finance','super_admin']) then raise exception 'FORBIDDEN'; end if;
  if _status not in ('approved','rejected') then raise exception 'INVALID_DECISION'; end if;
  if _status='rejected' and length(btrim(coalesce(_reason,'')))<3 then raise exception 'REJECTION_REASON_REQUIRED'; end if;
  update public.subscription_requests set status=_status,rejection_reason=case when _status='rejected' then btrim(_reason) else null end,reviewed_by=auth.uid(),reviewed_at=now(),updated_at=now() where id=_request_id returning * into v;
  select * into g from public.graduate_accounts where id=v.account_id for update;
  if _status='approved' then
    update public.graduate_accounts set membership_status='active',updated_at=now() where id=g.id;
    insert into public.graduate_notifications(promotion_id,user_id,title,body) values(v.promotion_id,g.user_id,'تم قبول الاشتراك','تم قبول طلب اشتراكك وتفعيل مساحتك الخاصة.');
  else
    insert into public.graduate_notifications(promotion_id,user_id,title,body) values(v.promotion_id,g.user_id,'تم رفض الاشتراك','تم رفض طلب اشتراكك: '||btrim(_reason)||'. يمكنك إعادة التقديم.');
  end if;
  return v;
end $$;
revoke all on function public.review_subscription_request(uuid,text,text) from public;
grant execute on function public.review_subscription_request(uuid,text,text) to authenticated;

create or replace function public.enforce_graduate_memory_limit()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if (select count(*) from public.graduate_memories where account_id=new.account_id and id<>coalesce(new.id,'00000000-0000-0000-0000-000000000000'::uuid)) >= 5 then raise exception 'MEMORY_LIMIT_REACHED'; end if;
  return new;
end $$;
drop trigger if exists graduate_memory_limit on public.graduate_memories;
create trigger graduate_memory_limit before insert or update on public.graduate_memories for each row execute function public.enforce_graduate_memory_limit();

create or replace view public.promotion_financial_totals as
select p.id as promotion_id,
  coalesce((select sum(sr.amount) from public.subscription_requests sr where sr.promotion_id=p.id and sr.status='approved'),0) as confirmed_subscriptions,
  coalesce((select count(*) from public.subscription_requests sr where sr.promotion_id=p.id and sr.status='approved'),0) as confirmed_payers,
  coalesce((select sum(e.amount) from public.financial_report_entries e where e.promotion_id=p.id and e.entry_type='income'),0) as other_income,
  coalesce((select sum(e.amount) from public.financial_report_entries e where e.promotion_id=p.id and e.entry_type='expense'),0) as expenses
from public.promotions p;

create or replace function public.issue_night_event_cards(_ceremony_id uuid)
returns table(card_id uuid, raw_token text, owner_student_id uuid, card_type_id uuid) language plpgsql security definer set search_path=public as $$
declare c public.ceremonies; a record; tok text; cid uuid;
begin
  select * into c from public.ceremonies where id=_ceremony_id;
  if not found or c.type<>'night' then raise exception 'NIGHT_CEREMONY_REQUIRED'; end if;
  if not public.mp_feature_admin(c.promotion_id,array['night_event','super_admin']) then raise exception 'FORBIDDEN'; end if;
  for a in select scc.student_id,scc.card_type_id,scc.quantity from public.student_ceremony_cards scc where scc.ceremony_id=_ceremony_id and scc.promotion_id=c.promotion_id and scc.quantity>0 loop
    for i in 1..a.quantity loop
      tok=encode(gen_random_bytes(24),'hex');
      insert into public.night_event_cards(promotion_id,ceremony_id,card_type_id,owner_student_id,token_hash) values(c.promotion_id,_ceremony_id,a.card_type_id,a.student_id,encode(digest(tok,'sha256'),'hex')) returning id into cid;
      card_id=cid; raw_token=tok; owner_student_id=a.student_id; card_type_id=a.card_type_id; return next;
    end loop;
  end loop;
end $$;
revoke all on function public.issue_night_event_cards(uuid) from public;
grant execute on function public.issue_night_event_cards(uuid) to authenticated;

create policy financial_revisions_scope on public.financial_report_revisions for select to authenticated using (exists(select 1 from public.promotion_financial_reports r where r.id=report_id and public.mp_feature_admin(r.promotion_id,array['super_admin'])));
create policy financial_revisions_manage on public.financial_report_revisions for all to authenticated using (exists(select 1 from public.promotion_financial_reports r where r.id=report_id and public.mp_feature_admin(r.promotion_id,array['super_admin']))) with check (exists(select 1 from public.promotion_financial_reports r where r.id=report_id and public.mp_feature_admin(r.promotion_id,array['super_admin'])));

grant select on public.promotion_financial_totals to authenticated;

commit;
