
-- 1. Add dispute columns to shot_events
ALTER TABLE public.shot_events ADD COLUMN IF NOT EXISTS dispute_reason text;
ALTER TABLE public.shot_events ADD COLUMN IF NOT EXISTS dispute_details text;
ALTER TABLE public.shot_events ADD COLUMN IF NOT EXISTS dispute_resolved_by uuid;
ALTER TABLE public.shot_events ADD COLUMN IF NOT EXISTS dispute_resolved_at timestamptz;

-- 2. Add ban columns to profiles
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS is_banned boolean NOT NULL DEFAULT false;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS banned_at timestamptz;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS ban_reason text;

-- 3. Add punishment deadline to shot_events (for tracking 15 min punishment timeout)
ALTER TABLE public.shot_events ADD COLUMN IF NOT EXISTS punishment_deadline_at timestamptz;

-- 4. Update rpc_confirm_shot to handle 'witness_dispute' mode
CREATE OR REPLACE FUNCTION public.rpc_confirm_shot(p_event_id uuid, p_mode text, p_witness_id uuid DEFAULT NULL::uuid, p_dispute_reason text DEFAULT NULL::text, p_dispute_details text DEFAULT NULL::text)
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

  IF v_event.status NOT IN ('selected', 'confirmed', 'disputed') THEN
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
    -- Witness denies: does NOT auto-punish, sends to dispute
    IF v_event.chosen_witness_id IS NULL THEN
      RAISE EXCEPTION 'No witness has been chosen yet';
    END IF;
    IF v_uid != v_event.chosen_witness_id THEN
      RAISE EXCEPTION 'You are not the chosen witness';
    END IF;
    IF p_dispute_reason IS NULL THEN
      RAISE EXCEPTION 'Must provide a reason for denial';
    END IF;
    UPDATE shot_events
    SET status = 'disputed',
        dispute_reason = p_dispute_reason,
        dispute_details = p_dispute_details,
        witness_confirmed_by = v_uid,
        witness_confirmed_at = now()
    WHERE id = p_event_id;

    INSERT INTO shot_event_log (event_id, type, actor_id, payload)
    VALUES (p_event_id, 'witness_disputed', v_uid, 
      jsonb_build_object('witness_id', v_uid, 'reason', p_dispute_reason, 'details', p_dispute_details));

  ELSIF p_mode = 'refuse' THEN
    IF v_uid != v_event.selected_user_id THEN
      RAISE EXCEPTION 'Only the selected user can refuse';
    END IF;
    UPDATE shot_events
    SET status = 'punished',
        punishment_applied_at = now(),
        punishment_deadline_at = now() + interval '15 minutes'
    WHERE id = p_event_id;

    INSERT INTO shot_event_log (event_id, type, actor_id, payload)
    VALUES (p_event_id, 'refused', v_uid, jsonb_build_object('penalty_shots', 2, 'reason', 'refused'));

  ELSIF p_mode = 'witness_timeout' THEN
    IF v_event.chosen_witness_id IS NULL THEN
      RAISE EXCEPTION 'No witness chosen';
    END IF;
    UPDATE shot_events
    SET witness_confirmed_by = v_event.chosen_witness_id,
        witness_confirmed_at = now(),
        status = 'punished',
        punishment_applied_at = now(),
        punishment_deadline_at = now() + interval '15 minutes'
    WHERE id = p_event_id;

    INSERT INTO shot_event_log (event_id, type, actor_id, payload)
    VALUES (p_event_id, 'witness_timeout', v_event.chosen_witness_id, 
      jsonb_build_object('penalty_shots', 1, 'reason', 'witness_timeout'));

  ELSIF p_mode = 'admin_resolve' THEN
    -- Admin resolves a dispute
    IF NOT is_admin(v_uid) THEN
      RAISE EXCEPTION 'Only admin can resolve disputes';
    END IF;
    IF v_event.status != 'disputed' THEN
      RAISE EXCEPTION 'Event is not in disputed state';
    END IF;
    -- p_dispute_reason here means the verdict: 'confirm' or 'punish'
    IF p_dispute_reason = 'confirm' THEN
      UPDATE shot_events
      SET status = 'confirmed',
          confirmed_at = now(),
          dispute_resolved_by = v_uid,
          dispute_resolved_at = now()
      WHERE id = p_event_id;
      INSERT INTO shot_event_log (event_id, type, actor_id, payload)
      VALUES (p_event_id, 'admin_confirmed', v_uid, jsonb_build_object('verdict', 'confirmed'));
    ELSE
      UPDATE shot_events
      SET status = 'punished',
          punishment_applied_at = now(),
          punishment_deadline_at = now() + interval '15 minutes',
          dispute_resolved_by = v_uid,
          dispute_resolved_at = now()
      WHERE id = p_event_id;
      INSERT INTO shot_event_log (event_id, type, actor_id, payload)
      VALUES (p_event_id, 'admin_punished', v_uid, jsonb_build_object('verdict', 'punished', 'penalty_shots', 1));
    END IF;

  ELSE
    RAISE EXCEPTION 'Invalid mode';
  END IF;

  SELECT * INTO v_event FROM shot_events WHERE id = p_event_id;
  RETURN jsonb_build_object('event_id', p_event_id, 'status', v_event.status, 'self_confirmed', v_event.self_confirmed, 'witness_confirmed_by', v_event.witness_confirmed_by, 'chosen_witness_id', v_event.chosen_witness_id, 'dispute_reason', v_event.dispute_reason);
