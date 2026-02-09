
-- Function to award point to fastest skier of the day (yesterday)
CREATE OR REPLACE FUNCTION public.rpc_award_ski_speed_winner()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_winner record;
  v_yesterday date := CURRENT_DATE - 1;
  v_existing int;
BEGIN
  -- Check if already awarded for yesterday
  SELECT count(*) INTO v_existing 
  FROM points_ledger 
  WHERE reason = 'ski_speed_daily_winner' 
    AND created_at::date = CURRENT_DATE
    AND description LIKE '%' || v_yesterday::text || '%';
  
  IF v_existing > 0 THEN
    RETURN jsonb_build_object('awarded', false, 'reason', 'already_awarded');
  END IF;

  -- Find user with highest max_speed_kmh yesterday
  SELECT ssr.user_id, ssr.max_speed_kmh INTO v_winner
  FROM ski_speed_records ssr
  WHERE ssr.day_date = v_yesterday AND ssr.max_speed_kmh > 20  -- minimum 20 km/h to qualify
  ORDER BY ssr.max_speed_kmh DESC
  LIMIT 1;

  IF v_winner IS NULL THEN
    RETURN jsonb_build_object('awarded', false, 'reason', 'no_qualifying_data');
  END IF;

  -- Award 1 point via existing rpc_award_points
  PERFORM rpc_award_points(
    v_winner.user_id, 
    1, 
    'ski_speed_daily_winner',
    'Raskest på ski ' || v_yesterday::text || ' (' || round(v_winner.max_speed_kmh::numeric, 1) || ' km/t)'
  );

  RETURN jsonb_build_object(
    'awarded', true, 
    'user_id', v_winner.user_id, 
    'max_speed_kmh', v_winner.max_speed_kmh,
    'day', v_yesterday
  );
END;
$function$;
