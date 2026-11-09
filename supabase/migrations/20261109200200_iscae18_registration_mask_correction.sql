begin;

-- The ISCAE 18th-promotion form showed INVALID_REGISTRATION_NUMBER because
-- its configured mask (I2#567) did not match seven-digit numeric registrations.
-- Keep the legacy self-entry flow enabled until a bilingual roster is uploaded.
update public.promotions
set registration_mask='#######', updated_at=now()
where id='f07461b7-91e5-47db-aa07-37cffddbd36b'::uuid
  and number=18
  and registration_mask='I2#567'
  and graduate_roster_uploaded=false;

commit;
