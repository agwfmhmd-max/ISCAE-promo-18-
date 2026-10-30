-- Developer: Mohamed Dah Agove
-- Multi-university support. Additive migration; run only after MULTI-PROMO.sql.
-- Existing ISCAE rows are assigned to the seeded ISCAE institution; no tenant data is deleted.

begin;

DO $$
BEGIN
  IF to_regclass('public.promotions') IS NULL THEN
    RAISE EXCEPTION 'MULTI-PROMO.sql must be applied before this migration.';
  END IF;
  IF to_regclass('public.settings') IS NULL THEN
    RAISE EXCEPTION 'The public.settings table is required.';
  END IF;
  IF to_regprocedure('public.is_platform_admin()') IS NULL THEN
    RAISE EXCEPTION 'The platform-admin functions from MULTI-PROMO.sql are required.';
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.institutions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE
    CHECK (slug = lower(slug) AND slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' AND length(slug) <= 40),
  name_ar text,
  name_fr text,
  short_name text NOT NULL,
  logo_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT institutions_name_required CHECK (
    coalesce(nullif(btrim(name_ar), ''), nullif(btrim(name_fr), '')) IS NOT NULL
  ),
  CONSTRAINT institutions_short_name_length CHECK (length(btrim(short_name)) BETWEEN 1 AND 32)
);

-- Seed the current tenant without overwriting any later custom branding.
INSERT INTO public.institutions (slug, name_ar, name_fr, short_name)
VALUES (
  'iscae',
  'المعهد العالي للمحاسبة وإدارة المؤسسات',
  'Institut Supérieur de Comptabilité et d''Administration des Entreprises',
  'ISCAE'
)
ON CONFLICT (slug) DO UPDATE
SET name_ar = coalesce(nullif(public.institutions.name_ar, ''), EXCLUDED.name_ar),
    name_fr = coalesce(nullif(public.institutions.name_fr, ''), EXCLUDED.name_fr),
    short_name = coalesce(nullif(public.institutions.short_name, ''), EXCLUDED.short_name),
    updated_at = now();

ALTER TABLE public.promotions
  ADD COLUMN IF NOT EXISTS institution_id uuid;

UPDATE public.promotions
SET institution_id = (SELECT id FROM public.institutions WHERE slug = 'iscae')
WHERE institution_id IS NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.promotions'::regclass
      AND conname = 'promotions_institution_id_fkey'
  ) THEN
    ALTER TABLE public.promotions
      ADD CONSTRAINT promotions_institution_id_fkey
      FOREIGN KEY (institution_id) REFERENCES public.institutions(id) ON DELETE RESTRICT;
  END IF;
END $$;

ALTER TABLE public.promotions
  ALTER COLUMN institution_id SET NOT NULL;

-- The previous schema used a global batch-number uniqueness rule. Replace it with
-- institution-scoped uniqueness, keeping uniqueness within each university.
DROP INDEX IF EXISTS public.promotions_number_uniq;
CREATE UNIQUE INDEX IF NOT EXISTS promotions_institution_number_uniq
  ON public.promotions (institution_id, number);

ALTER TABLE public.institutions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS institutions_public_read ON public.institutions;
CREATE POLICY institutions_public_read
  ON public.institutions FOR SELECT TO anon, authenticated USING (true);
GRANT SELECT ON public.institutions TO anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.institutions FROM anon, authenticated;

-- Compatibility for the existing platform_create_promotion(int,text,text) RPC:
-- older callers continue to create ISCAE promotions after the migration.
CREATE OR REPLACE FUNCTION public.mp_set_default_institution()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.institution_id IS NULL THEN
    SELECT id INTO NEW.institution_id FROM public.institutions WHERE slug = 'iscae';
    IF NEW.institution_id IS NULL THEN
      RAISE EXCEPTION 'DEFAULT_INSTITUTION_NOT_FOUND';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS mp_set_default_institution ON public.promotions;
CREATE TRIGGER mp_set_default_institution
  BEFORE INSERT ON public.promotions
  FOR EACH ROW EXECUTE FUNCTION public.mp_set_default_institution();

-- Atomic platform-admin operation: reuse an existing institution or create/update
-- it by stable slug, then create its promotion and isolated settings row.
CREATE OR REPLACE FUNCTION public.platform_create_institution_promotion(
  _institution_id uuid,
  _institution_slug text,
  _institution_name_ar text,
  _institution_name_fr text,
  _institution_short text,
  _number int,
  _name_fr text,
  _name_ar text
)
RETURNS public.promotions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_institution public.institutions;
  v_slug text;
  v_short text;
  v_promotion_slug text;
  v public.promotions;
  v_sid bigint;
  legacy public.settings;
