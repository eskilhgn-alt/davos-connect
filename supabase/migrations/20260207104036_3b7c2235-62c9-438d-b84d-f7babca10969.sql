
-- Update deadline to 40 minutes and remove cooldown
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

  -- 40 MINUTE deadline
  UPDATE shot_events
  SET status = 'selected',
      selected_user_id = v_winner_id,
      selected_at = now(),
      deadline_at = now() + interval '40 minutes'
  WHERE id = p_event_id;

  INSERT INTO shot_event_log (event_id, type, actor_id, payload)
  VALUES (p_event_id, 'selected', v_winner_id,
    jsonb_build_object('selected_user_id', v_winner_id, 'deadline_at', now() + interval '40 minutes'));

  PERFORM rpc_check_bonus_token(v_winner_id, v_event.group_id);

  RETURN jsonb_build_object('event_id', p_event_id, 'status', 'selected', 'selected_user_id', v_winner_id, 'deadline_at', now() + interval '40 minutes');
END;
$function$;

-- Remove cooldown from rpc_start_shot_round
CREATE OR REPLACE FUNCTION public.rpc_start_shot_round(p_group_id text DEFAULT 'global'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_active_count int;
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

  -- NO COOLDOWN - immediate new round allowed

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
$function$;
