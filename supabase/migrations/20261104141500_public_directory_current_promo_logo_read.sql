-- Developer: Mohamed Dah Agove
-- Keep student-photos private; let the public directory sign only the current logo of listed promotions.
BEGIN;

DROP POLICY IF EXISTS public_directory_current_promo_logo_read ON storage.objects;
CREATE POLICY public_directory_current_promo_logo_read
  ON storage.objects
  FOR SELECT
  TO anon, authenticated
  USING (
    bucket_id = 'student-photos'
    AND name ~* '^promotions/[0-9a-f-]{36}/logos/[^/]+\.(png|jpe?g|webp)$'
    AND EXISTS (
      SELECT 1
        FROM public.promotions AS p
       WHERE p.id::text = split_part(storage.objects.name, '/', 2)
         AND p.public_listing IS TRUE
         AND p.logo_url = storage.objects.name
    )
  );

COMMIT;
