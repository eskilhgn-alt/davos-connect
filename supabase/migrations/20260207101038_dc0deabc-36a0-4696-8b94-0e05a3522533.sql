
-- ============================================
-- SHOOT YOUR SHOT – Tables + RPC
-- ============================================

-- A) shot_tokens
CREATE TABLE public.shot_tokens (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  balance int NOT NULL DEFAULT 5,
  last_refill_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.shot_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own tokens" ON public.shot_tokens
  FOR SELECT USING (auth.uid() = user_id);

-- B) shot_events
CREATE TABLE public.shot_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  started_by uuid NOT NULL REFERENCES auth.users(id),
  status text NOT NULL DEFAULT 'countdown',
  countdown_ends_at timestamptz,
  selected_user_id uuid REFERENCES auth.users(id),
  selected_at timestamptz,
  deadline_at timestamptz,
  confirmed_at timestamptz,
  self_confirmed boolean DEFAULT false,
  witness_confirmed_by uuid REFERENCES auth.users(id),
  witness_confirmed_at timestamptz,
  punishment_applied_at timestamptz,
  group_id text NOT NULL DEFAULT 'global'
);
ALTER TABLE public.shot_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read shot events" ON public.shot_events
  FOR SELECT USING (auth.uid() IS NOT NULL);

-- C) shot_event_log
CREATE TABLE public.shot_event_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  event_id uuid NOT NULL REFERENCES public.shot_events(id) ON DELETE CASCADE,
  type text NOT NULL,
  actor_id uuid REFERENCES auth.users(id),
  payload jsonb DEFAULT '{}'::jsonb
);
ALTER TABLE public.shot_event_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read shot log" ON public.shot_event_log
  FOR SELECT USING (auth.uid() IS NOT NULL);

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.shot_events;
ALTER PUBLICATION supabase_realtime ADD TABLE public.shot_event_log;

-- ============================================
-- RPC: rpc_start_shot_round
-- ============================================
CREATE OR REPLACE FUNCTION public.rpc_start_shot_round(p_group_id text DEFAULT 'global')
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_active_count int;
  v_cooldown_check timestamptz;
  v_token_row shot_tokens%ROWTYPE;
  v_days_since numeric;
  v_refill int;
  v_event_id uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Check no active round
  SELECT count(*) INTO v_active_count
  FROM shot_events
  WHERE group_id = p_group_id
    AND status IN ('countdown', 'selected', 'overdue');

  IF v_active_count > 0 THEN
    RAISE EXCEPTION 'Active round already in progress';
  END IF;

  -- Check cooldown (5 min after last completed round)
  SELECT MAX(
    CASE
      WHEN status = 'confirmed' THEN confirmed_at
      WHEN status = 'punished' THEN punishment_applied_at
      ELSE created_at
    END
  ) INTO v_cooldown_check
  FROM shot_events
  WHERE group_id = p_group_id
    AND status IN ('confirmed', 'punished');

  IF v_cooldown_check IS NOT NULL AND (now() - v_cooldown_check) < interval '5 minutes' THEN
    RAISE EXCEPTION 'Cooldown active. Wait a few minutes.';
  END IF;

  -- Ensure token row exists
  INSERT INTO shot_tokens (user_id, balance, last_refill_at, updated_at)
  VALUES (v_uid, 5, now(), now())
  ON CONFLICT (user_id) DO NOTHING;

  SELECT * INTO v_token_row FROM shot_tokens WHERE user_id = v_uid FOR UPDATE;

  -- Refill tokens if new day
  v_days_since := EXTRACT(EPOCH FROM (now() - v_token_row.last_refill_at)) / 86400.0;
  IF v_days_since >= 1 THEN
    v_refill := LEAST(FLOOR(v_days_since)::int, 5 - v_token_row.balance);
    IF v_refill > 0 THEN
      UPDATE shot_tokens
      SET balance = balance + v_refill,
          last_refill_at = now(),
          updated_at = now()
      WHERE user_id = v_uid;
      v_token_row.balance := v_token_row.balance + v_refill;
    ELSE
      UPDATE shot_tokens SET last_refill_at = now(), updated_at = now() WHERE user_id = v_uid;
    END IF;
  END IF;

  -- Check balance
  IF v_token_row.balance < 1 THEN
    RAISE EXCEPTION 'No tokens left';
  END IF;

  -- Deduct token
  UPDATE shot_tokens SET balance = balance - 1, updated_at = now() WHERE user_id = v_uid;

  -- Create event
  INSERT INTO shot_events (started_by, status, countdown_ends_at, group_id)
  VALUES (v_uid, 'countdown', now() + interval '10 seconds', p_group_id)
  RETURNING id INTO v_event_id;

  -- Log
  INSERT INTO shot_event_log (event_id, type, actor_id, payload)
  VALUES
    (v_event_id, 'pressed', v_uid, jsonb_build_object('user_id', v_uid)),
    (v_event_id, 'countdown_started', v_uid, jsonb_build_object('ends_at', now() + interval '10 seconds'));

  RETURN jsonb_build_object('event_id', v_event_id, 'status', 'countdown', 'countdown_ends_at', now() + interval '10 seconds');
