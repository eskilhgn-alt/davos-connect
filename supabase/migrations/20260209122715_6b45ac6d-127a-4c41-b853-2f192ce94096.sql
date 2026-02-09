
-- 1. Update rpc_record_ski_sample: lower altitude threshold to 1500m
CREATE OR REPLACE FUNCTION public.rpc_record_ski_sample(p_altitude double precision, p_speed double precision, p_lat double precision DEFAULT NULL, p_lon double precision DEFAULT NULL)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_prev_altitude double precision;
  v_vertical_gain double precision := 0;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  IF p_altitude < 1500 THEN
    RETURN jsonb_build_object('recorded', false, 'reason', 'altitude_too_low');
  END IF;
  IF p_speed < 2.78 THEN
    RETURN jsonb_build_object('recorded', false, 'reason', 'speed_too_low');
  END IF;

  SELECT altitude INTO v_prev_altitude
  FROM ski_altitude_samples
  WHERE user_id = v_uid AND recorded_at > now() - interval '5 minutes'
  ORDER BY recorded_at DESC
  LIMIT 1;

  INSERT INTO ski_altitude_samples (user_id, altitude, speed, lat, lon)
  VALUES (v_uid, p_altitude, p_speed, p_lat, p_lon);

  IF v_prev_altitude IS NOT NULL AND p_altitude < v_prev_altitude THEN
    v_vertical_gain := v_prev_altitude - p_altitude;
    IF v_vertical_gain < 2 THEN
      v_vertical_gain := 0;
    END IF;
  END IF;

  INSERT INTO ski_daily_vertical (user_id, day_date, vertical_meters, sample_count)
  VALUES (v_uid, CURRENT_DATE, v_vertical_gain, 1)
  ON CONFLICT (user_id, day_date)
  DO UPDATE SET
    vertical_meters = ski_daily_vertical.vertical_meters + v_vertical_gain,
    sample_count = ski_daily_vertical.sample_count + 1,
    updated_at = now();

  RETURN jsonb_build_object('recorded', true, 'vertical_gain', round(v_vertical_gain::numeric, 1));
END;
$function$;

-- 2. Remove token max cap: allow hoarding beyond 5
CREATE OR REPLACE FUNCTION public.rpc_get_shot_tokens()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
    v_refill := FLOOR(v_days)::int;
    IF v_refill > 0 THEN
      UPDATE shot_tokens SET balance = balance + v_refill, last_refill_at = now(), updated_at = now() WHERE user_id = v_uid;
      v_row.balance := v_row.balance + v_refill;
    ELSE
      UPDATE shot_tokens SET last_refill_at = now(), updated_at = now() WHERE user_id = v_uid;
    END IF;
  END IF;

  RETURN jsonb_build_object('balance', v_row.balance);
END;
$function$;

-- 3. Lighter weighted draw: 1/(1+0.3*recent) instead of 1/(1+recent)
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
    -- Marginal weighting: 1/(1 + 0.3 * recent)
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
$function$;

-- 4. Remove token max cap from admin adjust and claim
CREATE OR REPLACE FUNCTION public.rpc_admin_adjust_tokens(p_user_id uuid, p_delta integer, p_reason text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_new_balance integer;
BEGIN
  IF NOT is_admin(v_uid) THEN RAISE EXCEPTION 'Not admin'; END IF;
  
  INSERT INTO shot_tokens (user_id, balance) VALUES (p_user_id, 5)
  ON CONFLICT (user_id) DO NOTHING;
  
  UPDATE shot_tokens 
  SET balance = GREATEST(0, balance + p_delta),
      updated_at = now()
  WHERE user_id = p_user_id
  RETURNING balance INTO v_new_balance;
  
  INSERT INTO token_ledger (user_id, delta, reason, description)
  VALUES (p_user_id, p_delta, 'admin_adjustment', p_reason);
  
  RETURN jsonb_build_object('adjusted', true, 'new_balance', v_new_balance, 'delta', p_delta);
END;
$function$;

-- 5. Remove token max cap from ski claim
CREATE OR REPLACE FUNCTION public.rpc_claim_ski_award(p_award_id uuid, p_choice text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_award ski_daily_awards%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF p_choice NOT IN ('frikort', 'token') THEN RAISE EXCEPTION 'Invalid choice'; END IF;

  SELECT * INTO v_award FROM ski_daily_awards WHERE id = p_award_id FOR UPDATE;
  IF v_award IS NULL THEN RAISE EXCEPTION 'Award not found'; END IF;
  IF v_award.user_id != v_uid THEN RAISE EXCEPTION 'Not your award'; END IF;
  IF v_award.claimed THEN RAISE EXCEPTION 'Already claimed'; END IF;

  UPDATE ski_daily_awards
  SET claimed = true, reward_type = p_choice, claimed_at = now()
  WHERE id = p_award_id;

  IF p_choice = 'frikort' THEN
    INSERT INTO user_frikort (user_id, reason)
    VALUES (v_uid, 'ski_vertical_daily_winner');
  ELSIF p_choice = 'token' THEN
    UPDATE shot_tokens SET balance = balance + 1, updated_at = now()
    WHERE user_id = v_uid;
    IF NOT FOUND THEN
      INSERT INTO shot_tokens (user_id, balance) VALUES (v_uid, 6);
    END IF;
  END IF;

  INSERT INTO token_ledger (user_id, delta, reason, description)
  VALUES (v_uid, CASE WHEN p_choice = 'token' THEN 1 ELSE 0 END,
    'ski_daily_winner',
    'Mest høydemeter (' || round(v_award.vertical_meters::numeric) || 'm) → ' || p_choice);

  RETURN jsonb_build_object('claimed', true, 'choice', p_choice);
END;
$function$;

-- 6. Remove token max cap from bonus token
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
    UPDATE shot_tokens SET balance = balance + 1, updated_at = now()
    WHERE user_id = p_user_id;

    INSERT INTO shot_event_log (event_id, type, actor_id, payload)
    SELECT id, 'bonus_token', p_user_id, jsonb_build_object('reason', 'leads_by_2_plus')
    FROM shot_events
    WHERE selected_user_id = p_user_id AND group_id = p_group_id
    ORDER BY created_at DESC LIMIT 1;
  END IF;
END;
$function$;
