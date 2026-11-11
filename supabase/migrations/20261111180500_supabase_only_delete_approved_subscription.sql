begin;

-- Deliberately not granted to anon/authenticated. This is callable from the
-- Supabase SQL Editor (postgres/service-role context) only, not from the site.
create or replace function public.supabase_delete_approved_subscription(_request_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request public.subscription_requests;
  v_approved_left integer;
begin
  select * into v_request
  from public.subscription_requests
  where id = _request_id
  for update;

  if not found then raise exception 'SUBSCRIPTION_REQUEST_NOT_FOUND'; end if;
  if v_request.status <> 'approved' then raise exception 'ONLY_APPROVED_REQUESTS_CAN_BE_DELETED'; end if;

  delete from public.subscription_requests where id = v_request.id;

  select count(*) into v_approved_left
  from public.subscription_requests
  where account_id = v_request.account_id and promotion_id = v_request.promotion_id and status = 'approved';

  if v_approved_left = 0 then
    update public.graduate_accounts
    set membership_status = 'pending', updated_at = now()
    where id = v_request.account_id and promotion_id = v_request.promotion_id;
  end if;

  perform public.rebuild_promotion_payment_order(v_request.promotion_id);

  return jsonb_build_object(
    'deleted_request_id', v_request.id,
    'promotion_id', v_request.promotion_id,
    'account_id', v_request.account_id,
    'approved_requests_remaining_for_account', v_approved_left
  );
end;
$$;

revoke all on function public.supabase_delete_approved_subscription(uuid) from public, anon, authenticated;

commit;
