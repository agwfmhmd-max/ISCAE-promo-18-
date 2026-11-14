begin;

-- Keep one canonical RPC signature. The old three-argument overload made
-- Supabase unable to choose between it and the four-argument function whose
-- last argument has a default value.
drop function if exists public.update_night_event_details(uuid, text, text);
alter function public.update_night_event_details(uuid, text, text, timestamptz) set search_path = public, extensions;

commit;
