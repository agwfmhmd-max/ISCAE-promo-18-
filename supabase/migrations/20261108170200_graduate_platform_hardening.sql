begin;

alter view public.promotion_financial_totals set (security_invoker = true);
revoke execute on function public.mp_feature_admin(uuid,text[]) from anon;
revoke execute on function public.register_graduate(uuid,text,text,text) from anon;
revoke execute on function public.redeem_night_event_card(text) from anon;
revoke execute on function public.review_subscription_request(uuid,text,text) from anon;
revoke execute on function public.issue_night_event_cards(uuid) from anon;
revoke execute on function public.enforce_graduate_memory_limit() from public, anon, authenticated;

create index if not exists graduate_accounts_student_idx on public.graduate_accounts(student_id);
create index if not exists subscription_requests_account_idx on public.subscription_requests(account_id);
create index if not exists subscription_requests_bank_idx on public.subscription_requests(bank_id);
create index if not exists promotion_staff_promotion_idx on public.promotion_staff(promotion_id);
create index if not exists promotion_staff_user_idx on public.promotion_staff(user_id);
create index if not exists financial_report_entries_report_idx on public.financial_report_entries(report_id);
create index if not exists financial_report_entries_promotion_idx on public.financial_report_entries(promotion_id);
create index if not exists financial_report_revisions_report_idx on public.financial_report_revisions(report_id);
create index if not exists night_event_cards_ceremony_idx on public.night_event_cards(ceremony_id);
create index if not exists night_event_card_scans_card_idx on public.night_event_card_scans(card_id);
create index if not exists graduate_notifications_user_idx on public.graduate_notifications(user_id);
create index if not exists graduate_notifications_promotion_idx on public.graduate_notifications(promotion_id);

commit;
