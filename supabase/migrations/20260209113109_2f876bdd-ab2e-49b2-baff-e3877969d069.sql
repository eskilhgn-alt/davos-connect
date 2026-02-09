
-- Ski altitude samples (raw GPS data for vertical calculation)
CREATE TABLE public.ski_altitude_samples (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  altitude double precision NOT NULL,
  speed double precision, -- m/s
  lat double precision,
  lon double precision,
  recorded_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_ski_samples_user_time ON public.ski_altitude_samples (user_id, recorded_at DESC);

ALTER TABLE public.ski_altitude_samples ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can insert own samples" ON public.ski_altitude_samples
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can read own samples" ON public.ski_altitude_samples
  FOR SELECT USING (auth.uid() = user_id);

-- Daily aggregated vertical meters per user
CREATE TABLE public.ski_daily_vertical (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  day_date date NOT NULL DEFAULT CURRENT_DATE,
  vertical_meters double precision NOT NULL DEFAULT 0,
  sample_count int NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, day_date)
);

ALTER TABLE public.ski_daily_vertical ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read all vertical" ON public.ski_daily_vertical
  FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "Users can insert own vertical" ON public.ski_daily_vertical
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own vertical" ON public.ski_daily_vertical
  FOR UPDATE USING (auth.uid() = user_id);

-- Frikort (free passes to skip a shot)
CREATE TABLE public.user_frikort (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  earned_at timestamptz NOT NULL DEFAULT now(),
  reason text NOT NULL DEFAULT 'ski_vertical_daily_winner',
  used_at timestamptz,
  used_event_id uuid REFERENCES public.shot_events(id)
);

ALTER TABLE public.user_frikort ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read all frikort" ON public.user_frikort
  FOR SELECT USING (auth.uid() IS NOT NULL);

-- Ski daily awards (unclaimed rewards for daily winner)
CREATE TABLE public.ski_daily_awards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  day_date date NOT NULL,
  vertical_meters double precision NOT NULL,
  claimed boolean NOT NULL DEFAULT false,
  reward_type text, -- 'frikort' or 'token', null if unclaimed
  claimed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, day_date)
);

ALTER TABLE public.ski_daily_awards ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read all awards" ON public.ski_daily_awards
  FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "Users can update own awards" ON public.ski_daily_awards
  FOR UPDATE USING (auth.uid() = user_id);

-- Enable realtime for vertical tracking
ALTER PUBLICATION supabase_realtime ADD TABLE public.ski_daily_vertical;
ALTER PUBLICATION supabase_realtime ADD TABLE public.ski_daily_awards;

