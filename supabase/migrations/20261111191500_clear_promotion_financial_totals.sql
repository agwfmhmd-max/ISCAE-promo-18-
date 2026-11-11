begin;

-- promotion_financial_totals is a derived view, so its contents cannot be
-- deleted directly. This owner-only operation removes the source rows for a
-- selected promotion and rebuilds payment state/ranks consistently.
create or replace function public.supabase_clear_promotion_financial_totals(_promotion_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_requests integer;
  v_entries integer;
  v_accounts integer;
begin
  if _promotion_id is null then raise exception 'PROMOTION_ID_REQUIRED'; end if;
  if not exists (select 1 from public.promotions where id = _promotion_id) then
    raise exception 'PROMOTION_NOT_FOUND';
  end if;

  delete from public.financial_report_entries where promotion_id = _promotion_id;
  get diagnostics v_entries = row_count;

  delete from public.subscription_requests where promotion_id = _promotion_id;
  get diagnostics v_requests = row_count;

  update public.graduate_accounts
  set membership_status = 'pending', updated_at = now()
  where promotion_id = _promotion_id and membership_status = 'active';
  get diagnostics v_accounts = row_count;

  update public.students
  set payment_order_index = null
  where promotion_id = _promotion_id and payment_order_index is not null;

  return jsonb_build_object(
    'promotion_id', _promotion_id,
    'deleted_subscription_requests', v_requests,
    'deleted_financial_entries', v_entries,
    'reset_active_accounts', v_accounts,
    'totals_are_now_zero', true
  );
end;
$$;

revoke all on function public.supabase_clear_promotion_financial_totals(uuid) from public, anon, authenticated;

commit;
