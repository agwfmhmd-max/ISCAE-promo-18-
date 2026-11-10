begin;

-- The deployed mask was still I2#### (the earlier correction matched I2#567
-- only). ISCAE 18 uses numeric seven-digit registration numbers.
update public.promotions
set registration_mask='#######', updated_at=now()
where id='f07461b7-91e5-47db-aa07-37cffddbd36b'::uuid
  and number=18
  and graduate_roster_uploaded=false
  and registration_mask in ('I2#567','I2####');

commit;
