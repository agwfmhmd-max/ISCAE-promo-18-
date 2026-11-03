-- Developer: Mohamed Dah Agove
-- Persist field-specific generated promo logos and scope specialty-head branding updates.
-- No student, admin, ceremony, promotion, or legacy domain rows are deleted.

BEGIN;

ALTER TABLE public.promotions
  ADD COLUMN IF NOT EXISTS logo_style text NOT NULL DEFAULT 'academic';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'promotions_logo_style_check'
       AND conrelid = 'public.promotions'::regclass
  ) THEN
    ALTER TABLE public.promotions
      ADD CONSTRAINT promotions_logo_style_check
      CHECK (logo_style IN ('academic','business','law','medicine','engineering','education','technology','agriculture','science','general'));
  END IF;
END $$;

COMMENT ON COLUMN public.promotions.logo_style IS
  'Field-specific generated promotion mark; custom uploaded logos remain independently stored. Developer: Mohamed Dah Agove.';

CREATE OR REPLACE FUNCTION public.update_promotion_logo_for_specialty_head(
  _promotion_id uuid,
  _logo_url text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, storage
AS $$
BEGIN
  IF auth.uid() IS NULL OR _promotion_id IS NULL OR _logo_url IS NULL THEN
    RAISE EXCEPTION 'FORBIDDEN';
  END IF;

  IF length(_logo_url) > 512
     OR left(_logo_url, length('promotions/' || _promotion_id::text || '/logos/'))
          <> ('promotions/' || _promotion_id::text || '/logos/')
     OR position('..' in _logo_url) > 0
     OR position('://' in _logo_url) > 0 THEN
    RAISE EXCEPTION 'INVALID_PROMOTION_LOGO_PATH';
  END IF;

  IF NOT EXISTS (
    SELECT 1
      FROM public.admins a
      JOIN public.specialties s
        ON s.id = a.specialty_id
       AND s.promotion_id = a.promotion_id
     WHERE a.user_id = auth.uid()
       AND a.role = 'dept_admin'
       AND COALESCE(a.is_active, true)
       AND a.promotion_id = _promotion_id
       AND public.current_promotion_id() = _promotion_id
  ) THEN
    RAISE EXCEPTION 'FORBIDDEN';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM storage.objects o
     WHERE o.bucket_id = 'student-photos'
       AND o.name = _logo_url
  ) THEN
    RAISE EXCEPTION 'PROMOTION_LOGO_NOT_FOUND';
  END IF;

  UPDATE public.promotions
     SET logo_url = _logo_url,
         updated_at = now()
   WHERE id = _promotion_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'PROMOTION_NOT_FOUND'; END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.update_promotion_logo_for_specialty_head(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_promotion_logo_for_specialty_head(uuid, text) TO authenticated;

-- Refresh the public directory's generated mark when a listed promotion has no uploaded logo.
DROP FUNCTION IF EXISTS public.get_public_promotions();
CREATE FUNCTION public.get_public_promotions()
RETURNS TABLE (
  promo_slug text,
  batch_number integer,
  name_ar text,
  name_fr text,
  institution_slug text,
  institution_name_ar text,
  institution_name_fr text,
  institution_short text,
  institution_logo_url text,
  promo_logo_url text,
  logo_style text,
  domain text,
  domain_status text,
  is_default boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.slug, p.number, p.name_ar, p.name_fr,
         i.slug, i.name_ar, i.name_fr, i.short_name, i.logo_url,
         p.logo_url, p.logo_style, p.domain, p.domain_status, p.is_default
    FROM public.promotions p
    JOIN public.institutions i ON i.id = p.institution_id
   WHERE p.public_listing IS TRUE
   ORDER BY i.slug, p.number, p.created_at;
$$;
REVOKE ALL ON FUNCTION public.get_public_promotions() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_promotions() TO anon, authenticated;

COMMIT;
