-- Developer: Mohamed Dah Agove
-- Keep disabled night-event data in storage, but never expose it to public tenant clients.
-- Also signal the national directory whenever institution branding changes.
BEGIN;

DO $$
BEGIN
  IF to_regclass('public.promotions') IS NULL
     OR to_regclass('public.ceremonies') IS NULL
     OR to_regclass('public.ceremony_card_types') IS NULL
     OR to_regclass('public.student_ceremony_cards') IS NULL THEN
    RAISE EXCEPTION 'Apply the multi-promotion schema before this migration.';
  END IF;
  IF to_regprocedure('public.mp_can_read(uuid)') IS NULL
     OR to_regprocedure('public.can_manage_promotion(uuid)') IS NULL THEN
    RAISE EXCEPTION 'Apply the multi-promotion access functions before this migration.';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'promotions' AND column_name = 'night_event_enabled'
  ) THEN
    RAISE EXCEPTION 'Apply the night-event settings migration before this migration.';
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.mp_can_read_ceremony(_promotion_id uuid, _ceremony_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.mp_can_read(_promotion_id)
     AND EXISTS (
       SELECT 1
       FROM public.ceremonies c
       JOIN public.promotions p ON p.id = c.promotion_id
       WHERE c.id = _ceremony_id
         AND c.promotion_id = _promotion_id
         AND (
           public.can_manage_promotion(_promotion_id)
           OR c.type IS DISTINCT FROM 'night'
           OR p.night_event_enabled IS TRUE
         )
     );
$$;
REVOKE ALL ON FUNCTION public.mp_can_read_ceremony(uuid, uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.mp_can_read_ceremony(uuid, uuid) TO anon, authenticated, service_role;

-- Additional RESTRICTIVE policies are ANDed with existing tenant-scope policies and
-- preserve existing write/manage permissions while filtering public SELECTs.
DROP POLICY IF EXISTS mp_night_event_visibility_select ON public.ceremonies;
CREATE POLICY mp_night_event_visibility_select
  ON public.ceremonies AS RESTRICTIVE FOR SELECT TO anon, authenticated
  USING (public.mp_can_read_ceremony(promotion_id, id));

DROP POLICY IF EXISTS mp_night_event_visibility_select ON public.ceremony_card_types;
CREATE POLICY mp_night_event_visibility_select
  ON public.ceremony_card_types AS RESTRICTIVE FOR SELECT TO anon, authenticated
  USING (public.mp_can_read_ceremony(promotion_id, ceremony_id));

DROP POLICY IF EXISTS mp_night_event_visibility_select ON public.student_ceremony_cards;
CREATE POLICY mp_night_event_visibility_select
  ON public.student_ceremony_cards AS RESTRICTIVE FOR SELECT TO anon, authenticated
  USING (public.mp_can_read_ceremony(promotion_id, ceremony_id));

-- This RPC is SECURITY DEFINER, so it must enforce the same rule explicitly.
CREATE OR REPLACE FUNCTION public.get_student_cards(_student_id uuid)
RETURNS TABLE(
  ceremony_id uuid,
  ceremony_name text,
  ceremony_name_fr text,
  ceremony_type text,
  card_type_id uuid,
  card_type_name text,
  card_type_name_fr text,
  card_color text,
  quantity integer
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT c.id, c.name, c.name_fr, c.type,
         ct.id, ct.name, ct.name_fr, ct.color, scc.quantity
  FROM public.student_ceremony_cards scc
  JOIN public.students st ON st.id = scc.student_id AND st.promotion_id = scc.promotion_id
  JOIN public.ceremonies c ON c.id = scc.ceremony_id AND c.promotion_id = scc.promotion_id
  LEFT JOIN public.ceremony_card_types ct
    ON ct.id = scc.card_type_id AND ct.promotion_id = scc.promotion_id
  WHERE st.id = _student_id
    AND public.mp_can_read_ceremony(st.promotion_id, c.id)
  ORDER BY (c.type = 'night'), ct.created_at NULLS FIRST;
$$;
REVOKE ALL ON FUNCTION public.get_student_cards(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.get_student_cards(uuid) TO anon, authenticated;

-- Promotions and institution logos/names share one tiny public signal row; never broadcast
-- student or private promotion records as part of a directory refresh notification.
DROP TRIGGER IF EXISTS trg_bump_promo_mr_directory_event_institutions ON public.institutions;
CREATE TRIGGER trg_bump_promo_mr_directory_event_institutions
  AFTER INSERT OR UPDATE OR DELETE ON public.institutions
  FOR EACH ROW EXECUTE FUNCTION public.bump_promo_mr_directory_event();

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime')
     AND NOT EXISTS (
       SELECT 1 FROM pg_publication_tables
       WHERE pubname = 'supabase_realtime'
         AND schemaname = 'public'
         AND tablename = 'institutions'
     ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.institutions';
  END IF;
END $$;

COMMIT;
