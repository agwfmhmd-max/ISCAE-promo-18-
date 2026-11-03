# Developer: Mohamed Dah Agove

## PROMO MR central directory

`index.html` is a bilingual directory for independent graduation-batch pages in Mauritania. It lists only entries deliberately published through the `get_public_promotions()` Supabase RPC. Promotion requests are prepared locally as a structured WhatsApp message to the site's existing MDA number; this page does not save request form data. PROMO MR is an independent directory and is not a government service.

The intended official host is `promo-mr.vercel.app`. Configure the Vercel project root directory as `central-platform`. The `/` route serves this homepage. `/promo/:slug` rewrites to the existing application with the same short slug as the `promo` query parameter, while `/site/*` and `/api/*` continue to proxy to the existing production application. Both `/promo/feg-4` and `/site/index.html?promo=feg-promo-4` select the same tenant.

As of 2026-11-02, `promo-mr.vercel.app` is assigned to this `promotion` Vercel project and serves its Production deployment. The alias was moved alone after removing its old redirect; `iscae-promo-18.vercel.app`, `iscae-promo-19.vercel.app`, and `iscae-promo-20.vercel.app` remain on the separate `iscae-promo` project. Live checks returned HTTP 200 for the national homepage, both FEG-4 URL forms, and each legacy ISCAE root (which redirects to its `/site/index.html` app route). `promotion-snowy.vercel.app` is a temporary alias only.

`TENANT_ROOT_DOMAIN` is optional and is required only when automatically provisioning custom tenant subdomains such as `feg-promo-4.example.org`; the wildcard/root domain must already be configured on Vercel. Do not attempt to claim arbitrary `<slug>.vercel.app` hostnames. Without a configured custom root, new non-ISCAE promotions use `promo-mr.vercel.app/promo/<institution>-<batch>` and the equivalent `/site/index.html?promo=<full-slug>` route. Existing ISCAE domains remain separate.

The central proxy has no Supabase secrets. The application and token endpoints continue to run on the existing ISCAE production deployment, so Supabase server credentials stay there. The main-page anonymous client calls only the narrow `get_public_promotions()` RPC.

Each promotion stores its own `logo_style` (academic, business, law, medicine, engineering, education, technology, agriculture, science, or general). The central directory and application render the selected field mark when there is no uploaded logo it can safely access; the tenant application uses the tenant-scoped storage access for uploaded branding. Generated PWA icons refresh through promotion Realtime updates. Specialty administrators have a deliberately limited settings screen: the batch number is read-only and the only branding action is uploading a replacement image. Single-specialty batches hide specialty-admin controls and student-registration analytics; batches with the night event disabled do not expose its settings or ceremony cards, while existing ceremony data remains stored.

Five rapid clicks on either visible PROMO MR title open the platform-administrator sign-in route. Ordinary clicks still return to the homepage, and modified/middle-click browser navigation remains native.

The Mauritanian flag asset is sourced from [Wikimedia Commons: Flag of Mauritania.svg](https://commons.wikimedia.org/wiki/File:Flag_of_Mauritania.svg). Commons states the artwork's public-domain status and notes that official insignia may be subject to independent restrictions; it is used only as a small national identifier, not as the platform logo.
