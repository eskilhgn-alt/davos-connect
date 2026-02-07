
-- 1. Update rpc_finalize_countdown: 40 min → 15 min deadline
CREATE OR REPLACE FUNCTION public.rpc_finalize_countdown(p_event_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_event shot_events%ROWTYPE;
  v_winner_id uuid;
  v_member record;
  v_weights numeric[];
  v_ids uuid[];
  v_total_weight numeric := 0;
  v_rand numeric;
  v_cumul numeric := 0;
BEGIN
  SELECT * INTO v_event FROM shot_events WHERE id = p_event_id FOR UPDATE;
  IF v_event IS NULL THEN RAISE EXCEPTION 'Event not found'; END IF;
  IF v_event.status != 'countdown' THEN
    RETURN jsonb_build_object('event_id', v_event.id, 'status', v_event.status, 'selected_user_id', v_event.selected_user_id);
  END IF;
  IF now() < v_event.countdown_ends_at THEN
    RAISE EXCEPTION 'Countdown not finished yet';
  END IF;

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

  v_rand := random() * v_total_weight;
  FOR i IN 1..array_length(v_ids, 1) LOOP
    v_cumul := v_cumul + v_weights[i];
    IF v_rand <= v_cumul THEN
      v_winner_id := v_ids[i];
      EXIT;
    END IF;
  END LOOP;
  IF v_winner_id IS NULL THEN
    v_winner_id := v_ids[array_length(v_ids, 1)];
  END IF;

  -- 15 MINUTE deadline (changed from 40)
  UPDATE shot_events
  SET status = 'selected',
      selected_user_id = v_winner_id,
      selected_at = now(),
      deadline_at = now() + interval '15 minutes'
  WHERE id = p_event_id;

  INSERT INTO shot_event_log (event_id, type, actor_id, payload)
  VALUES (p_event_id, 'selected', v_winner_id,
    jsonb_build_object('selected_user_id', v_winner_id, 'deadline_at', now() + interval '15 minutes'));

  PERFORM rpc_check_bonus_token(v_winner_id, v_event.group_id);

  RETURN jsonb_build_object('event_id', p_event_id, 'status', 'selected', 'selected_user_id', v_winner_id, 'deadline_at', now() + interval '15 minutes');
END;
$function$;

-- 2. Update rpc_apply_overdue: 2 penalty → 1 penalty
CREATE OR REPLACE FUNCTION public.rpc_apply_overdue(p_event_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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

  UPDATE shot_events
  SET status = 'punished',
      punishment_applied_at = now()
  WHERE id = p_event_id;

  INSERT INTO shot_event_log (event_id, type, actor_id, payload)
  VALUES
    (p_event_id, 'overdue', v_event.selected_user_id, '{}'::jsonb),
    (p_event_id, 'punished', v_event.selected_user_id, jsonb_build_object('penalty_shots', 1));

  RETURN jsonb_build_object('event_id', p_event_id, 'status', 'punished', 'penalty_shots', 1);
END;
$function$;

-- 3. Update rpc_confirm_shot: add witness denial (p_mode = 'witness_deny')
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
    -- Witness denies the shot → 1 extra penalty shot for selected user
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
  ELSE
    RAISE EXCEPTION 'Invalid mode';
  END IF;

  SELECT * INTO v_event FROM shot_events WHERE id = p_event_id;
  RETURN jsonb_build_object('event_id', p_event_id, 'status', v_event.status, 'self_confirmed', v_event.self_confirmed, 'witness_confirmed_by', v_event.witness_confirmed_by, 'chosen_witness_id', v_event.chosen_witness_id);
END;
$function$;

-- 4. Remove the daily round requirement from rpc_check_shot_ban (keep only unresolved punishment)
CREATE OR REPLACE FUNCTION public.rpc_check_shot_ban()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  -- No ban mechanic anymore
  RETURN jsonb_build_object('banned', false);
END;
$function$;

-- 5. Create token_ledger table for tracking token earn/spend history
CREATE TABLE IF NOT EXISTS public.token_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  delta integer NOT NULL,
  reason text NOT NULL,
  description text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.token_ledger ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own ledger"
  ON public.token_ledger FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "System can insert ledger entries"
  ON public.token_ledger FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE INDEX idx_token_ledger_user ON public.token_ledger(user_id, created_at DESC);
