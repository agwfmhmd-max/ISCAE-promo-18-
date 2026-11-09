begin;

drop policy if exists subscription_settings_scope on public.subscription_settings;
create policy subscription_settings_scope on public.subscription_settings
for all to authenticated
using (public.mp_feature_admin(promotion_id,array['super_admin']))
with check (public.mp_feature_admin(promotion_id,array['super_admin']));

drop policy if exists payment_banks_scope on public.payment_banks;
create policy payment_banks_scope on public.payment_banks
for all to authenticated
using (public.mp_feature_admin(promotion_id,array['super_admin']))
with check (public.mp_feature_admin(promotion_id,array['super_admin']));

commit;
