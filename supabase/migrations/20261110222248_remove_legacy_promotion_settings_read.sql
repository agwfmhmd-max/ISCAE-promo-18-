begin;

drop policy if exists "promotion readable by everyone" on public.promotion_settings;

commit;
