begin;

alter table public.promotion_financial_reports
  add column if not exists subscription_income numeric(14,2),
  add column if not exists subscription_currency text;

alter table public.financial_report_entries
  add column if not exists invoice_path text;

alter table public.financial_report_entries
  add constraint financial_report_entries_invoice_path_format
  check (invoice_path is null or invoice_path ~ '^financial-reports/[0-9a-f-]{36}/[0-9a-f-]{36}/[A-Za-z0-9._-]+\.(png|jpe?g|webp)$');

create or replace function public.guard_financial_report_invoice_path()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if new.invoice_path is null then return new; end if;
  if new.invoice_path !~ ('^financial-reports/'||new.promotion_id::text||'/'||new.report_id::text||'/[A-Za-z0-9._-]+\.(png|jpe?g|webp)$') then
    raise exception 'INVALID_FINANCIAL_INVOICE_PATH';
  end if;
  if not exists(select 1 from public.promotion_financial_reports r where r.id=new.report_id and r.promotion_id=new.promotion_id and r.status='draft') then
    raise exception 'REPORT_NOT_DRAFT';
  end if;
  return new;
end $$;
drop trigger if exists financial_report_invoice_path_guard on public.financial_report_entries;
create trigger financial_report_invoice_path_guard before insert or update of invoice_path,report_id,promotion_id on public.financial_report_entries for each row execute function public.guard_financial_report_invoice_path();

create or replace function public.publish_promotion_financial_report(_report_id uuid)
returns public.promotion_financial_reports language plpgsql security definer set search_path=public as $$
declare v public.promotion_financial_reports; v_subscription_income numeric(14,2); v_currency text;
begin
  select * into v from public.promotion_financial_reports where id=_report_id for update;
  if not found then raise exception 'REPORT_NOT_FOUND'; end if;
  if not public.mp_feature_admin(v.promotion_id,array['super_admin']) then raise exception 'FORBIDDEN'; end if;
  if v.status<>'draft' then raise exception 'REPORT_NOT_DRAFT'; end if;
  select coalesce(sum(sr.amount),0)::numeric(14,2) into v_subscription_income
  from public.subscription_requests sr where sr.promotion_id=v.promotion_id and sr.status='approved';
  select coalesce(nullif(currency,''),'MRU') into v_currency from public.subscription_settings where promotion_id=v.promotion_id;
  update public.promotion_financial_reports
  set status='published',published_at=now(),published_by=auth.uid(),updated_at=now(),
      subscription_income=v_subscription_income,subscription_currency=coalesce(v_currency,'MRU')
  where id=_report_id returning * into v;
  return v;
end $$;
revoke all on function public.publish_promotion_financial_report(uuid) from public,anon;
grant execute on function public.publish_promotion_financial_report(uuid) to authenticated;

-- Private receipts: managers upload/delete in drafts; authenticated graduates can
-- view the image only after its report is published.
drop policy if exists graduate_financial_invoice_insert on storage.objects;
create policy graduate_financial_invoice_insert on storage.objects for insert to authenticated with check (
  bucket_id='graduate-private'
  and name ~ '^financial-reports/[0-9a-f-]{36}/[0-9a-f-]{36}/[A-Za-z0-9._-]+\.(png|jpe?g|webp)$'
  and exists(select 1 from public.promotion_financial_reports r
    where r.id::text=split_part(name,'/',3) and r.promotion_id::text=split_part(name,'/',2)
      and r.status='draft' and public.mp_feature_admin(r.promotion_id,array['finance','super_admin']))
);
drop policy if exists graduate_financial_invoice_select on storage.objects;
create policy graduate_financial_invoice_select on storage.objects for select to authenticated using (
  bucket_id='graduate-private'
  and name ~ '^financial-reports/[0-9a-f-]{36}/[0-9a-f-]{36}/[A-Za-z0-9._-]+\.(png|jpe?g|webp)$'
  and exists(select 1 from public.promotion_financial_reports r
    where r.id::text=split_part(name,'/',3) and r.promotion_id::text=split_part(name,'/',2)
      and (r.status='published' or public.mp_feature_admin(r.promotion_id,array['finance','super_admin'])) )
);
drop policy if exists graduate_financial_invoice_delete on storage.objects;
create policy graduate_financial_invoice_delete on storage.objects for delete to authenticated using (
  bucket_id='graduate-private'
  and name ~ '^financial-reports/[0-9a-f-]{36}/[0-9a-f-]{36}/[A-Za-z0-9._-]+\.(png|jpe?g|webp)$'
  and exists(select 1 from public.promotion_financial_reports r
    where r.id::text=split_part(name,'/',3) and r.promotion_id::text=split_part(name,'/',2)
      and r.status='draft' and public.mp_feature_admin(r.promotion_id,array['finance','super_admin']))
);

commit;