END;
$$;

-- ============================================
-- RPC: rpc_finalize_countdown
-- ============================================
CREATE OR REPLACE FUNCTION public.rpc_finalize_countdown(p_event_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_event shot_events%ROWTYPE;
  v_winner_id uuid;
  v_member record;
  v_weights numeric[];
  v_ids uuid[];
  v_total_weight numeric := 0;
  v_rand numeric;
  v_cumul numeric := 0;
  v_count int;
BEGIN
  SELECT * INTO v_event FROM shot_events WHERE id = p_event_id FOR UPDATE;

  IF v_event IS NULL THEN
    RAISE EXCEPTION 'Event not found';
  END IF;

  IF v_event.status != 'countdown' THEN
    -- Already finalized
    RETURN jsonb_build_object('event_id', v_event.id, 'status', v_event.status, 'selected_user_id', v_event.selected_user_id);
  END IF;

  IF now() < v_event.countdown_ends_at THEN
    RAISE EXCEPTION 'Countdown not finished yet';
  END IF;

  -- Get all members from members table for this group (use thread_id = default)
  -- Since we use 'global' group, get all members from any thread
  -- Build weighted list from profiles (all active users)
  v_ids := ARRAY[]::uuid[];
  v_weights := ARRAY[]::numeric[];

  FOR v_member IN
    SELECT p.id as user_id,
           COALESCE(
             (SELECT count(*) FROM shot_events se
              WHERE se.selected_user_id = p.id
                AND se.created_at > now() - interval '7 days'
                AND se.group_id = v_event.group_id), 0
           ) as recent_selections
    FROM profiles p
    WHERE p.is_active = true
  LOOP
    v_ids := array_append(v_ids, v_member.user_id);
    v_weights := array_append(v_weights, 1.0 / (1.0 + v_member.recent_selections));
    v_total_weight := v_total_weight + 1.0 / (1.0 + v_member.recent_selections);
  END LOOP;

  IF array_length(v_ids, 1) IS NULL OR array_length(v_ids, 1) = 0 THEN
    RAISE EXCEPTION 'No eligible users';
  END IF;

  -- Weighted random
  v_rand := random() * v_total_weight;
  FOR i IN 1..array_length(v_ids, 1) LOOP
    v_cumul := v_cumul + v_weights[i];
    IF v_rand <= v_cumul THEN
      v_winner_id := v_ids[i];
      EXIT;
    END IF;
  END LOOP;

  -- Fallback
  IF v_winner_id IS NULL THEN
    v_winner_id := v_ids[array_length(v_ids, 1)];
  END IF;

  -- Update event
  UPDATE shot_events
  SET status = 'selected',
      selected_user_id = v_winner_id,
      selected_at = now(),
      deadline_at = now() + interval '24 hours'
  WHERE id = p_event_id;

  -- Log
  INSERT INTO shot_event_log (event_id, type, actor_id, payload)
  VALUES (p_event_id, 'selected', v_winner_id,
    jsonb_build_object('selected_user_id', v_winner_id, 'deadline_at', now() + interval '24 hours'));

  RETURN jsonb_build_object('event_id', p_event_id, 'status', 'selected', 'selected_user_id', v_winner_id, 'deadline_at', now() + interval '24 hours');
END;
$$;

-- ============================================
-- RPC: rpc_confirm_shot
-- ============================================
CREATE OR REPLACE FUNCTION public.rpc_confirm_shot(p_event_id uuid, p_mode text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_event shot_events%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  SELECT * INTO v_event FROM shot_events WHERE id = p_event_id FOR UPDATE;
  IF v_event IS NULL THEN RAISE EXCEPTION 'Event not found'; END IF;

  IF v_event.status NOT IN ('selected', 'confirmed') THEN
    RAISE EXCEPTION 'Event not in confirmable state';
  END IF;

  IF p_mode = 'self' THEN
    IF v_uid != v_event.selected_user_id THEN
      RAISE EXCEPTION 'Only the selected user can self-confirm';
    END IF;
    UPDATE shot_events
    SET self_confirmed = true,
        confirmed_at = now(),
        status = 'confirmed'
    WHERE id = p_event_id;

    INSERT INTO shot_event_log (event_id, type, actor_id, payload)
    VALUES (p_event_id, 'self_confirmed', v_uid, '{}'::jsonb);

  ELSIF p_mode = 'witness' THEN
    IF v_uid = v_event.selected_user_id THEN
      RAISE EXCEPTION 'Selected user cannot witness their own shot';
    END IF;
    UPDATE shot_events
    SET witness_confirmed_by = v_uid,
        witness_confirmed_at = now(),
        status = CASE WHEN self_confirmed = true THEN 'confirmed' ELSE status END
    WHERE id = p_event_id;

    INSERT INTO shot_event_log (event_id, type, actor_id, payload)
    VALUES (p_event_id, 'witness_confirmed', v_uid, jsonb_build_object('witness_id', v_uid));
  ELSE
    RAISE EXCEPTION 'Invalid mode';
  END IF;

  SELECT * INTO v_event FROM shot_events WHERE id = p_event_id;
  RETURN jsonb_build_object('event_id', p_event_id, 'status', v_event.status, 'self_confirmed', v_event.self_confirmed, 'witness_confirmed_by', v_event.witness_confirmed_by);
END;
$$;

-- ============================================
-- RPC: rpc_apply_overdue
-- ============================================
CREATE OR REPLACE FUNCTION public.rpc_apply_overdue(p_event_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_event shot_events%ROWTYPE;
BEGIN
  SELECT * INTO v_event FROM shot_events WHERE id = p_event_id FOR UPDATE;
  IF v_event IS NULL THEN RAISE EXCEPTION 'Event not found'; END IF;

  IF v_event.status != 'selected' THEN
    RETURN jsonb_build_object('event_id', p_event_id, 'status', v_event.status);
  END IF;

  IF now() < v_event.deadline_at THEN
    RETURN jsonb_build_object('event_id', p_event_id, 'status', 'selected', 'message', 'Not yet overdue');
  END IF;

  IF v_event.confirmed_at IS NOT NULL THEN
    RETURN jsonb_build_object('event_id', p_event_id, 'status', v_event.status);
  END IF;

  -- Mark punished
  UPDATE shot_events
  SET status = 'punished',
      punishment_applied_at = now()
  WHERE id = p_event_id;

  INSERT INTO shot_event_log (event_id, type, actor_id, payload)
  VALUES
    (p_event_id, 'overdue', v_event.selected_user_id, '{}'::jsonb),
    (p_event_id, 'punished', v_event.selected_user_id, '{}'::jsonb);

  RETURN jsonb_build_object('event_id', p_event_id, 'status', 'punished');
END;
$$;

-- ============================================
-- RPC: rpc_get_shot_tokens (with auto-refill)
-- ============================================
CREATE OR REPLACE FUNCTION public.rpc_get_shot_tokens()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_row shot_tokens%ROWTYPE;
  v_days numeric;
  v_refill int;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  INSERT INTO shot_tokens (user_id, balance, last_refill_at, updated_at)
  VALUES (v_uid, 5, now(), now())
  ON CONFLICT (user_id) DO NOTHING;

  SELECT * INTO v_row FROM shot_tokens WHERE user_id = v_uid FOR UPDATE;

  v_days := EXTRACT(EPOCH FROM (now() - v_row.last_refill_at)) / 86400.0;
  IF v_days >= 1 THEN
    v_refill := LEAST(FLOOR(v_days)::int, 5 - v_row.balance);
    IF v_refill > 0 THEN
      UPDATE shot_tokens SET balance = balance + v_refill, last_refill_at = now(), updated_at = now() WHERE user_id = v_uid;
      v_row.balance := v_row.balance + v_refill;
    ELSE
      UPDATE shot_tokens SET last_refill_at = now(), updated_at = now() WHERE user_id = v_uid;
    END IF;
  END IF;

  RETURN jsonb_build_object('balance', v_row.balance, 'max', 5);
END;
$$;

-- ============================================
-- RPC: rpc_get_shot_leaderboard
-- ============================================
CREATE OR REPLACE FUNCTION public.rpc_get_shot_leaderboard(p_group_id text DEFAULT 'global', p_days int DEFAULT 9999)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result jsonb;
BEGIN
  SELECT jsonb_agg(row_to_json(t)) INTO v_result
  FROM (
    SELECT
      p.id as user_id,
      COALESCE(p.nickname, p.full_name, p.email) as display_name,
      COALESCE(stats.times_selected, 0) as times_selected,
      COALESCE(stats.times_confirmed, 0) as times_confirmed,
      COALESCE(stats.times_punished, 0) as times_punished,
      COALESCE(stats.times_started, 0) as times_started,
      COALESCE(stats.times_witnessed, 0) as times_witnessed
    FROM profiles p
    LEFT JOIN LATERAL (
      SELECT
        count(*) FILTER (WHERE se.selected_user_id = p.id) as times_selected,
        count(*) FILTER (WHERE se.selected_user_id = p.id AND se.status = 'confirmed') as times_confirmed,
        count(*) FILTER (WHERE se.selected_user_id = p.id AND se.status = 'punished') as times_punished,
        count(*) FILTER (WHERE se.started_by = p.id) as times_started,
        count(*) FILTER (WHERE se.witness_confirmed_by = p.id) as times_witnessed
      FROM shot_events se
      WHERE se.group_id = p_group_id
        AND se.created_at > now() - (p_days || ' days')::interval
    ) stats ON true
    WHERE p.is_active = true
      AND (COALESCE(stats.times_selected, 0) + COALESCE(stats.times_started, 0) + COALESCE(stats.times_witnessed, 0)) > 0
    ORDER BY COALESCE(stats.times_selected, 0) DESC, COALESCE(stats.times_confirmed, 0) DESC
  ) t;

  RETURN COALESCE(v_result, '[]'::jsonb);
END;
$$;
