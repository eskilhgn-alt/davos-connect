-- ============================================================================
-- Shot-trekning v2 — provably fair, trip-scoped draws.
-- CODE ONLY: denne migrasjonen er IKKE kjørt i produksjon.
--
-- Prinsipper:
--  * Ingen gjenbruk av legacy (shot_events, shot_tokens, token_ledger, ...).
--    Legacy er avlåst og røres ikke av denne filen.
--  * Ingen DROP / DELETE / TRUNCATE.
--  * Alle mutasjoner via SECURITY DEFINER-RPC med fast search_path.
--  * authenticated har kun SELECT, og kun for turer man er godkjent medlem av.
--  * Seed er service-only til trekningen er ferdig (commit–reveal).
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ---------------------------------------------------------------------------
-- 1. Tabeller
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.shot_draws (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id            uuid NOT NULL REFERENCES public.trips(id),
  initiated_by       uuid NOT NULL,
  idempotency_key    text NOT NULL,
  status             text NOT NULL DEFAULT 'countdown',
  server_started_at  timestamptz NOT NULL DEFAULT now(),
  draw_at            timestamptz NOT NULL,
  finalized_at       timestamptz,
  participant_count  integer NOT NULL,
  participant_hash   text NOT NULL,
  seed_commitment    text NOT NULL,
  seed_reveal        text,
  winner_id          uuid,
  proof_counter      integer,
  proof_value        bigint,
  algorithm_version  text NOT NULL DEFAULT 'sha256-rejection-v1',
  created_at         timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT shot_draws_status_chk CHECK (status IN ('countdown', 'finalized')),
  CONSTRAINT shot_draws_count_chk CHECK (participant_count >= 1),
  CONSTRAINT shot_draws_idem_uniq UNIQUE (trip_id, idempotency_key)
);

-- Nøyaktig én aktiv (ikke-finalisert) trekning per tur.
CREATE UNIQUE INDEX IF NOT EXISTS shot_draws_one_active_per_trip
  ON public.shot_draws (trip_id)
  WHERE status = 'countdown';

CREATE INDEX IF NOT EXISTS shot_draws_trip_created_idx
  ON public.shot_draws (trip_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.shot_draw_participants (
  id        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  draw_id   uuid NOT NULL REFERENCES public.shot_draws(id),
  trip_id   uuid NOT NULL REFERENCES public.trips(id),
  user_id   uuid NOT NULL,
  position  integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT shot_draw_participants_user_uniq UNIQUE (draw_id, user_id),
  CONSTRAINT shot_draw_participants_pos_uniq UNIQUE (draw_id, position),
  CONSTRAINT shot_draw_participants_pos_chk CHECK (position >= 0)
);

CREATE INDEX IF NOT EXISTS shot_draw_participants_lookup_idx
  ON public.shot_draw_participants (trip_id, user_id);

-- Service-only hemmelighet. Aldri eksponert i Data API.
CREATE TABLE IF NOT EXISTS public.shot_draw_secrets (
  draw_id   uuid PRIMARY KEY REFERENCES public.shot_draws(id),
  seed      text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- 2. Grants / RLS
-- ---------------------------------------------------------------------------

REVOKE ALL ON public.shot_draws FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.shot_draw_participants FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.shot_draw_secrets FROM PUBLIC, anon, authenticated;

GRANT SELECT ON public.shot_draws TO authenticated;
GRANT SELECT ON public.shot_draw_participants TO authenticated;
GRANT ALL ON public.shot_draws TO service_role;
GRANT ALL ON public.shot_draw_participants TO service_role;
GRANT ALL ON public.shot_draw_secrets TO service_role;

ALTER TABLE public.shot_draws ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shot_draw_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shot_draw_secrets ENABLE ROW LEVEL SECURITY;

-- Idempotent policy-oppsett uten DROP (historikk og eksisterende policyer bevares).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname = 'public' AND tablename = 'shot_draws'
       AND policyname = 'shot_draws_select_members'
  ) THEN
    EXECUTE $p$CREATE POLICY "shot_draws_select_members"
      ON public.shot_draws FOR SELECT TO authenticated
      USING (public.is_approved_trip_member(trip_id, auth.uid()))$p$;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname = 'public' AND tablename = 'shot_draw_participants'
       AND policyname = 'shot_draw_participants_select_members'
  ) THEN
    EXECUTE $p$CREATE POLICY "shot_draw_participants_select_members"
      ON public.shot_draw_participants FOR SELECT TO authenticated
      USING (public.is_approved_trip_member(trip_id, auth.uid()))$p$;
  END IF;
