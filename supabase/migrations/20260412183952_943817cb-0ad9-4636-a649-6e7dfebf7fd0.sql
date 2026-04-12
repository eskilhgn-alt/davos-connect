
-- 1. rpc_get_shot_tokens: returns current user's token balance
CREATE OR REPLACE FUNCTION public.rpc_get_shot_tokens()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_balance int;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT balance INTO v_balance FROM shot_tokens WHERE user_id = v_uid;
  IF v_balance IS NULL THEN
    INSERT INTO shot_tokens (user_id, balance) VALUES (v_uid, 5)
    ON CONFLICT (user_id) DO NOTHING;
    v_balance := 5;
  END IF;
  RETURN jsonb_build_object('balance', v_balance);
END;
$$;

-- 2. rpc_get_all_shot_tokens: returns all users' tokens with display names
CREATE OR REPLACE FUNCTION public.rpc_get_all_shot_tokens()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  RETURN (
    SELECT jsonb_agg(row_to_json(t)::jsonb ORDER BY t.balance DESC)
    FROM (
      SELECT
        p.id AS user_id,
        COALESCE(p.nickname, p.full_name, p.email) AS display_name,
        COALESCE(st.balance, 5) AS balance
      FROM profiles p
      LEFT JOIN shot_tokens st ON st.user_id = p.id
      WHERE p.is_active = true
    ) t
  );
END;
$$;

-- 3. rpc_start_shot_round: starts a round with 5% monster chance
CREATE OR REPLACE FUNCTION public.rpc_start_shot_round(p_group_id text DEFAULT 'global')
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_active_count int;
  v_event_id uuid;
  v_is_monster boolean := false;
  v_monster_round_id uuid;
  v_member RECORD;
  v_total_users int := 0;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  -- Block if a countdown is already running
  SELECT count(*) INTO v_active_count
  FROM shot_events WHERE group_id = p_group_id AND status IN ('countdown', 'selected') AND monster_round_id IS NULL;
  IF v_active_count > 0 THEN RAISE EXCEPTION 'En runde er allerede aktiv'; END IF;

  -- Check for monster round (5% chance)
  IF random() < 0.05 THEN
    v_is_monster := true;
    v_monster_round_id := gen_random_uuid();

    FOR v_member IN
      SELECT p.id FROM profiles p WHERE p.is_active = true ORDER BY random()
    LOOP
      INSERT INTO shot_events (started_by, status, selected_user_id, selected_at, deadline_at, group_id, monster_round_id)
      VALUES (v_uid, 'selected', v_member.id, now(), now() + interval '30 minutes', p_group_id, v_monster_round_id)
      RETURNING id INTO v_event_id;

      INSERT INTO shot_event_log (event_id, type, actor_id, payload)
      VALUES (v_event_id, 'monster_selected', v_uid, jsonb_build_object('user_id', v_member.id));

      v_total_users := v_total_users + 1;
    END LOOP;

    RETURN jsonb_build_object('is_monster', true, 'monster_round_id', v_monster_round_id, 'total_users', v_total_users);
  END IF;

  -- Normal round: create countdown
  INSERT INTO shot_events (started_by, status, countdown_ends_at, group_id)
  VALUES (v_uid, 'countdown', now() + interval '10 seconds', p_group_id)
  RETURNING id INTO v_event_id;

  INSERT INTO shot_event_log (event_id, type, actor_id, payload)
  VALUES
    (v_event_id, 'pressed', v_uid, jsonb_build_object('user_id', v_uid)),
    (v_event_id, 'countdown_started', v_uid, jsonb_build_object('ends_at', now() + interval '10 seconds'));

  RETURN jsonb_build_object('is_monster', false, 'event_id', v_event_id, 'status', 'countdown', 'countdown_ends_at', now() + interval '10 seconds');
END;
$$;