-- RPC: Record a ski altitude sample and calculate vertical
CREATE OR REPLACE FUNCTION public.rpc_record_ski_sample(
  p_altitude double precision,
  p_speed double precision,
  p_lat double precision DEFAULT NULL,
  p_lon double precision DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_prev_altitude double precision;
  v_vertical_gain double precision := 0;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  -- Must be above 1560m and moving > 15 km/h (4.17 m/s)
  IF p_altitude < 1560 THEN
    RETURN jsonb_build_object('recorded', false, 'reason', 'altitude_too_low');
  END IF;
  IF p_speed < 4.17 THEN
    RETURN jsonb_build_object('recorded', false, 'reason', 'speed_too_low');
  END IF;

  -- Get previous altitude sample (within last 5 min to avoid stale data)
  SELECT altitude INTO v_prev_altitude
  FROM ski_altitude_samples
  WHERE user_id = v_uid AND recorded_at > now() - interval '5 minutes'
  ORDER BY recorded_at DESC
  LIMIT 1;

  -- Insert sample
  INSERT INTO ski_altitude_samples (user_id, altitude, speed, lat, lon)
  VALUES (v_uid, p_altitude, p_speed, p_lat, p_lon);

  -- Calculate vertical change
  IF v_prev_altitude IS NOT NULL THEN
    v_vertical_gain := ABS(p_altitude - v_prev_altitude);
    -- Filter GPS noise (< 2m change)
    IF v_vertical_gain < 2 THEN
      v_vertical_gain := 0;
    END IF;
  END IF;

  -- Upsert daily vertical
  INSERT INTO ski_daily_vertical (user_id, day_date, vertical_meters, sample_count)
  VALUES (v_uid, CURRENT_DATE, v_vertical_gain, 1)
  ON CONFLICT (user_id, day_date)
  DO UPDATE SET
    vertical_meters = ski_daily_vertical.vertical_meters + v_vertical_gain,
    sample_count = ski_daily_vertical.sample_count + 1,
    updated_at = now();

  RETURN jsonb_build_object('recorded', true, 'vertical_gain', round(v_vertical_gain::numeric, 1));
END;
$$;

-- RPC: Use frikort to skip a shot
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
  IF v_event.status != 'selected' THEN RAISE EXCEPTION 'Event not in selected state'; END IF;
  IF v_event.selected_user_id != v_uid THEN RAISE EXCEPTION 'You are not the selected user'; END IF;

  -- Find oldest unused frikort
  SELECT id INTO v_frikort_id FROM user_frikort
  WHERE user_id = v_uid AND used_at IS NULL
  ORDER BY earned_at ASC
  LIMIT 1
  FOR UPDATE;

  IF v_frikort_id IS NULL THEN RAISE EXCEPTION 'No frikort available'; END IF;

  -- Use frikort
  UPDATE user_frikort SET used_at = now(), used_event_id = p_event_id WHERE id = v_frikort_id;

  -- Mark event as confirmed (skipped without penalty)
  UPDATE shot_events SET status = 'confirmed', confirmed_at = now() WHERE id = p_event_id;

  INSERT INTO shot_event_log (event_id, type, actor_id, payload)
  VALUES (p_event_id, 'frikort_used', v_uid, jsonb_build_object('frikort_id', v_frikort_id));

  RETURN jsonb_build_object('event_id', p_event_id, 'status', 'confirmed', 'frikort_used', true);
END;
$$;

-- RPC: Claim daily ski award (choose frikort or token)
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

  SELECT * INTO v_award FROM ski_daily_awards WHERE id = p_award_id FOR UPDATE;
  IF v_award IS NULL THEN RAISE EXCEPTION 'Award not found'; END IF;
  IF v_award.user_id != v_uid THEN RAISE EXCEPTION 'Not your award'; END IF;
  IF v_award.claimed THEN RAISE EXCEPTION 'Already claimed'; END IF;

  -- Mark claimed
  UPDATE ski_daily_awards
  SET claimed = true, reward_type = p_choice, claimed_at = now()
  WHERE id = p_award_id;

  IF p_choice = 'frikort' THEN
    INSERT INTO user_frikort (user_id, reason)
    VALUES (v_uid, 'ski_vertical_daily_winner');
  ELSIF p_choice = 'token' THEN
    UPDATE shot_tokens SET balance = LEAST(balance + 1, 5), updated_at = now()
    WHERE user_id = v_uid;
    -- If no row yet, insert
    IF NOT FOUND THEN
      INSERT INTO shot_tokens (user_id, balance) VALUES (v_uid, 5);
    END IF;
  END IF;

  -- Log in token ledger
  INSERT INTO token_ledger (user_id, delta, reason, description)
  VALUES (v_uid, CASE WHEN p_choice = 'token' THEN 1 ELSE 0 END,
    'ski_daily_winner',
    'Mest høydemeter (' || round(v_award.vertical_meters::numeric) || 'm) → ' || p_choice);

  RETURN jsonb_build_object('claimed', true, 'choice', p_choice);
END;
$$;

-- RPC: Award daily ski winner (called by cron)
CREATE OR REPLACE FUNCTION public.rpc_award_ski_daily_winner()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_winner record;
  v_yesterday date := CURRENT_DATE - 1;
  v_existing int;
BEGIN
  -- Check if already awarded for yesterday
  SELECT count(*) INTO v_existing FROM ski_daily_awards WHERE day_date = v_yesterday;
  IF v_existing > 0 THEN
    RETURN jsonb_build_object('awarded', false, 'reason', 'already_awarded');
  END IF;

  -- Find user with most vertical meters yesterday
  SELECT sdv.user_id, sdv.vertical_meters INTO v_winner
  FROM ski_daily_vertical sdv
  WHERE sdv.day_date = v_yesterday AND sdv.vertical_meters > 100  -- minimum 100m to qualify
  ORDER BY sdv.vertical_meters DESC
  LIMIT 1;

  IF v_winner IS NULL THEN
    RETURN jsonb_build_object('awarded', false, 'reason', 'no_qualifying_data');
  END IF;

  -- Create unclaimed award
  INSERT INTO ski_daily_awards (user_id, day_date, vertical_meters)
  VALUES (v_winner.user_id, v_yesterday, v_winner.vertical_meters);

  RETURN jsonb_build_object('awarded', true, 'user_id', v_winner.user_id, 'vertical_meters', v_winner.vertical_meters);
END;
$$;

-- RPC: Get ski stats for leaderboard
CREATE OR REPLACE FUNCTION public.rpc_get_ski_leaderboard(p_days int DEFAULT 7)
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
      COALESCE(SUM(sdv.vertical_meters), 0) as total_vertical,
      COUNT(sdv.id) as active_days,
      COALESCE(
        (SELECT count(*) FROM user_frikort uf WHERE uf.user_id = p.id AND uf.used_at IS NULL), 0
      ) as frikort_count
    FROM profiles p
    LEFT JOIN ski_daily_vertical sdv ON sdv.user_id = p.id
      AND sdv.day_date >= CURRENT_DATE - p_days
    WHERE p.is_active = true
    GROUP BY p.id, p.nickname, p.full_name, p.email
    HAVING COALESCE(SUM(sdv.vertical_meters), 0) > 0
    ORDER BY total_vertical DESC
  ) t;

  RETURN COALESCE(v_result, '[]'::jsonb);
END;
$$;
