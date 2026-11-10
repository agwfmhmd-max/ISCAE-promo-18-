begin;

create or replace function public.can_view_graduate_financial_report(_promotion_id uuid)
returns boolean language sql stable security definer set search_path=public as $$
  select public.mp_feature_admin(_promotion_id,array['finance','super_admin'])
    or exists(select 1 from public.graduate_accounts g where g.user_id=auth.uid() and g.promotion_id=_promotion_id);
$$;
revoke all on function public.can_view_graduate_financial_report(uuid) from public,anon;
grant execute on function public.can_view_graduate_financial_report(uuid) to authenticated;

-- A published report is visible only to graduates of that promotion and its
-- authorized financial/head staff, not to every authenticated account on site.
drop policy if exists financial_reports_scope on public.promotion_financial_reports;
create policy financial_reports_scope on public.promotion_financial_reports for select to authenticated
using (
  public.can_view_graduate_financial_report(promotion_id)
  and (status='published' or public.mp_feature_admin(promotion_id,array['finance','super_admin']))
);

drop policy if exists financial_entries_scope on public.financial_report_entries;
create policy financial_entries_scope on public.financial_report_entries for select to authenticated
using (
  exists(select 1 from public.promotion_financial_reports r
    where r.id=financial_report_entries.report_id
      and public.can_view_graduate_financial_report(r.promotion_id)
      and (r.status='published' or public.mp_feature_admin(r.promotion_id,array['finance','super_admin'])))
);

drop policy if exists graduate_financial_invoice_select on storage.objects;
create policy graduate_financial_invoice_select on storage.objects for select to authenticated using (
  bucket_id='graduate-private'
  and name ~ '^financial-reports/[0-9a-f-]{36}/[0-9a-f-]{36}/[A-Za-z0-9._-]+\.(png|jpe?g|webp)$'
  and exists(select 1 from public.promotion_financial_reports r
    where r.id::text=split_part(name,'/',3) and r.promotion_id::text=split_part(name,'/',2)
      and public.can_view_graduate_financial_report(r.promotion_id)
      and (r.status='published' or public.mp_feature_admin(r.promotion_id,array['finance','super_admin'])))
);

-- Trigger-only function; do not expose it as a callable PostgREST RPC.
revoke all on function public.guard_financial_report_invoice_path() from public,anon,authenticated;

commit;
