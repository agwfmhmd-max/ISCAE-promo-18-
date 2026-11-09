begin;
drop index if exists public.graduate_accounts_promotion_user_uidx;
drop function if exists public.register_graduate(uuid,text,text,text,uuid);
drop function if exists public.register_graduate(uuid,text,text,text,uuid,text,text);
create or replace function public.registration_mask_regex(_mask text)
returns text language sql immutable set search_path=pg_catalog as $func$
  select '^' || regexp_replace(regexp_replace(upper(btrim(coalesce(_mask,''))), '([\\.\\+\\?\\(\\)\\[\\]\\{\\}\\|\\^\\$])', '\\\\1', 'g'), '#', '[0-9]', 'g') || '$';
$func$;
commit;
