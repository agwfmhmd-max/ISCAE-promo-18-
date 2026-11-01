# Developer: Mohamed Dah Agove

## PROMO MR national platform

`index.html` is the bilingual Mauritanian national homepage. It lists only entries deliberately published by the platform administrator through the `get_public_promotions()` Supabase RPC. Promotion requests are prepared locally as a structured WhatsApp message to the site's existing MDA number; this page does not save request form data.

The intended official host is `promo-mr.vercel.app`. Configure the Vercel project root directory as `central-platform`. The `/` route serves this homepage. `/promo/:slug` rewrites to the existing application with the same short slug as the `promo` query parameter, while `/site/*` and `/api/*` continue to proxy to the existing production application. Both `/promo/feg-4` and `/site/index.html?promo=feg-promo-4` select the same tenant.

The national host must be assigned to this Vercel project before claiming it as official; on 2026-11-01 it was observed redirecting to `iscae-promo-18.vercel.app`. Reassign only `promo-mr.vercel.app` and preserve the separate historic tenant domains `iscae-promo-18.vercel.app`, `iscae-promo-19.vercel.app`, and `iscae-promo-20.vercel.app`. The previous temporary host `promotion-snowy.vercel.app` returned HTTP 404 when checked on 2026-11-01.

`TENANT_ROOT_DOMAIN` is optional and is required only when automatically provisioning custom tenant subdomains such as `feg-promo-4.example.org`; the wildcard/root domain must already be configured on Vercel. Do not attempt to claim arbitrary `<slug>.vercel.app` hostnames. Without a configured custom root, new non-ISCAE promotions use `promo-mr.vercel.app/promo/<institution>-<batch>` and the equivalent `/site/index.html?promo=<full-slug>` route. Existing ISCAE domains remain separate.

The central proxy has no Supabase secrets. The application and token endpoints continue to run on the existing ISCAE production deployment, so Supabase server credentials stay there. The main-page anonymous client calls only the narrow `get_public_promotions()` RPC.

The Mauritanian flag asset is sourced from [Wikimedia Commons: Flag of Mauritania.svg](https://commons.wikimedia.org/wiki/File:Flag_of_Mauritania.svg). Commons states the artwork's public-domain status and notes that official insignia may be subject to independent restrictions; it is used only as a small national identifier, not as the platform logo.
