-- Developer: Mohamed Dah Agove
-- Per-promotion visibility for the night gala. Existing ceremonies and dates are preserved.

BEGIN;

DO $$
BEGIN
  IF to_regclass('public.promotions') IS NULL THEN
    RAISE EXCEPTION 'The public.promotions table is required.';
  END IF;
  IF to_regprocedure('public.is_platform_admin()') IS NULL THEN
    RAISE EXCEPTION 'The platform-admin function is required.';
  END IF;
  IF to_regprocedure('public.platform_create_institution_promotion_with_mask(uuid,text,text,text,text,integer,text,text,text)') IS NULL THEN
    RAISE EXCEPTION 'Apply the registration-mask migration before this migration.';
  END IF;
END $$;

ALTER TABLE public.promotions
  ADD COLUMN IF NOT EXISTS night_event_enabled boolean;

UPDATE public.promotions
SET night_event_enabled = true
WHERE night_event_enabled IS NULL;

ALTER TABLE public.promotions
  ALTER COLUMN night_event_enabled SET DEFAULT true,
  ALTER COLUMN night_event_enabled SET NOT NULL;

CREATE OR REPLACE FUNCTION public.platform_update_night_event_enabled(
  _promotion_id uuid,
  _enabled boolean
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_platform_admin() THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  IF _enabled IS NULL THEN RAISE EXCEPTION 'INVALID_NIGHT_EVENT_SETTING'; END IF;

  UPDATE public.promotions
  SET night_event_enabled = _enabled, updated_at = now()
  WHERE id = _promotion_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'PROMOTION_NOT_FOUND'; END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.platform_update_night_event_enabled(uuid, boolean) FROM public;
GRANT EXECUTE ON FUNCTION public.platform_update_night_event_enabled(uuid, boolean) TO authenticated;

-- New promotion creation remains atomic and keeps the earlier RPCs available to older clients.
CREATE OR REPLACE FUNCTION public.platform_create_institution_promotion_with_options(
  _institution_id uuid,
  _institution_slug text,
  _institution_name_ar text,
  _institution_name_fr text,
  _institution_short text,
  _number integer,
  _name_fr text,
  _name_ar text,
  _registration_mask text,
  _night_event_enabled boolean
)
RETURNS public.promotions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_promotion public.promotions;
BEGIN
  IF NOT public.is_platform_admin() THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;

  v_promotion := public.platform_create_institution_promotion_with_mask(
    _institution_id,
    _institution_slug,
    _institution_name_ar,
    _institution_name_fr,
    _institution_short,
    _number,
    _name_fr,
    _name_ar,
    _registration_mask
  );

  UPDATE public.promotions
  SET night_event_enabled = coalesce(_night_event_enabled, true), updated_at = now()
  WHERE id = v_promotion.id
  RETURNING * INTO v_promotion;

  RETURN v_promotion;
END;
$$;
REVOKE ALL ON FUNCTION public.platform_create_institution_promotion_with_options(uuid,text,text,text,text,integer,text,text,text,boolean) FROM public;
GRANT EXECUTE ON FUNCTION public.platform_create_institution_promotion_with_options(uuid,text,text,text,text,integer,text,text,text,boolean) TO authenticated;

COMMENT ON COLUMN public.promotions.night_event_enabled IS 'When false, hide night-gala dates and student-facing gala cards without deleting stored event data. Developer: Mohamed Dah Agove.';

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