-- 4. rpc_use_frikort: use a frikort to skip a shot
CREATE OR REPLACE FUNCTION public.rpc_use_frikort(p_event_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_event shot_events%ROWTYPE;
  v_frikort_id uuid;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  SELECT * INTO v_event FROM shot_events WHERE id = p_event_id FOR UPDATE;
  IF v_event IS NULL THEN RAISE EXCEPTION 'Event not found'; END IF;
  IF v_event.selected_user_id != v_uid THEN RAISE EXCEPTION 'Du er ikke trukket i denne runden'; END IF;
  IF v_event.status != 'selected' THEN RAISE EXCEPTION 'Runden er ikke i riktig status'; END IF;

  -- Find an unused frikort
  SELECT id INTO v_frikort_id FROM user_frikort
  WHERE user_id = v_uid AND used_at IS NULL
  ORDER BY earned_at ASC LIMIT 1;

  IF v_frikort_id IS NULL THEN RAISE EXCEPTION 'Du har ingen frikort'; END IF;

  -- Use the frikort
  UPDATE user_frikort SET used_at = now(), used_event_id = p_event_id WHERE id = v_frikort_id;

  -- Mark event as confirmed (frikort counts as confirmed)
  UPDATE shot_events SET status = 'confirmed', confirmed_at = now(), self_confirmed = true WHERE id = p_event_id;

  INSERT INTO shot_event_log (event_id, type, actor_id, payload)
  VALUES (p_event_id, 'frikort_used', v_uid, jsonb_build_object('frikort_id', v_frikort_id));

  RETURN jsonb_build_object('success', true, 'frikort_id', v_frikort_id);
END;
$$;

-- 5. rpc_admin_adjust_tokens: admin adjusts user tokens
CREATE OR REPLACE FUNCTION public.rpc_admin_adjust_tokens(p_user_id uuid, p_delta int, p_reason text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_new_balance int;
BEGIN
  IF NOT is_admin(v_uid) THEN RAISE EXCEPTION 'Not admin'; END IF;

  -- Ensure row exists
  INSERT INTO shot_tokens (user_id, balance) VALUES (p_user_id, 5)
  ON CONFLICT (user_id) DO NOTHING;

  UPDATE shot_tokens SET balance = balance + p_delta, updated_at = now()
  WHERE user_id = p_user_id
  RETURNING balance INTO v_new_balance;

  -- Log in token_ledger
  INSERT INTO token_ledger (user_id, delta, reason, description)
  VALUES (p_user_id, p_delta, 'admin_adjustment', p_reason);

  RETURN jsonb_build_object('new_balance', v_new_balance, 'delta', p_delta);
END;
$$;

-- 6. rpc_award_points: award points to a user
CREATE OR REPLACE FUNCTION public.rpc_award_points(p_user_id uuid, p_points int, p_reason text, p_description text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_total int;
BEGIN
  IF NOT is_admin(v_uid) THEN RAISE EXCEPTION 'Not admin'; END IF;

  -- Insert into points_ledger
  INSERT INTO points_ledger (user_id, points, reason, description)
  VALUES (p_user_id, p_points, p_reason, p_description);

  -- Upsert user_points
  INSERT INTO user_points (user_id, total_points)
  VALUES (p_user_id, p_points)
  ON CONFLICT (user_id) DO UPDATE SET total_points = user_points.total_points + p_points, updated_at = now();

  SELECT total_points INTO v_total FROM user_points WHERE user_id = p_user_id;

  RETURN jsonb_build_object('total_points', v_total, 'awarded', p_points);
END;
$$;

-- 7. rpc_get_shot_leaderboard: shot stats per user
CREATE OR REPLACE FUNCTION public.rpc_get_shot_leaderboard(p_group_id text DEFAULT 'global', p_days int DEFAULT 9999)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_since timestamptz := now() - (p_days || ' days')::interval;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  RETURN (
    SELECT COALESCE(jsonb_agg(row_to_json(t)::jsonb), '[]'::jsonb)
    FROM (
      SELECT
        p.id AS user_id,
        COALESCE(p.nickname, p.full_name, p.email) AS display_name,
        COUNT(*) FILTER (WHERE se.selected_user_id = p.id AND se.status IN ('selected','confirmed','punished','disputed','overdue')) AS times_selected,
        COUNT(*) FILTER (WHERE se.selected_user_id = p.id AND se.status = 'confirmed') AS times_confirmed,
        COUNT(*) FILTER (WHERE se.selected_user_id = p.id AND se.status = 'punished') AS times_punished,
        COUNT(*) FILTER (WHERE se.started_by = p.id) AS times_started,
        COUNT(*) FILTER (WHERE se.chosen_witness_id = p.id OR se.witness_confirmed_by = p.id) AS times_witnessed,
        0 AS times_refused
      FROM profiles p
      LEFT JOIN shot_events se ON (se.selected_user_id = p.id OR se.started_by = p.id OR se.chosen_witness_id = p.id OR se.witness_confirmed_by = p.id)
        AND se.group_id = p_group_id
        AND se.created_at >= v_since
      WHERE p.is_active = true
      GROUP BY p.id, p.nickname, p.full_name, p.email
      HAVING COUNT(*) FILTER (WHERE se.selected_user_id = p.id OR se.started_by = p.id) > 0
      ORDER BY COUNT(*) FILTER (WHERE se.selected_user_id = p.id AND se.status IN ('selected','confirmed','punished','disputed','overdue')) DESC
    ) t
  );
END;
$$;

-- 8. rpc_get_points_leaderboard
CREATE OR REPLACE FUNCTION public.rpc_get_points_leaderboard(p_days int DEFAULT 9999)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  RETURN (
    SELECT COALESCE(jsonb_agg(row_to_json(t)::jsonb ORDER BY t.total_points DESC), '[]'::jsonb)
    FROM (
      SELECT
        p.id AS user_id,
        COALESCE(p.nickname, p.full_name, p.email) AS display_name,
        COALESCE(up.total_points, 0) AS total_points,
        0 AS recent_points
      FROM profiles p
      LEFT JOIN user_points up ON up.user_id = p.id
      WHERE p.is_active = true
    ) t
  );
END;
$$;

-- 9. rpc_get_ski_leaderboard
CREATE OR REPLACE FUNCTION public.rpc_get_ski_leaderboard(p_days int DEFAULT 7)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_since date := CURRENT_DATE - p_days;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  RETURN (
    SELECT COALESCE(jsonb_agg(row_to_json(t)::jsonb ORDER BY t.total_vertical DESC), '[]'::jsonb)
    FROM (
      SELECT
        p.id AS user_id,
        COALESCE(p.nickname, p.full_name, p.email) AS display_name,
        COALESCE(SUM(sdv.vertical_meters), 0) AS total_vertical,
        COUNT(DISTINCT sdv.day_date) AS active_days,
        COALESCE((SELECT COUNT(*) FROM user_frikort uf WHERE uf.user_id = p.id AND uf.used_at IS NULL), 0) AS frikort_count
      FROM profiles p
      LEFT JOIN ski_daily_vertical sdv ON sdv.user_id = p.id AND sdv.day_date >= v_since
      WHERE p.is_active = true
      GROUP BY p.id, p.nickname, p.full_name, p.email
      HAVING COALESCE(SUM(sdv.vertical_meters), 0) > 0
    ) t
  );
END;
$$;

-- 10. rpc_claim_ski_award
CREATE OR REPLACE FUNCTION public.rpc_claim_ski_award(p_award_id uuid, p_choice text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_award ski_daily_awards%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF p_choice NOT IN ('frikort', 'token') THEN RAISE EXCEPTION 'Invalid choice'; END IF;

  SELECT * INTO v_award FROM ski_daily_awards WHERE id = p_award_id AND user_id = v_uid FOR UPDATE;
  IF v_award IS NULL THEN RAISE EXCEPTION 'Award not found'; END IF;
  IF v_award.claimed THEN RAISE EXCEPTION 'Already claimed'; END IF;

  UPDATE ski_daily_awards SET claimed = true, claimed_at = now(), reward_type = p_choice WHERE id = p_award_id;

  IF p_choice = 'frikort' THEN
    INSERT INTO user_frikort (user_id, reason) VALUES (v_uid, 'ski_daily_winner');
  ELSIF p_choice = 'token' THEN
    INSERT INTO shot_tokens (user_id, balance) VALUES (v_uid, 6) ON CONFLICT (user_id) DO UPDATE SET balance = shot_tokens.balance + 1, updated_at = now();
    INSERT INTO token_ledger (user_id, delta, reason, description) VALUES (v_uid, 1, 'ski_daily_winner', 'Mest høydemeter');
  END IF;

  RETURN jsonb_build_object('claimed', true, 'choice', p_choice);
END;
$$;

-- 11. rpc_record_ski_sample
CREATE OR REPLACE FUNCTION public.rpc_record_ski_sample(p_altitude float, p_speed float, p_lat float DEFAULT NULL, p_lon float DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_prev_alt float;
  v_descent float;
  v_today date := CURRENT_DATE;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  -- Insert raw sample
  INSERT INTO ski_altitude_samples (user_id, altitude, speed, lat, lon)
  VALUES (v_uid, p_altitude, p_speed, p_lat, p_lon);

  -- Get previous altitude to calc descent
  SELECT altitude INTO v_prev_alt
  FROM ski_altitude_samples
  WHERE user_id = v_uid
  ORDER BY recorded_at DESC
  OFFSET 1 LIMIT 1;

  IF v_prev_alt IS NOT NULL AND v_prev_alt > p_altitude THEN
    v_descent := v_prev_alt - p_altitude;
    -- Upsert daily vertical
    INSERT INTO ski_daily_vertical (user_id, day_date, vertical_meters, sample_count)
    VALUES (v_uid, v_today, v_descent, 1)
    ON CONFLICT (user_id, day_date) DO UPDATE
    SET vertical_meters = ski_daily_vertical.vertical_meters + v_descent,
        sample_count = ski_daily_vertical.sample_count + 1,
        updated_at = now();
  END IF;

  RETURN jsonb_build_object('recorded', true, 'altitude', p_altitude);
END;
$$;

-- 12. rpc_get_gamification_leaderboard
CREATE OR REPLACE FUNCTION public.rpc_get_gamification_leaderboard()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  RETURN (
    SELECT COALESCE(jsonb_agg(row_to_json(t)::jsonb ORDER BY t.total_points DESC), '[]'::jsonb)
    FROM (
      SELECT
        p.id AS user_id,
        COALESCE(p.nickname, p.full_name, p.email) AS display_name,
        COALESCE(up.total_points, 0) AS total_points,
        COALESCE(us.current_streak, 0) AS current_streak,
        COALESCE(us.best_streak, 0) AS best_streak,
        COALESCE(st.balance, 5) AS token_balance,
        -- Shot stats
        (SELECT COUNT(*) FROM shot_events se WHERE se.selected_user_id = p.id AND se.status IN ('selected','confirmed','punished','disputed','overdue'))::int AS shots_selected,
        (SELECT COUNT(*) FROM shot_events se WHERE se.selected_user_id = p.id AND se.status = 'confirmed')::int AS shots_confirmed,
        (SELECT COUNT(*) FROM shot_events se WHERE se.selected_user_id = p.id AND se.status = 'punished')::int AS shots_punished,
        0 AS shots_refused,
        (SELECT COUNT(*) FROM shot_events se WHERE se.started_by = p.id)::int AS rounds_started,
        (SELECT COUNT(*) FROM shot_events se WHERE se.chosen_witness_id = p.id OR se.witness_confirmed_by = p.id)::int AS times_witnessed,
        -- Ski stats
        COALESCE((SELECT SUM(sdv.vertical_meters) FROM ski_daily_vertical sdv WHERE sdv.user_id = p.id), 0) AS ski_total_vertical,
        (SELECT COUNT(DISTINCT sdv.day_date) FROM ski_daily_vertical sdv WHERE sdv.user_id = p.id)::int AS ski_active_days,
        COALESCE((SELECT sdv.vertical_meters FROM ski_daily_vertical sdv WHERE sdv.user_id = p.id AND sdv.day_date = CURRENT_DATE), 0) AS ski_today_vertical,
        -- Frikort
        (SELECT COUNT(*) FROM user_frikort uf WHERE uf.user_id = p.id)::int AS frikort_earned,
        (SELECT COUNT(*) FROM user_frikort uf WHERE uf.user_id = p.id AND uf.used_at IS NOT NULL)::int AS frikort_used,
        (SELECT COUNT(*) FROM user_frikort uf WHERE uf.user_id = p.id AND uf.used_at IS NULL)::int AS frikort_available,
        -- Chat stats
        (SELECT COUNT(*) FROM messages m WHERE m.sender_id = p.id::text AND m.deleted_at IS NULL)::int AS messages_sent,
        (SELECT COUNT(*) FROM attachments a JOIN messages m ON a.message_id = m.id WHERE m.sender_id = p.id::text)::int AS media_shared,
        (SELECT COUNT(*) FROM stories s WHERE s.user_id = p.id)::int AS stories_posted,
        -- Success rate
        CASE
          WHEN (SELECT COUNT(*) FROM shot_events se WHERE se.selected_user_id = p.id AND se.status IN ('selected','confirmed','punished')) > 0
          THEN ROUND(100.0 * (SELECT COUNT(*) FROM shot_events se WHERE se.selected_user_id = p.id AND se.status = 'confirmed') / NULLIF((SELECT COUNT(*) FROM shot_events se WHERE se.selected_user_id = p.id AND se.status IN ('selected','confirmed','punished')), 0))::int
          ELSE 0
        END AS shot_success_rate
      FROM profiles p
      LEFT JOIN user_points up ON up.user_id = p.id
      LEFT JOIN user_streaks us ON us.user_id = p.id
      LEFT JOIN shot_tokens st ON st.user_id = p.id
      WHERE p.is_active = true
    ) t
  );
END;
$$;

-- Add unique constraint on ski_daily_vertical if missing (needed for ON CONFLICT)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ski_daily_vertical_user_id_day_date_key'
  ) THEN
    ALTER TABLE ski_daily_vertical ADD CONSTRAINT ski_daily_vertical_user_id_day_date_key UNIQUE (user_id, day_date);
  END IF;
END $$;
