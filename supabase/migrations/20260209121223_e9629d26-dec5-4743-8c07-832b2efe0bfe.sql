
-- 1. Fix witness_timeout to apply punishment instead of auto-confirm
CREATE OR REPLACE FUNCTION public.rpc_confirm_shot(p_event_id uuid, p_mode text, p_witness_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
    IF p_witness_id IS NULL THEN
      RAISE EXCEPTION 'Must choose a witness';
    END IF;
    IF p_witness_id = v_uid THEN
      RAISE EXCEPTION 'Cannot choose yourself as witness';
    END IF;
    UPDATE shot_events
    SET self_confirmed = true,
        chosen_witness_id = p_witness_id
    WHERE id = p_event_id;

    INSERT INTO shot_event_log (event_id, type, actor_id, payload)
    VALUES (p_event_id, 'self_confirmed', v_uid, jsonb_build_object('chosen_witness_id', p_witness_id));

  ELSIF p_mode = 'witness' THEN
    IF v_event.chosen_witness_id IS NULL THEN
      RAISE EXCEPTION 'No witness has been chosen yet';
    END IF;
    IF v_uid != v_event.chosen_witness_id THEN
      RAISE EXCEPTION 'You are not the chosen witness';
    END IF;
    UPDATE shot_events
    SET witness_confirmed_by = v_uid,
        witness_confirmed_at = now(),
        confirmed_at = now(),
        status = 'confirmed'
    WHERE id = p_event_id;

    INSERT INTO shot_event_log (event_id, type, actor_id, payload)
    VALUES (p_event_id, 'witness_confirmed', v_uid, jsonb_build_object('witness_id', v_uid));

  ELSIF p_mode = 'witness_deny' THEN
    IF v_event.chosen_witness_id IS NULL THEN
      RAISE EXCEPTION 'No witness has been chosen yet';
    END IF;
    IF v_uid != v_event.chosen_witness_id THEN
      RAISE EXCEPTION 'You are not the chosen witness';
    END IF;
    UPDATE shot_events
    SET witness_confirmed_by = v_uid,
        witness_confirmed_at = now(),
        status = 'punished',
        punishment_applied_at = now()
    WHERE id = p_event_id;

    INSERT INTO shot_event_log (event_id, type, actor_id, payload)
    VALUES (p_event_id, 'witness_denied', v_uid, jsonb_build_object('witness_id', v_uid, 'penalty_shots', 1));

  ELSIF p_mode = 'refuse' THEN
    IF v_uid != v_event.selected_user_id THEN
      RAISE EXCEPTION 'Only the selected user can refuse';
    END IF;
    UPDATE shot_events
    SET status = 'punished',
        punishment_applied_at = now()
    WHERE id = p_event_id;

    INSERT INTO shot_event_log (event_id, type, actor_id, payload)
    VALUES (p_event_id, 'refused', v_uid, jsonb_build_object('penalty_shots', 2, 'reason', 'refused'));

  ELSIF p_mode = 'witness_timeout' THEN
    -- Witness didn't respond in time → PUNISHMENT (not auto-confirm)
    IF v_event.chosen_witness_id IS NULL THEN
      RAISE EXCEPTION 'No witness chosen';
    END IF;
    UPDATE shot_events
    SET witness_confirmed_by = v_event.chosen_witness_id,
        witness_confirmed_at = now(),
        status = 'punished',
        punishment_applied_at = now()
    WHERE id = p_event_id;

    INSERT INTO shot_event_log (event_id, type, actor_id, payload)
    VALUES (p_event_id, 'witness_timeout', v_event.chosen_witness_id, 
      jsonb_build_object('penalty_shots', 1, 'reason', 'witness_timeout'));

  ELSE
    RAISE EXCEPTION 'Invalid mode';
  END IF;

  SELECT * INTO v_event FROM shot_events WHERE id = p_event_id;
  RETURN jsonb_build_object('event_id', p_event_id, 'status', v_event.status, 'self_confirmed', v_event.self_confirmed, 'witness_confirmed_by', v_event.witness_confirmed_by, 'chosen_witness_id', v_event.chosen_witness_id);
END;
$function$;

-- 2. Admin functions for shot management
CREATE OR REPLACE FUNCTION public.rpc_admin_reset_shot_event(p_event_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF NOT is_admin(v_uid) THEN RAISE EXCEPTION 'Not admin'; END IF;
  
  UPDATE shot_events SET status = 'cancelled' WHERE id = p_event_id;
  
  INSERT INTO shot_event_log (event_id, type, actor_id, payload)
  VALUES (p_event_id, 'admin_reset', v_uid, jsonb_build_object('reason', 'admin_reset'));
  
  RETURN jsonb_build_object('reset', true, 'event_id', p_event_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.rpc_admin_adjust_tokens(p_user_id uuid, p_delta integer, p_reason text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_new_balance integer;
BEGIN
  IF NOT is_admin(v_uid) THEN RAISE EXCEPTION 'Not admin'; END IF;
  
  -- Ensure token row exists
  INSERT INTO shot_tokens (user_id, balance) VALUES (p_user_id, 5)
  ON CONFLICT (user_id) DO NOTHING;
  
  UPDATE shot_tokens 
  SET balance = GREATEST(0, LEAST(balance + p_delta, 10)),
      updated_at = now()
  WHERE user_id = p_user_id
  RETURNING balance INTO v_new_balance;
  
  INSERT INTO token_ledger (user_id, delta, reason, description)
  VALUES (p_user_id, p_delta, 'admin_adjustment', p_reason);
  
  RETURN jsonb_build_object('adjusted', true, 'new_balance', v_new_balance, 'delta', p_delta);
END;
$$;

-- 3. Admin corrections table (for witness approval workflow)
CREATE TABLE IF NOT EXISTS public.admin_corrections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id uuid NOT NULL,
  target_user_id uuid,
  correction_type text NOT NULL, -- 'token_adjust', 'shot_reset', 'frikort_grant'
  payload jsonb NOT NULL DEFAULT '{}',
  witness_id uuid,
  witness_approved boolean DEFAULT false,
  witness_responded_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.admin_corrections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage corrections"
ON public.admin_corrections FOR ALL
USING (is_admin(auth.uid()) OR auth.uid() = witness_id);

CREATE POLICY "Witnesses can view their corrections"
ON public.admin_corrections FOR SELECT
USING (auth.uid() = witness_id);

-- 4. Points system table
CREATE TABLE IF NOT EXISTS public.user_points (
  user_id uuid PRIMARY KEY,
  total_points integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.user_points ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read all points"
ON public.user_points FOR SELECT
USING (auth.uid() IS NOT NULL);

CREATE TABLE IF NOT EXISTS public.points_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  points integer NOT NULL,
  reason text NOT NULL, -- 'chat_message', 'media_share', 'agenda_create', 'shot_start', 'shot_confirm', 'witness', 'ski_vertical', 'story_publish'
  description text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.points_ledger ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read all points_ledger"
ON public.points_ledger FOR SELECT
USING (auth.uid() IS NOT NULL);

-- Points awarding function
CREATE OR REPLACE FUNCTION public.rpc_award_points(p_user_id uuid, p_points integer, p_reason text, p_description text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Upsert points
  INSERT INTO user_points (user_id, total_points, updated_at)
  VALUES (p_user_id, p_points, now())
  ON CONFLICT (user_id)
  DO UPDATE SET total_points = user_points.total_points + p_points, updated_at = now();
  
  -- Log
  INSERT INTO points_ledger (user_id, points, reason, description)
  VALUES (p_user_id, p_points, p_reason, p_description);
  
  RETURN jsonb_build_object('awarded', true, 'points', p_points);
END;
$$;

-- Points leaderboard
CREATE OR REPLACE FUNCTION public.rpc_get_points_leaderboard(p_days integer DEFAULT 9999)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_result jsonb;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  
  SELECT jsonb_agg(row_to_json(t)) INTO v_result
  FROM (
    SELECT
      p.id as user_id,
      COALESCE(p.nickname, p.full_name, p.email) as display_name,
      COALESCE(up.total_points, 0) as total_points,
      COALESCE(recent.recent_points, 0) as recent_points
    FROM profiles p
    LEFT JOIN user_points up ON up.user_id = p.id
    LEFT JOIN LATERAL (
      SELECT COALESCE(SUM(pl.points), 0) as recent_points
      FROM points_ledger pl
      WHERE pl.user_id = p.id
        AND pl.created_at > now() - (p_days || ' days')::interval
    ) recent ON true
    WHERE p.is_active = true
      AND COALESCE(up.total_points, 0) > 0
    ORDER BY COALESCE(up.total_points, 0) DESC
  ) t;
  
  RETURN COALESCE(v_result, '[]'::jsonb);
END;
$$;

-- Enable realtime on points
ALTER PUBLICATION supabase_realtime ADD TABLE public.user_points;
ALTER PUBLICATION supabase_realtime ADD TABLE public.admin_corrections;
