
CREATE OR REPLACE FUNCTION public.rpc_check_shot_ban()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_last_punishment timestamptz;
  v_last_start_after timestamptz;
  v_started_today int;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  -- 1) Check unresolved punishment (existing logic)
  SELECT MAX(punishment_applied_at) INTO v_last_punishment
  FROM shot_events
  WHERE selected_user_id = v_uid AND status = 'punished';

  IF v_last_punishment IS NOT NULL THEN
    SELECT MAX(created_at) INTO v_last_start_after
    FROM shot_events
    WHERE started_by = v_uid AND created_at > v_last_punishment;

    IF v_last_start_after IS NULL THEN
      RETURN jsonb_build_object('banned', true, 'reason', 'unresolved_punishment', 'since', v_last_punishment);
    END IF;
  END IF;

  -- 2) Check if user started at least one round today (UTC date)
  SELECT count(*) INTO v_started_today
  FROM shot_events
  WHERE started_by = v_uid
    AND created_at::date = now()::date;

  IF v_started_today = 0 THEN
    RETURN jsonb_build_object('banned', true, 'reason', 'no_round_today');
  END IF;

  RETURN jsonb_build_object('banned', false);
END;
$function$;
