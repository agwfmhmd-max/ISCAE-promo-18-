begin;

-- Supabase commonly installs pgcrypto in the extensions schema. Keep it available
-- for older graduate functions that were created with an unqualified digest() call.
create extension if not exists pgcrypto;

-- Older cards were created before token_value existed. Their raw token cannot be
-- recovered, so issue a new raw token once and store the matching md5 hash.
alter table public.night_event_cards add column if not exists token_value text;
create unique index if not exists night_event_cards_token_value_uniq
  on public.night_event_cards(token_value) where token_value is not null;
do $$
declare
  row_card record;
  tok text;
begin
  for row_card in select id from public.night_event_cards where token_value is null loop
    tok = replace(gen_random_uuid()::text, ''-'', ) || replace(gen_random_uuid()::text, -, );
    update public.night_event_cards set token_value = tok, token_hash = md5(tok), updated_at = now() where id = row_card.id;
  end loop;
end $$;

-- Keep redemption independent from digest/search_path differences. New and repaired
-- cards use md5(token), matching the shareable QR cards returned to graduates.
create or replace function public.redeem_night_event_card(_token text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v public.night_event_cards;
begin
  if auth.uid() is null then raise exception ''AUTH_REQUIRED''; end if;
  select * into v from public.night_event_cards where token_hash=md5(trim(_token)) for update;
  if not found then return jsonb_build_object(''ok'',false,''status'',''invalid''); end if;
  if not exists(select 1 from public.promotions p where p.id=v.promotion_id and p.night_event_enabled) then raise exception ''NIGHT_EVENT_DISABLED''; end if;
  if not public.mp_feature_admin(v.promotion_id,array[''night_event'',''super_admin'']) then raise exception ''FORBIDDEN''; end if;
  insert into public.night_event_card_scans(card_id,promotion_id,scanned_by,was_already_used,metadata)
    values(v.id,v.promotion_id,auth.uid(),v.used_at is not null,jsonb_build_object(''first_used_at'',v.used_at));
  if v.used_at is not null then return jsonb_build_object(''ok'',false,''status'',''used'',''used_at'',v.used_at,''beneficiary_name'',v.beneficiary_name); end if;
  update public.night_event_cards set used_at=now(),used_by=auth.uid(),updated_at=now() where id=v.id returning * into v;
  return jsonb_build_object(''ok'',true,''status'',''accepted'',''card_id'',v.id,''owner_student_id'',v.owner_student_id,''beneficiary_name'',v.beneficiary_name,''used_at'',v.used_at);
end;
$$;
revoke all on function public.redeem_night_event_card(text) from public,anon;
grant execute on function public.redeem_night_event_card(text) to authenticated,service_role;

commit;
