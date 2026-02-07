
-- Update rpc_confirm_shot to support "refuse" mode (winner refuses, gets 2 penalty shots)
-- and "witness_timeout" mode (auto-penalty if witness doesn't respond)
CREATE OR REPLACE FUNCTION public.rpc_confirm_shot(p_event_id uuid, p_mode text, p_witness_id uuid DEFAULT NULL::uuid)
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

  ELSIF p_mode = 'witness_deny' THEN
    IF v_event.chosen_witness_id IS NULL THEN
      RAISE EXCEPTION 'No witness has been chosen yet';
    END IF;
    IF v_uid != v_event.chosen_witness_id THEN
      RAISE EXCEPTION 'You are not the chosen witness';
    END IF;
    UPDATE shot_events
    SET witness_confirmed_by = v_uid,
        witness_confirmed_at = now(),
        status = 'punished',
        punishment_applied_at = now()
    WHERE id = p_event_id;

    INSERT INTO shot_event_log (event_id, type, actor_id, payload)
    VALUES (p_event_id, 'witness_denied', v_uid, jsonb_build_object('witness_id', v_uid, 'penalty_shots', 1));

  ELSIF p_mode = 'refuse' THEN
    -- Winner refuses to take the shot → 2 penalty shots
    IF v_uid != v_event.selected_user_id THEN
      RAISE EXCEPTION 'Only the selected user can refuse';
    END IF;
    UPDATE shot_events
    SET status = 'punished',
        punishment_applied_at = now()
    WHERE id = p_event_id;

    INSERT INTO shot_event_log (event_id, type, actor_id, payload)
    VALUES (p_event_id, 'refused', v_uid, jsonb_build_object('penalty_shots', 2, 'reason', 'refused'));

  ELSIF p_mode = 'witness_timeout' THEN
    -- Witness didn't respond in time → confirmed anyway (benefit of doubt to winner)
    IF v_event.chosen_witness_id IS NULL THEN
      RAISE EXCEPTION 'No witness chosen';
    END IF;
    UPDATE shot_events
    SET witness_confirmed_by = v_event.chosen_witness_id,
        witness_confirmed_at = now(),
        confirmed_at = now(),
        status = 'confirmed'
    WHERE id = p_event_id;

    INSERT INTO shot_event_log (event_id, type, actor_id, payload)
    VALUES (p_event_id, 'witness_timeout', v_event.chosen_witness_id, jsonb_build_object('auto_confirmed', true));

  ELSE
    RAISE EXCEPTION 'Invalid mode';
  END IF;

  SELECT * INTO v_event FROM shot_events WHERE id = p_event_id;
  RETURN jsonb_build_object('event_id', p_event_id, 'status', v_event.status, 'self_confirmed', v_event.self_confirmed, 'witness_confirmed_by', v_event.witness_confirmed_by, 'chosen_witness_id', v_event.chosen_witness_id);
END;
$function$;
