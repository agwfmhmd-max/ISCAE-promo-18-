-- Developer: Mohamed Dah Agove
-- Public national directory controls and safe per-promotion single-specialty mode.
-- No student, ceremony, promotion or legacy ISCAE rows are deleted by this migration.

BEGIN;

DO $$
BEGIN
  IF to_regclass('public.promotions') IS NULL THEN
    RAISE EXCEPTION 'The public.promotions table is required.';
  END IF;
  IF to_regclass('public.institutions') IS NULL THEN
    RAISE EXCEPTION 'Apply 20261029000000_multi_university.sql first.';
  END IF;
  IF to_regclass('public.specialties') IS NULL THEN
    RAISE EXCEPTION 'The public.specialties table is required.';
  END IF;
  IF to_regprocedure('public.is_platform_admin()') IS NULL
     OR to_regprocedure('public.mp_can_read(uuid)') IS NULL THEN
    RAISE EXCEPTION 'The platform-admin and tenant-scope functions are required.';
  END IF;
END $$;

ALTER TABLE public.promotions
  ADD COLUMN IF NOT EXISTS public_listing boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS single_specialty_enabled boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.promotions.public_listing IS
  'Whether this graduation promotion is listed on the national public directory. Developer: Mohamed Dah Agove.';
COMMENT ON COLUMN public.promotions.single_specialty_enabled IS
  'When true, a promotion has one specialty; a constraint trigger prevents adding additional specialties. Developer: Mohamed Dah Agove.';

-- Public visitors can see the selected directory entries and the tenant they currently opened.
-- Platform administrators retain visibility across all promotions through their scoped JWT.
DROP POLICY IF EXISTS "promotions readable by everyone" ON public.promotions;
CREATE POLICY "promotions readable by everyone" ON public.promotions
  FOR SELECT TO anon, authenticated
  USING (public.mp_can_read(id) OR public_listing OR public.is_platform_admin());
GRANT SELECT ON public.promotions TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.platform_update_promotion_public_listing(
  _promotion_id uuid,
  _public_listing boolean
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_platform_admin() THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  IF _public_listing IS NULL THEN RAISE EXCEPTION 'INVALID_PUBLIC_LISTING_SETTING'; END IF;
  UPDATE public.promotions
     SET public_listing = _public_listing, updated_at = now()
   WHERE id = _promotion_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'PROMOTION_NOT_FOUND'; END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.platform_update_promotion_public_listing(uuid, boolean) FROM public;
GRANT EXECUTE ON FUNCTION public.platform_update_promotion_public_listing(uuid, boolean) TO authenticated;

CREATE OR REPLACE FUNCTION public.platform_update_single_specialty(
  _promotion_id uuid,
  _enabled boolean
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer;
BEGIN
  IF NOT public.is_platform_admin() THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  IF _enabled IS NULL THEN RAISE EXCEPTION 'INVALID_SINGLE_SPECIALTY_SETTING'; END IF;
  PERFORM pg_advisory_xact_lock(hashtext(_promotion_id::text));
  IF NOT EXISTS (SELECT 1 FROM public.promotions WHERE id = _promotion_id) THEN
    RAISE EXCEPTION 'PROMOTION_NOT_FOUND';
  END IF;
  IF _enabled THEN
    SELECT count(*) INTO v_count FROM public.specialties WHERE promotion_id = _promotion_id;
    IF v_count > 1 THEN RAISE EXCEPTION 'PROMOTION_HAS_MULTIPLE_SPECIALTIES'; END IF;
  END IF;
  UPDATE public.promotions
     SET single_specialty_enabled = _enabled, updated_at = now()
   WHERE id = _promotion_id;
END;
$$;
REVOKE ALL ON FUNCTION public.platform_update_single_specialty(uuid, boolean) FROM public;
GRANT EXECUTE ON FUNCTION public.platform_update_single_specialty(uuid, boolean) TO authenticated;

CREATE OR REPLACE FUNCTION public.enforce_single_promotion_specialty()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.promotion_id IS NULL THEN RETURN NEW; END IF;
  PERFORM pg_advisory_xact_lock(hashtext(NEW.promotion_id::text));
  IF EXISTS (
    SELECT 1 FROM public.promotions p
     WHERE p.id = NEW.promotion_id AND p.single_specialty_enabled
  ) AND EXISTS (
    SELECT 1 FROM public.specialties s
     WHERE s.promotion_id = NEW.promotion_id
       AND (TG_OP = 'INSERT' OR s.id <> NEW.id)
  ) THEN
    RAISE EXCEPTION 'PROMOTION_HAS_MULTIPLE_SPECIALTIES';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_enforce_single_promotion_specialty ON public.specialties;
CREATE TRIGGER trg_enforce_single_promotion_specialty
  BEFORE INSERT OR UPDATE OF promotion_id ON public.specialties
  FOR EACH ROW EXECUTE FUNCTION public.enforce_single_promotion_specialty();

-- Return only deliberately public directory fields; never return student/admin/contact data.
CREATE OR REPLACE FUNCTION public.get_public_promotions()
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
         p.logo_url, p.domain, p.domain_status, p.is_default
    FROM public.promotions p
    JOIN public.institutions i ON i.id = p.institution_id
   WHERE p.public_listing IS TRUE
   ORDER BY i.slug, p.number, p.created_at;
$$;
REVOKE ALL ON FUNCTION public.get_public_promotions() FROM public;
GRANT EXECUTE ON FUNCTION public.get_public_promotions() TO anon, authenticated;

-- A tiny public change signal keeps the directory live without broadcasting private rows.
CREATE TABLE IF NOT EXISTS public.promo_mr_directory_events (
  id boolean PRIMARY KEY DEFAULT true CHECK (id IS TRUE),
  updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.promo_mr_directory_events (id, updated_at)
VALUES (true, now()) ON CONFLICT (id) DO NOTHING;
ALTER TABLE public.promo_mr_directory_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS promo_mr_directory_events_public_read ON public.promo_mr_directory_events;
CREATE POLICY promo_mr_directory_events_public_read
  ON public.promo_mr_directory_events FOR SELECT TO anon, authenticated USING (true);
REVOKE ALL ON public.promo_mr_directory_events FROM public, anon, authenticated;
GRANT SELECT ON public.promo_mr_directory_events TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.bump_promo_mr_directory_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.promo_mr_directory_events (id, updated_at)
  VALUES (true, now())
  ON CONFLICT (id) DO UPDATE SET updated_at = EXCLUDED.updated_at;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_bump_promo_mr_directory_event ON public.promotions;
CREATE TRIGGER trg_bump_promo_mr_directory_event
  AFTER INSERT OR UPDATE OR DELETE ON public.promotions
  FOR EACH ROW EXECUTE FUNCTION public.bump_promo_mr_directory_event();

-- Keep Realtime for the tenant table and this single-value public signal.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime')
     AND NOT EXISTS (
       SELECT 1 FROM pg_publication_tables
       WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'promotions'
     ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.promotions';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime')
     AND NOT EXISTS (
       SELECT 1 FROM pg_publication_tables
       WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'promo_mr_directory_events'
     ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.promo_mr_directory_events';
  END IF;
END $$;

COMMIT;
