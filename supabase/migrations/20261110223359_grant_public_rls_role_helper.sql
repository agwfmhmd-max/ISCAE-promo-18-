begin;

-- Public student reads evaluate this SECURITY DEFINER helper in RLS to reveal
-- only paid graduates and public role-safe rows. It returns a boolean and does
-- not expose staff records; the caller still receives only rows permitted by RLS.
grant execute on function public.mp_feature_admin(uuid, text[]) to anon, authenticated;

commit;