END;
$function$;

-- 5. Add function for admin to ban/unban users
CREATE OR REPLACE FUNCTION public.rpc_admin_set_ban(p_user_id uuid, p_banned boolean, p_reason text DEFAULT NULL)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF NOT is_admin(v_uid) THEN RAISE EXCEPTION 'Not admin'; END IF;
  
  UPDATE profiles 
  SET is_banned = p_banned,
      banned_at = CASE WHEN p_banned THEN now() ELSE NULL END,
      ban_reason = CASE WHEN p_banned THEN p_reason ELSE NULL END,
      updated_at = now()
  WHERE id = p_user_id;
  
  RETURN jsonb_build_object('banned', p_banned, 'user_id', p_user_id);
END;
$function$;

-- 6. Update rpc_apply_overdue to include punishment_deadline_at
CREATE OR REPLACE FUNCTION public.rpc_apply_overdue(p_event_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_event shot_events%ROWTYPE;
BEGIN
  SELECT * INTO v_event FROM shot_events WHERE id = p_event_id FOR UPDATE;
  IF v_event IS NULL THEN RAISE EXCEPTION 'Event not found'; END IF;
  IF v_event.status != 'selected' THEN
    RETURN jsonb_build_object('event_id', p_event_id, 'status', v_event.status);
  END IF;
  IF now() < v_event.deadline_at THEN
    RETURN jsonb_build_object('event_id', p_event_id, 'status', 'selected', 'message', 'Not yet overdue');
  END IF;
  IF v_event.confirmed_at IS NOT NULL THEN
    RETURN jsonb_build_object('event_id', p_event_id, 'status', v_event.status);
  END IF;

  UPDATE shot_events
  SET status = 'punished',
      punishment_applied_at = now(),
      punishment_deadline_at = now() + interval '15 minutes'
  WHERE id = p_event_id;

  INSERT INTO shot_event_log (event_id, type, actor_id, payload)
  VALUES
    (p_event_id, 'overdue', v_event.selected_user_id, '{}'::jsonb),
    (p_event_id, 'punished', v_event.selected_user_id, jsonb_build_object('penalty_shots', 1));

  RETURN jsonb_build_object('event_id', p_event_id, 'status', 'punished', 'penalty_shots', 1);
END;
$function$;

-- 7. Function to apply punishment timeout ban
CREATE OR REPLACE FUNCTION public.rpc_apply_punishment_ban(p_event_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_event shot_events%ROWTYPE;
BEGIN
  SELECT * INTO v_event FROM shot_events WHERE id = p_event_id;
  IF v_event IS NULL THEN RAISE EXCEPTION 'Event not found'; END IF;
  IF v_event.status != 'punished' THEN
    RETURN jsonb_build_object('banned', false, 'reason', 'not_punished');
  END IF;
  IF v_event.punishment_deadline_at IS NULL OR now() < v_event.punishment_deadline_at THEN
    RETURN jsonb_build_object('banned', false, 'reason', 'not_yet_overdue');
  END IF;
  
  -- Ban the user
  UPDATE profiles
  SET is_banned = true,
      banned_at = now(),
      ban_reason = 'Straffeshot ikke tatt innen fristen',
      updated_at = now()
  WHERE id = v_event.selected_user_id;
  
  INSERT INTO shot_event_log (event_id, type, actor_id, payload)
  VALUES (p_event_id, 'banned', v_event.selected_user_id, 
    jsonb_build_object('reason', 'punishment_timeout'));
  
  RETURN jsonb_build_object('banned', true, 'user_id', v_event.selected_user_id);
END;
$function$;