END $$;

-- shot_draw_secrets: RLS på, ingen policy => ingen tilgang utenom service_role.

-- ---------------------------------------------------------------------------
-- 3. Deterministisk vinnervalg (SHA-256 rejection sampling, ingen modulo-bias)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.shot_draw_pick_position(
  p_seed text, p_draw_id uuid, p_n integer,
  OUT position integer, OUT counter integer, OUT value bigint
)
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
DECLARE
  v_digest bytea;
  v_limit bigint;
  v_i integer := 0;
BEGIN
  IF p_n < 1 THEN RAISE EXCEPTION 'invalid_participant_count'; END IF;
  v_limit := (4294967296::bigint / p_n) * p_n;
  LOOP
    v_digest := digest(p_seed || ':' || p_draw_id::text || ':' || v_i::text, 'sha256');
    value := (get_byte(v_digest, 0)::bigint << 24)
           | (get_byte(v_digest, 1)::bigint << 16)
           | (get_byte(v_digest, 2)::bigint << 8)
           |  get_byte(v_digest, 3)::bigint;
    IF value < v_limit THEN
      position := (value % p_n)::integer;
      counter := v_i;
      RETURN;
    END IF;
    v_i := v_i + 1;
    IF v_i > 10000 THEN RAISE EXCEPTION 'rejection_sampling_exhausted'; END IF;
  END LOOP;
END $$;

