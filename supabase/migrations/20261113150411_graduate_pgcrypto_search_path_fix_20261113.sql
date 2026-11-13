begin;

-- Supabase installs pgcrypto in the extensions schema. These QR/card functions
-- call digest() and must resolve that schema at runtime.
create extension if not exists pgcrypto;

alter function public.get_my_night_event_cards(uuid) set search_path = public, extensions;
alter function public.issue_night_event_cards(uuid) set search_path = public, extensions;
alter function public.redeem_night_event_card(text) set search_path = public, extensions;
alter function public.reissue_night_event_cards(uuid) set search_path = public, extensions;

commit;