BEGIN
  IF NOT public.is_platform_admin() THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  IF _number IS NULL OR _number < 1 OR _number > 999 THEN RAISE EXCEPTION 'INVALID_NUMBER'; END IF;

  IF _institution_id IS NOT NULL THEN
    SELECT * INTO v_institution FROM public.institutions WHERE id = _institution_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'INSTITUTION_NOT_FOUND'; END IF;
  ELSE
    v_slug := lower(btrim(coalesce(_institution_slug, '')));
    IF length(v_slug) < 2 OR length(v_slug) > 40
       OR v_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$' THEN
      RAISE EXCEPTION 'INVALID_INSTITUTION_SLUG';
    END IF;
    IF coalesce(nullif(btrim(_institution_name_ar), ''), nullif(btrim(_institution_name_fr), '')) IS NULL THEN
      RAISE EXCEPTION 'INSTITUTION_NAME_REQUIRED';
    END IF;
    v_short := coalesce(nullif(btrim(_institution_short), ''), upper(left(replace(v_slug, '-', ''), 8)));
    IF length(v_short) > 32 THEN RAISE EXCEPTION 'INVALID_INSTITUTION_SHORT_NAME'; END IF;

    INSERT INTO public.institutions (slug, name_ar, name_fr, short_name)
    VALUES (v_slug, nullif(btrim(_institution_name_ar), ''), nullif(btrim(_institution_name_fr), ''), v_short)
    ON CONFLICT (slug) DO UPDATE
      SET name_ar = coalesce(nullif(btrim(EXCLUDED.name_ar), ''), public.institutions.name_ar),
          name_fr = coalesce(nullif(btrim(EXCLUDED.name_fr), ''), public.institutions.name_fr),
          short_name = coalesce(nullif(btrim(EXCLUDED.short_name), ''), public.institutions.short_name),
          updated_at = now()
    RETURNING * INTO v_institution;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.promotions
    WHERE institution_id = v_institution.id AND number = _number
  ) THEN
    RAISE EXCEPTION 'PROMO_EXISTS';
  END IF;

  v_promotion_slug := v_institution.slug || '-promo-' || _number::text;
  IF EXISTS (SELECT 1 FROM public.promotions WHERE slug = v_promotion_slug) THEN
    RAISE EXCEPTION 'PROMO_SLUG_EXISTS';
  END IF;

  INSERT INTO public.promotions (
    institution_id, number, slug, domain, domain_status, name_fr, name_ar, created_by
  ) VALUES (
    v_institution.id, _number, v_promotion_slug, NULL, 'pending',
    nullif(btrim(_name_fr), ''), nullif(btrim(_name_ar), ''), auth.uid()
  ) RETURNING * INTO v;

  -- Mirror the existing multi-promotion settings-row initialization so each
  -- institution/batch keeps the same defaults and isolation as legacy batches.
  PERFORM pg_advisory_xact_lock(hashtext('settings_new_row'));
  SELECT coalesce(max(id), 0) + 1 INTO v_sid FROM public.settings;
  BEGIN
    INSERT INTO public.settings (id, promotion_id) VALUES (v_sid, v.id);
  EXCEPTION WHEN others THEN
    BEGIN
      SELECT s.* INTO legacy
      FROM public.settings s
      JOIN public.promotions p ON p.id = s.promotion_id AND p.is_default
      LIMIT 1;
      IF legacy.id IS NOT NULL THEN
        INSERT INTO public.settings
        SELECT (jsonb_populate_record(
          NULL::public.settings,
          to_jsonb(legacy)
          - 'specialty_counts_override' - 'total_graduates_override'
          - 'graduation_date' - 'night_party_date' - 'platform_name'
          || jsonb_build_object('id', v_sid, 'promotion_id', v.id)
        )).*;
      END IF;
    EXCEPTION WHEN others THEN
      RAISE NOTICE 'Settings row was not initialized automatically; it will be created on first settings save: %', SQLERRM;
    END;
  END;
  RETURN v;
END;
$$;

REVOKE ALL ON FUNCTION public.platform_create_institution_promotion(uuid, text, text, text, text, int, text, text) FROM public;
GRANT EXECUTE ON FUNCTION public.platform_create_institution_promotion(uuid, text, text, text, text, int, text, text) TO authenticated;

-- Institution logos use a separate storage path so they remain readable from every tenant.
DO $$
BEGIN
  IF to_regclass('storage.objects') IS NOT NULL THEN
    DROP POLICY IF EXISTS mp_institution_logos_select ON storage.objects;
    CREATE POLICY mp_institution_logos_select ON storage.objects FOR SELECT TO anon, authenticated
      USING (bucket_id = 'student-photos' AND name ~ '^institutions/[0-9a-f-]{36}/[^/]+$'
        AND EXISTS (SELECT 1 FROM public.institutions i WHERE name LIKE ('institutions/' || i.id::text || '/%')));
    DROP POLICY IF EXISTS mp_institution_logos_insert ON storage.objects;
    CREATE POLICY mp_institution_logos_insert ON storage.objects FOR INSERT TO authenticated
      WITH CHECK (bucket_id = 'student-photos' AND name ~ '^institutions/[0-9a-f-]{36}/[^/]+$'
        AND public.is_platform_admin());
    DROP POLICY IF EXISTS mp_institution_logos_delete ON storage.objects;
    CREATE POLICY mp_institution_logos_delete ON storage.objects FOR DELETE TO authenticated
      USING (bucket_id = 'student-photos' AND name ~ '^institutions/[0-9a-f-]{36}/[^/]+$'
        AND public.is_platform_admin());
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.platform_update_institution_logo(_institution_id uuid, _logo_url text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_platform_admin() THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  IF _logo_url IS NOT NULL AND _logo_url !~ ('^institutions/' || _institution_id::text || '/[A-Za-z0-9._-]+\.(png|jpe?g|webp)$') THEN
    RAISE EXCEPTION 'INVALID_INSTITUTION_LOGO_PATH';
  END IF;
  UPDATE public.institutions SET logo_url = _logo_url, updated_at = now() WHERE id = _institution_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'INSTITUTION_NOT_FOUND'; END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.platform_update_institution_logo(uuid, text) FROM public;
GRANT EXECUTE ON FUNCTION public.platform_update_institution_logo(uuid, text) TO authenticated;

-- Postgres Changes allows every open tenant page to refresh shared institution branding.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime')
     AND NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'institutions') THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.institutions';
  END IF;
END $$;

COMMENT ON TABLE public.institutions IS 'University/institution identities for the multi-university promotion platform. Developer: Mohamed Dah Agove.';

COMMIT;