REVOKE ALL ON FUNCTION public.shot_draw_pick_position(text, uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.shot_draw_pick_position(text, uuid, integer) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 4. Start-RPC — atomisk, idempotent, én aktiv trekning per tur
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.rpc_shot_start(p_trip_id uuid, p_idempotency_key text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_draw public.shot_draws;
  v_seed text;
  v_ids uuid[];
  v_hash text;
  v_n integer;
  v_recent integer;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'unauthorized' USING ERRCODE = '42501'; END IF;
  IF p_trip_id IS NULL THEN RAISE EXCEPTION 'trip_required'; END IF;
  IF p_idempotency_key IS NULL OR length(btrim(p_idempotency_key)) < 8 THEN
    RAISE EXCEPTION 'idempotency_key_required';
  END IF;
  IF NOT public.is_approved_trip_member(p_trip_id, v_uid) THEN
    RAISE EXCEPTION 'not_trip_member' USING ERRCODE = '42501';
  END IF;
  IF NOT public.is_trip_active(p_trip_id) THEN
    RAISE EXCEPTION 'trip_archived' USING ERRCODE = '42501';
  END IF;

  -- Serialiser alle startere for samme tur.
  PERFORM pg_advisory_xact_lock(hashtextextended('shot_draw:' || p_trip_id::text, 0));

  -- Idempotens: samme nøkkel => samme trekning.
  SELECT * INTO v_draw FROM public.shot_draws
   WHERE trip_id = p_trip_id AND idempotency_key = p_idempotency_key;
  IF FOUND THEN
    RETURN public.rpc_shot_get_draw(v_draw.id);
  END IF;

  -- Allerede en aktiv trekning => returner den (dobbelttrykk/parallelle startere).
  SELECT * INTO v_draw FROM public.shot_draws
   WHERE trip_id = p_trip_id AND status = 'countdown'
   ORDER BY created_at DESC LIMIT 1;
  IF FOUND THEN
    RETURN public.rpc_shot_get_draw(v_draw.id);
  END IF;

  -- Rate limit: maks 6 trekninger per bruker per tur per time.
  SELECT count(*) INTO v_recent FROM public.shot_draws
   WHERE trip_id = p_trip_id AND initiated_by = v_uid
     AND created_at > now() - interval '1 hour';
  IF v_recent >= 6 THEN RAISE EXCEPTION 'rate_limited'; END IF;

  -- Snapshot: alle og bare aktive/godkjente medlemmer av turen, deterministisk sortert.
  SELECT array_agg(tm.user_id ORDER BY tm.user_id::text)
    INTO v_ids
    FROM public.trip_members tm
    JOIN public.profiles p ON p.id = tm.user_id
   WHERE tm.trip_id = p_trip_id
     AND p.membership_status = 'approved'
     AND p.is_active = true
     AND NOT coalesce(p.is_banned, false);

  v_n := coalesce(cardinality(v_ids), 0);
  IF v_n < 1 THEN RAISE EXCEPTION 'no_eligible_participants'; END IF;

  v_hash := encode(digest(array_to_string(v_ids, ','), 'sha256'), 'hex');
  v_seed := encode(gen_random_bytes(32), 'hex');

  INSERT INTO public.shot_draws (
    trip_id, initiated_by, idempotency_key, status, server_started_at, draw_at,
    participant_count, participant_hash, seed_commitment
  ) VALUES (
    p_trip_id, v_uid, p_idempotency_key, 'countdown', now(), now() + interval '10 seconds',
    v_n, v_hash, 'pending'
  ) RETURNING * INTO v_draw;

  INSERT INTO public.shot_draw_secrets (draw_id, seed) VALUES (v_draw.id, v_seed);

  UPDATE public.shot_draws
     SET seed_commitment = encode(
           digest(v_seed || ':' || v_draw.id::text || ':' || v_hash, 'sha256'), 'hex')
   WHERE id = v_draw.id;

  INSERT INTO public.shot_draw_participants (draw_id, trip_id, user_id, position)
  SELECT v_draw.id, p_trip_id, u.uid, (u.ord - 1)::integer
    FROM unnest(v_ids) WITH ORDINALITY AS u(uid, ord);

  RETURN public.rpc_shot_get_draw(v_draw.id);
END $$;

REVOKE ALL ON FUNCTION public.rpc_shot_start(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_shot_start(uuid, text) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 5. Finalize-RPC — idempotent, serverklokke, kun én gang
-- ---------------------------------------------------------------------------

-- Intern kjerne: gjør selve finaliseringen. Ingen grants – kun definer-kall.
CREATE OR REPLACE FUNCTION public.shot_draw_finalize_internal(p_draw_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_draw public.shot_draws;
  v_seed text;
  v_pick record;
  v_winner uuid;
BEGIN
  SELECT * INTO v_draw FROM public.shot_draws WHERE id = p_draw_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'draw_not_found'; END IF;

  IF v_draw.status = 'finalized' THEN
    RETURN public.rpc_shot_get_draw(v_draw.id);
  END IF;
  IF now() < v_draw.draw_at THEN
    RETURN public.rpc_shot_get_draw(v_draw.id);
  END IF;

  SELECT seed INTO v_seed FROM public.shot_draw_secrets WHERE draw_id = v_draw.id;
  IF v_seed IS NULL THEN RAISE EXCEPTION 'seed_missing'; END IF;

  SELECT * INTO v_pick FROM public.shot_draw_pick_position(v_seed, v_draw.id, v_draw.participant_count);

  SELECT user_id INTO v_winner FROM public.shot_draw_participants
   WHERE draw_id = v_draw.id AND position = v_pick.position;
  IF v_winner IS NULL THEN RAISE EXCEPTION 'winner_resolution_failed'; END IF;

  UPDATE public.shot_draws
     SET status = 'finalized',
         finalized_at = now(),
         winner_id = v_winner,
         seed_reveal = v_seed,
         proof_counter = v_pick.counter,
         proof_value = v_pick.value
   WHERE id = v_draw.id;

  RETURN public.rpc_shot_get_draw(v_draw.id);
END $$;

REVOKE ALL ON FUNCTION public.shot_draw_finalize_internal(uuid) FROM PUBLIC, anon, authenticated;

-- Brukerkall (via Edge med bruker-JWT): medlemskap håndheves.
CREATE OR REPLACE FUNCTION public.rpc_shot_finalize(p_draw_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_trip uuid;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'unauthorized' USING ERRCODE = '42501'; END IF;
  SELECT trip_id INTO v_trip FROM public.shot_draws WHERE id = p_draw_id;
  IF v_trip IS NULL THEN RAISE EXCEPTION 'draw_not_found'; END IF;
  IF NOT public.is_approved_trip_member(v_trip, v_uid) THEN
    RAISE EXCEPTION 'not_trip_member' USING ERRCODE = '42501';
  END IF;
  RETURN public.shot_draw_finalize_internal(p_draw_id);
END $$;

REVOKE ALL ON FUNCTION public.rpc_shot_finalize(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_shot_finalize(uuid) TO authenticated, service_role;

-- Bakgrunnsjobb (service_role/cron): ingen innlogget bruker, ingen klientdata.
CREATE OR REPLACE FUNCTION public.rpc_shot_finalize_service(p_draw_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  RETURN public.shot_draw_finalize_internal(p_draw_id);
END $$;

REVOKE ALL ON FUNCTION public.rpc_shot_finalize_service(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_shot_finalize_service(uuid) TO service_role;

-- Alle forfalte trekninger på tvers av turer – kun bakgrunnsjobben.
CREATE OR REPLACE FUNCTION public.rpc_shot_due_draws_all()
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT d.id FROM public.shot_draws d
   WHERE d.status = 'countdown' AND d.draw_at <= now()
$$;

REVOKE ALL ON FUNCTION public.rpc_shot_due_draws_all() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_shot_due_draws_all() TO service_role;

-- ---------------------------------------------------------------------------
-- 6. Lese-RPC-er
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.rpc_shot_get_draw(p_draw_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_draw public.shot_draws;
BEGIN
  SELECT * INTO v_draw FROM public.shot_draws WHERE id = p_draw_id;
  IF NOT FOUND THEN RETURN NULL; END IF;
  IF v_uid IS NOT NULL AND NOT public.is_approved_trip_member(v_draw.trip_id, v_uid) THEN
    RAISE EXCEPTION 'not_trip_member' USING ERRCODE = '42501';
  END IF;

  RETURN jsonb_build_object(
    'server_now', now(),
    'draw', jsonb_build_object(
      'id', v_draw.id,
      'trip_id', v_draw.trip_id,
      'initiated_by', v_draw.initiated_by,
      'status', v_draw.status,
      'server_started_at', v_draw.server_started_at,
      'draw_at', v_draw.draw_at,
      'finalized_at', v_draw.finalized_at,
      'participant_count', v_draw.participant_count,
      'participant_hash', v_draw.participant_hash,
      'seed_commitment', v_draw.seed_commitment,
      'seed_reveal', v_draw.seed_reveal,
      'winner_id', v_draw.winner_id,
      'proof_counter', v_draw.proof_counter,
      'proof_value', v_draw.proof_value,
      'algorithm_version', v_draw.algorithm_version,
      'created_at', v_draw.created_at
    ),
    'participants', coalesce((
      SELECT jsonb_agg(jsonb_build_object('user_id', sp.user_id, 'position', sp.position)
                       ORDER BY sp.position)
        FROM public.shot_draw_participants sp
       WHERE sp.draw_id = v_draw.id
    ), '[]'::jsonb)
  );
END $$;

REVOKE ALL ON FUNCTION public.rpc_shot_get_draw(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_shot_get_draw(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.rpc_shot_current(p_trip_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_id uuid;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'unauthorized' USING ERRCODE = '42501'; END IF;
  IF NOT public.is_approved_trip_member(p_trip_id, v_uid) THEN
    RAISE EXCEPTION 'not_trip_member' USING ERRCODE = '42501';
  END IF;
  SELECT id INTO v_id FROM public.shot_draws
   WHERE trip_id = p_trip_id
   ORDER BY created_at DESC LIMIT 1;
  IF v_id IS NULL THEN
    RETURN jsonb_build_object('server_now', now(), 'draw', NULL, 'participants', '[]'::jsonb);
  END IF;
  RETURN public.rpc_shot_get_draw(v_id);
END $$;

REVOKE ALL ON FUNCTION public.rpc_shot_current(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_shot_current(uuid) TO authenticated, service_role;

-- Statistikk per tur. Påvirker aldri odds — kun visning.
CREATE OR REPLACE FUNCTION public.rpc_shot_stats(p_trip_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'unauthorized' USING ERRCODE = '42501'; END IF;
  IF NOT public.is_approved_trip_member(p_trip_id, v_uid) THEN
    RAISE EXCEPTION 'not_trip_member' USING ERRCODE = '42501';
  END IF;

  RETURN coalesce((
    SELECT jsonb_agg(row_to_json(t)::jsonb ORDER BY t.times_drawn DESC, t.times_in DESC)
      FROM (
        SELECT sp.user_id,
               count(*)::int AS times_in,
               count(*) FILTER (WHERE d.winner_id = sp.user_id)::int AS times_drawn,
               coalesce(sum(1.0 / d.participant_count), 0)::numeric AS expected_draws,
               max(d.finalized_at) FILTER (WHERE d.winner_id = sp.user_id) AS last_drawn_at
          FROM public.shot_draw_participants sp
          JOIN public.shot_draws d ON d.id = sp.draw_id
         WHERE sp.trip_id = p_trip_id AND d.status = 'finalized'
         GROUP BY sp.user_id
      ) t
  ), '[]'::jsonb);
END $$;

REVOKE ALL ON FUNCTION public.rpc_shot_stats(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_shot_stats(uuid) TO authenticated, service_role;

-- Finn forfalte trekninger (brukes av Edge Function til reparasjon).
CREATE OR REPLACE FUNCTION public.rpc_shot_due_draws(p_trip_id uuid)
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT d.id FROM public.shot_draws d
   WHERE d.trip_id = p_trip_id
     AND d.status = 'countdown'
     AND d.draw_at <= now()
     AND public.is_approved_trip_member(d.trip_id, auth.uid())
$$;

REVOKE ALL ON FUNCTION public.rpc_shot_due_draws(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_shot_due_draws(uuid) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 7. Realtime — idempotent publication-oppsett
-- ---------------------------------------------------------------------------

ALTER TABLE public.shot_draws REPLICA IDENTITY FULL;
ALTER TABLE public.shot_draw_participants REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
     WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'shot_draws'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.shot_draws';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
     WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'shot_draw_participants'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.shot_draw_participants';
  END IF;
END $$;


-- ---------------------------------------------------------------------------
-- 8. Ikke-destruktiv, retrybar dispatch-status (additivt på eksisterende tabell)
-- ---------------------------------------------------------------------------

ALTER TABLE public.notification_dispatches
  ADD COLUMN IF NOT EXISTS attempts integer NOT NULL DEFAULT 0;

CREATE OR REPLACE FUNCTION public.notification_dispatch_bump_attempt()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.sent_at IS NULL AND NEW.claimed_at IS DISTINCT FROM OLD.claimed_at THEN
    NEW.attempts := coalesce(OLD.attempts, 0) + 1;
  END IF;
  RETURN NEW;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'trg_notification_dispatch_attempt'
  ) THEN
    EXECUTE 'CREATE TRIGGER trg_notification_dispatch_attempt
             BEFORE UPDATE ON public.notification_dispatches
             FOR EACH ROW EXECUTE FUNCTION public.notification_dispatch_bump_attempt()';
  END IF;
END $$;
