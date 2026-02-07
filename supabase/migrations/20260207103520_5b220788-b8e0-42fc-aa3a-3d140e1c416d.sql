
-- 1. Add chosen_witness_id column to shot_events
ALTER TABLE public.shot_events ADD COLUMN IF NOT EXISTS chosen_witness_id uuid;

-- 2. Update rpc_finalize_countdown: 2h deadline instead of 24h
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

  -- 2 HOUR deadline instead of 24
  UPDATE shot_events
  SET status = 'selected',
      selected_user_id = v_winner_id,
      selected_at = now(),
      deadline_at = now() + interval '2 hours'
  WHERE id = p_event_id;

  INSERT INTO shot_event_log (event_id, type, actor_id, payload)
  VALUES (p_event_id, 'selected', v_winner_id,
    jsonb_build_object('selected_user_id', v_winner_id, 'deadline_at', now() + interval '2 hours'));

  -- Bonus token: if this user leads by 2+ shots, grant extra token
  PERFORM rpc_check_bonus_token(v_winner_id, v_event.group_id);

  RETURN jsonb_build_object('event_id', p_event_id, 'status', 'selected', 'selected_user_id', v_winner_id, 'deadline_at', now() + interval '2 hours');
END;
$function$;

-- 3. Bonus token function: if user leads by 2+ in times_selected, grant +1 token (max 5)
CREATE OR REPLACE FUNCTION public.rpc_check_bonus_token(p_user_id uuid, p_group_id text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user_count int;
  v_second_count int;
BEGIN
  SELECT count(*) INTO v_user_count
  FROM shot_events
  WHERE selected_user_id = p_user_id AND group_id = p_group_id
    AND status IN ('selected','confirmed','punished');

  SELECT COALESCE(max(cnt), 0) INTO v_second_count
  FROM (
    SELECT count(*) as cnt
    FROM shot_events
    WHERE selected_user_id != p_user_id AND group_id = p_group_id
      AND status IN ('selected','confirmed','punished')
    GROUP BY selected_user_id
  ) sub;

  IF v_user_count >= v_second_count + 2 THEN
    UPDATE shot_tokens SET balance = LEAST(balance + 1, 5), updated_at = now()
    WHERE user_id = p_user_id;

    INSERT INTO shot_event_log (event_id, type, actor_id, payload)
    SELECT id, 'bonus_token', p_user_id, jsonb_build_object('reason', 'leads_by_2_plus')
    FROM shot_events
    WHERE selected_user_id = p_user_id AND group_id = p_group_id
    ORDER BY created_at DESC LIMIT 1;
  END IF;
END;
$function$;

-- 4. Update rpc_confirm_shot: support choose_witness mode and only allow chosen witness
CREATE OR REPLACE FUNCTION public.rpc_confirm_shot(p_event_id uuid, p_mode text, p_witness_id uuid DEFAULT NULL)
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
  ELSE
    RAISE EXCEPTION 'Invalid mode';
  END IF;

  SELECT * INTO v_event FROM shot_events WHERE id = p_event_id;
  RETURN jsonb_build_object('event_id', p_event_id, 'status', v_event.status, 'self_confirmed', v_event.self_confirmed, 'witness_confirmed_by', v_event.witness_confirmed_by, 'chosen_witness_id', v_event.chosen_witness_id);
END;
$function$;

-- 5. Update rpc_apply_overdue: punishment = 2 shots logged
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
    (p_event_id, 'punished', v_event.selected_user_id, jsonb_build_object('penalty_shots', 2));

  RETURN jsonb_build_object('event_id', p_event_id, 'status', 'punished', 'penalty_shots', 2);
END;
$function$;

-- 6. RPC to get all users' token balances
CREATE OR REPLACE FUNCTION public.rpc_get_all_shot_tokens()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_result jsonb;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  SELECT jsonb_agg(row_to_json(t)) INTO v_result
  FROM (
    SELECT
      p.id as user_id,
      COALESCE(p.nickname, p.full_name, p.email) as display_name,
      COALESCE(st.balance, 5) as balance
    FROM profiles p
    LEFT JOIN shot_tokens st ON st.user_id = p.id
    WHERE p.is_active = true
    ORDER BY COALESCE(st.balance, 5) DESC
  ) t;

  RETURN COALESCE(v_result, '[]'::jsonb);
END;
$function$;
