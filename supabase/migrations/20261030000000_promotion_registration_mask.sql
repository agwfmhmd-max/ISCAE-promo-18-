-- Developer: Mohamed Dah Agove
-- Per-promotion registration-number formats for the multi-university platform.
-- Additive and backward-compatible: existing registrations retain the ISCAE default (I#####).

BEGIN;

DO $$
BEGIN
  IF to_regclass('public.promotions') IS NULL THEN
    RAISE EXCEPTION 'The public.promotions table is required.';
  END IF;
  IF to_regprocedure('public.is_platform_admin()') IS NULL THEN
    RAISE EXCEPTION 'The platform-admin function is required.';
  END IF;
  IF to_regprocedure('public.platform_create_institution_promotion(uuid,text,text,text,text,integer,text,text)') IS NULL THEN
    RAISE EXCEPTION 'Apply the multi-university migration before this migration.';
  END IF;
END $$;

ALTER TABLE public.promotions
  ADD COLUMN IF NOT EXISTS registration_mask text;

UPDATE public.promotions
SET registration_mask = 'I#####'
WHERE registration_mask IS NULL OR btrim(registration_mask) = '';

ALTER TABLE public.promotions
  ALTER COLUMN registration_mask SET DEFAULT 'I#####',
  ALTER COLUMN registration_mask SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.promotions'::regclass
      AND conname = 'promotions_registration_mask_valid'
  ) THEN
    ALTER TABLE public.promotions
      ADD CONSTRAINT promotions_registration_mask_valid
      CHECK (
        registration_mask = upper(btrim(registration_mask))
        AND length(registration_mask) BETWEEN 2 AND 32
        AND registration_mask ~ '^[A-Z0-9#-]+$'
        AND strpos(registration_mask, '#') > 0
      );
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.platform_update_registration_mask(
  _promotion_id uuid,
  _registration_mask text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_mask text;
BEGIN
  IF NOT public.is_platform_admin() THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  v_mask := upper(btrim(coalesce(_registration_mask, '')));
  IF length(v_mask) NOT BETWEEN 2 AND 32
     OR v_mask !~ '^[A-Z0-9#-]+$'
     OR strpos(v_mask, '#') = 0 THEN
    RAISE EXCEPTION 'INVALID_REGISTRATION_MASK';
  END IF;

  UPDATE public.promotions
  SET registration_mask = v_mask, updated_at = now()
  WHERE id = _promotion_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'PROMOTION_NOT_FOUND'; END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.platform_update_registration_mask(uuid, text) FROM public;
GRANT EXECUTE ON FUNCTION public.platform_update_registration_mask(uuid, text) TO authenticated;

-- Keep promotion creation atomic: the format is stored with the new batch in the same transaction.
-- The original creation RPC is retained for older ISCAE clients and continues to use I#####.
CREATE OR REPLACE FUNCTION public.platform_create_institution_promotion_with_mask(
  _institution_id uuid,
  _institution_slug text,
  _institution_name_ar text,
  _institution_name_fr text,
  _institution_short text,
  _number integer,
  _name_fr text,
  _name_ar text,
  _registration_mask text
)
RETURNS public.promotions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_promotion public.promotions;
  v_mask text;
BEGIN
  IF NOT public.is_platform_admin() THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  v_mask := upper(btrim(coalesce(_registration_mask, '')));
  IF length(v_mask) NOT BETWEEN 2 AND 32
     OR v_mask !~ '^[A-Z0-9#-]+$'
     OR strpos(v_mask, '#') = 0 THEN
    RAISE EXCEPTION 'INVALID_REGISTRATION_MASK';
  END IF;

  v_promotion := public.platform_create_institution_promotion(
    _institution_id,
    _institution_slug,
    _institution_name_ar,
    _institution_name_fr,
    _institution_short,
    _number,
    _name_fr,
    _name_ar
  );

  UPDATE public.promotions
  SET registration_mask = v_mask, updated_at = now()
  WHERE id = v_promotion.id
  RETURNING * INTO v_promotion;
  RETURN v_promotion;
END;
$$;
REVOKE ALL ON FUNCTION public.platform_create_institution_promotion_with_mask(uuid, text, text, text, text, integer, text, text, text) FROM public;
GRANT EXECUTE ON FUNCTION public.platform_create_institution_promotion_with_mask(uuid, text, text, text, text, integer, text, text, text) TO authenticated;

COMMENT ON COLUMN public.promotions.registration_mask IS 'Per-promotion registration format; # denotes one decimal digit. Developer: Mohamed Dah Agove.';

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime')
     AND NOT EXISTS (
       SELECT 1 FROM pg_publication_tables
       WHERE pubname = 'supabase_realtime'
         AND schemaname = 'public'
         AND tablename = 'promotions'
     ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.promotions';
  END IF;
END $$;

COMMIT;
