# Developer: Mohamed Dah Agove

## Promotion central host

This folder is the isolated root directory for a separate Vercel project named `promotion`. Import the existing GitHub repository, select `central-platform` as the project root directory, and assign the default `promotion.vercel.app` domain. Keep the existing `iscae-promo-18`, `iscae-promo-19`, and `iscae-promo-20` projects and domains unchanged.

`vercel.json` forwards each path and query string to the existing `iscae-promo-18.vercel.app` production deployment. That keeps the current API, tenant-token resolution, PWA assets, and application code as the single source of truth; `?promo=feg-promo-1` selects a tenant on the central host. The proxy project does not need Supabase secrets because the existing production project handles the application and API requests.

Configure the new Vercel project with the root directory `central-platform` and no build command or output directory. The project name and `promotion.vercel.app` domain must be available in the user's Vercel account before central links are distributed.
