
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
                AND se.group_id = v_event.group_id
                AND se.status NOT IN ('cancelled')), 0
           ) as recent_selections
    FROM profiles p
    WHERE p.is_active = true
  LOOP
    v_ids := array_append(v_ids, v_member.user_id);
    v_weights := array_append(v_weights, 1.0 / (1.0 + 0.3 * v_member.recent_selections));
    v_total_weight := v_total_weight + 1.0 / (1.0 + 0.3 * v_member.recent_selections);
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
$$;
