-- Simplified shot start: no token requirement, anyone can start anytime
CREATE OR REPLACE FUNCTION public.rpc_start_shot_simple(p_group_id text DEFAULT 'global'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_active_count int;
  v_event_id uuid;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  -- Block if a countdown is already running
  SELECT count(*) INTO v_active_count
  FROM shot_events WHERE group_id = p_group_id AND status = 'countdown';
  IF v_active_count > 0 THEN RAISE EXCEPTION 'Countdown already in progress'; END IF;

  -- Create countdown event (no token deduction)
  INSERT INTO shot_events (started_by, status, countdown_ends_at, group_id)
  VALUES (v_uid, 'countdown', now() + interval '10 seconds', p_group_id)
  RETURNING id INTO v_event_id;

  INSERT INTO shot_event_log (event_id, type, actor_id, payload)
  VALUES
    (v_event_id, 'pressed', v_uid, jsonb_build_object('user_id', v_uid)),
    (v_event_id, 'countdown_started', v_uid, jsonb_build_object('ends_at', now() + interval '10 seconds'));

  RETURN jsonb_build_object('event_id', v_event_id, 'status', 'countdown', 'countdown_ends_at', now() + interval '10 seconds');
END;
$function$;