
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

  -- Must be above 1560m and moving > 10 km/h (2.78 m/s)
  IF p_altitude < 1560 THEN
    RETURN jsonb_build_object('recorded', false, 'reason', 'altitude_too_low');
  END IF;
  IF p_speed < 2.78 THEN
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

  -- Calculate vertical change - only count DESCENT (going down)
  IF v_prev_altitude IS NOT NULL AND p_altitude < v_prev_altitude THEN
    v_vertical_gain := v_prev_altitude - p_altitude;
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
