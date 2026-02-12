
-- Update rpc_confirm_shot: witness_deny now assigns a random checker instead of going straight to admin
CREATE OR REPLACE FUNCTION public.rpc_confirm_shot(p_event_id uuid, p_mode text, p_witness_id uuid DEFAULT NULL::uuid, p_dispute_reason text DEFAULT NULL::text, p_dispute_details text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_event shot_events%ROWTYPE;
  v_ban_until timestamptz;
  v_checker_id uuid;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  SELECT * INTO v_event FROM shot_events WHERE id = p_event_id FOR UPDATE;
  IF v_event IS NULL THEN RAISE EXCEPTION 'Event not found'; END IF;

  IF v_event.status NOT IN ('selected', 'confirmed', 'disputed', 'punished') THEN
    RAISE EXCEPTION 'Event not in confirmable state';
  END IF;

  IF p_mode = 'self' THEN
    IF v_uid != v_event.selected_user_id THEN RAISE EXCEPTION 'Only the selected user can self-confirm'; END IF;
    IF p_witness_id IS NULL THEN RAISE EXCEPTION 'Must choose a witness'; END IF;
    IF p_witness_id = v_uid THEN RAISE EXCEPTION 'Cannot choose yourself as witness'; END IF;
    UPDATE shot_events SET self_confirmed = true, chosen_witness_id = p_witness_id WHERE id = p_event_id;
    INSERT INTO shot_event_log (event_id, type, actor_id, payload)
    VALUES (p_event_id, 'self_confirmed', v_uid, jsonb_build_object('chosen_witness_id', p_witness_id));

  ELSIF p_mode = 'witness' THEN
    IF v_event.chosen_witness_id IS NULL THEN RAISE EXCEPTION 'No witness has been chosen yet'; END IF;
    IF v_uid != v_event.chosen_witness_id THEN RAISE EXCEPTION 'You are not the chosen witness'; END IF;
    UPDATE shot_events
    SET witness_confirmed_by = v_uid, witness_confirmed_at = now(), confirmed_at = now(), status = 'confirmed'
    WHERE id = p_event_id;
    INSERT INTO shot_event_log (event_id, type, actor_id, payload)
    VALUES (p_event_id, 'witness_confirmed', v_uid, jsonb_build_object('witness_id', v_uid));

  ELSIF p_mode = 'witness_deny' THEN
    IF v_event.chosen_witness_id IS NULL THEN RAISE EXCEPTION 'No witness has been chosen yet'; END IF;
    IF v_uid != v_event.chosen_witness_id THEN RAISE EXCEPTION 'You are not the chosen witness'; END IF;
    IF p_dispute_reason IS NULL THEN RAISE EXCEPTION 'Must provide a reason for denial'; END IF;

    v_ban_until := now() + interval '12 hours';

    -- Pick a random checker (not winner, not witness, not starter)
    SELECT id INTO v_checker_id
    FROM profiles
    WHERE is_active = true
      AND id != v_event.selected_user_id
      AND id != v_event.chosen_witness_id
      AND id != v_event.started_by
    ORDER BY random()
    LIMIT 1;

    UPDATE shot_events
    SET status = 'disputed',
        dispute_reason = p_dispute_reason,
        dispute_details = p_dispute_details,
        witness_confirmed_by = v_uid,
        witness_confirmed_at = now(),
        random_checker_id = v_checker_id
    WHERE id = p_event_id;

    -- Apply 12h ban to the selected user
    UPDATE shot_tokens
    SET shot_banned_until = v_ban_until, updated_at = now()
    WHERE user_id = v_event.selected_user_id;

    INSERT INTO shot_event_log (event_id, type, actor_id, payload)
    VALUES (p_event_id, 'witness_disputed', v_uid, 
      jsonb_build_object('witness_id', v_uid, 'reason', p_dispute_reason, 'details', p_dispute_details, 'banned_until', v_ban_until, 'random_checker_id', v_checker_id));

  ELSIF p_mode = 'refuse' THEN
    IF v_uid != v_event.selected_user_id THEN RAISE EXCEPTION 'Only the selected user can refuse'; END IF;

    v_ban_until := now() + interval '12 hours';

    UPDATE shot_events SET status = 'punished', punishment_applied_at = now() WHERE id = p_event_id;
    UPDATE shot_tokens SET shot_banned_until = v_ban_until, updated_at = now() WHERE user_id = v_uid;

    INSERT INTO shot_event_log (event_id, type, actor_id, payload)
    VALUES (p_event_id, 'refused', v_uid, jsonb_build_object('reason', 'refused', 'banned_until', v_ban_until));

  ELSIF p_mode = 'witness_timeout' THEN
    IF v_event.chosen_witness_id IS NULL THEN RAISE EXCEPTION 'No witness chosen'; END IF;

    v_ban_until := now() + interval '12 hours';

    UPDATE shot_events
    SET witness_confirmed_by = v_event.chosen_witness_id, witness_confirmed_at = now(),
        status = 'punished', punishment_applied_at = now()
    WHERE id = p_event_id;

    UPDATE shot_tokens SET shot_banned_until = v_ban_until, updated_at = now()
    WHERE user_id = v_event.selected_user_id;

    INSERT INTO shot_event_log (event_id, type, actor_id, payload)
    VALUES (p_event_id, 'witness_timeout', v_event.chosen_witness_id, 
      jsonb_build_object('reason', 'witness_timeout', 'banned_until', v_ban_until));

  ELSIF p_mode = 'admin_resolve' THEN
    -- Keep backward compat but prefer rpc_admin_resolve_shot
    IF NOT is_admin(v_uid) THEN RAISE EXCEPTION 'Only admin can resolve disputes'; END IF;
    IF v_event.status != 'disputed' THEN RAISE EXCEPTION 'Event is not in disputed state'; END IF;
    IF p_dispute_reason = 'confirm' THEN
      UPDATE shot_events SET status = 'confirmed', confirmed_at = now(), dispute_resolved_by = v_uid, dispute_resolved_at = now()
      WHERE id = p_event_id;
      UPDATE shot_tokens SET shot_banned_until = NULL, updated_at = now()
      WHERE user_id = v_event.selected_user_id;
      INSERT INTO shot_event_log (event_id, type, actor_id, payload)
      VALUES (p_event_id, 'admin_confirmed', v_uid, jsonb_build_object('verdict', 'confirmed', 'ban_lifted', true));
    ELSE
      UPDATE shot_events SET status = 'punished', punishment_applied_at = now(), dispute_resolved_by = v_uid, dispute_resolved_at = now()
      WHERE id = p_event_id;
      INSERT INTO shot_event_log (event_id, type, actor_id, payload)
      VALUES (p_event_id, 'admin_punished', v_uid, jsonb_build_object('verdict', 'punished'));
    END IF;

  ELSE
    RAISE EXCEPTION 'Invalid mode';
  END IF;

  SELECT * INTO v_event FROM shot_events WHERE id = p_event_id;
  RETURN jsonb_build_object('event_id', p_event_id, 'status', v_event.status, 'self_confirmed', v_event.self_confirmed, 'witness_confirmed_by', v_event.witness_confirmed_by, 'chosen_witness_id', v_event.chosen_witness_id, 'dispute_reason', v_event.dispute_reason, 'random_checker_id', v_event.random_checker_id);
END;
$$;
