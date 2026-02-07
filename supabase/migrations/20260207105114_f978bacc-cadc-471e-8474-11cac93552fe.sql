
-- RPC to check if user is "banned" (has unresolved punishment)
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
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  -- Find latest punishment for this user
  SELECT MAX(punishment_applied_at) INTO v_last_punishment
  FROM shot_events
  WHERE selected_user_id = v_uid AND status = 'punished';

  IF v_last_punishment IS NULL THEN
    RETURN jsonb_build_object('banned', false);
  END IF;

  -- Check if user started a round AFTER the punishment
  SELECT MAX(created_at) INTO v_last_start_after
  FROM shot_events
  WHERE started_by = v_uid AND created_at > v_last_punishment;

  IF v_last_start_after IS NOT NULL THEN
    RETURN jsonb_build_object('banned', false);
  END IF;

  RETURN jsonb_build_object('banned', true, 'since', v_last_punishment);
END;
$function$;
