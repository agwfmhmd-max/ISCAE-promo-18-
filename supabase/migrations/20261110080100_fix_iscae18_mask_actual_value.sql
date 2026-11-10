begin;

-- The row for promotion 18 still had the fallback I##### mask, so prior
-- corrections guarded by the old expected values did not update it. Apply the
-- screenshot's seven-digit numeric format to this promotion only.
update public.promotions
set registration_mask='#######', updated_at=now()
where id='f07461b7-91e5-47db-aa07-37cffddbd36b'::uuid
  and number=18
  and graduate_roster_uploaded=false;

commit;
