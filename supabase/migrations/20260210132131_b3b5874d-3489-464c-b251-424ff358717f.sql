
-- Add shot-specific ban column to shot_tokens
ALTER TABLE public.shot_tokens ADD COLUMN IF NOT EXISTS shot_banned_until timestamptz DEFAULT NULL;

-- ============================================================
-- Fix token refill: 5 NEW tokens per day, allow hoarding (no cap)
-- ============================================================
CREATE OR REPLACE FUNCTION public.rpc_get_shot_tokens()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_row shot_tokens%ROWTYPE;
  v_days_since numeric;
  v_refill int;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  INSERT INTO shot_tokens (user_id, balance, last_refill_at, updated_at)
  VALUES (v_uid, 5, now(), now())
  ON CONFLICT (user_id) DO NOTHING;

  SELECT * INTO v_row FROM shot_tokens WHERE user_id = v_uid FOR UPDATE;

  v_days_since := EXTRACT(EPOCH FROM (now() - v_row.last_refill_at)) / 86400.0;
  IF v_days_since >= 1 THEN
    v_refill := FLOOR(v_days_since)::int * 5;  -- 5 tokens per day
    IF v_refill > 0 THEN
      UPDATE shot_tokens SET balance = balance + v_refill, last_refill_at = now(), updated_at = now() WHERE user_id = v_uid;
      v_row.balance := v_row.balance + v_refill;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'balance', v_row.balance,
    'shot_banned_until', v_row.shot_banned_until
  );
END;
$function$;

-- ============================================================
-- Fix rpc_start_shot_round: check ban, 5 tokens/day refill, no cap
-- ============================================================
CREATE OR REPLACE FUNCTION public.rpc_start_shot_round(p_group_id text DEFAULT 'global'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_active_count int;
  v_token_row shot_tokens%ROWTYPE;
  v_days_since numeric;
  v_refill int;
  v_event_id uuid;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  -- Check shot ban
  SELECT * INTO v_token_row FROM shot_tokens WHERE user_id = v_uid;
  IF v_token_row IS NOT NULL AND v_token_row.shot_banned_until IS NOT NULL AND v_token_row.shot_banned_until > now() THEN
    RAISE EXCEPTION 'Du er utestengt fra Shoot your shot til %', to_char(v_token_row.shot_banned_until, 'HH24:MI');
  END IF;

  -- Only block if a COUNTDOWN is actively running
  SELECT count(*) INTO v_active_count
  FROM shot_events WHERE group_id = p_group_id AND status = 'countdown';
  IF v_active_count > 0 THEN RAISE EXCEPTION 'Countdown already in progress'; END IF;

  -- Ensure token row exists
  INSERT INTO shot_tokens (user_id, balance, last_refill_at, updated_at)
  VALUES (v_uid, 5, now(), now())
  ON CONFLICT (user_id) DO NOTHING;

  SELECT * INTO v_token_row FROM shot_tokens WHERE user_id = v_uid FOR UPDATE;

  -- Refill: 5 tokens per full day, no cap (hoarding allowed)
  v_days_since := EXTRACT(EPOCH FROM (now() - v_token_row.last_refill_at)) / 86400.0;
  IF v_days_since >= 1 THEN
    v_refill := FLOOR(v_days_since)::int * 5;
    IF v_refill > 0 THEN
      UPDATE shot_tokens SET balance = balance + v_refill, last_refill_at = now(), updated_at = now() WHERE user_id = v_uid;
      v_token_row.balance := v_token_row.balance + v_refill;
    END IF;
  END IF;

  IF v_token_row.balance < 1 THEN RAISE EXCEPTION 'No tokens left'; END IF;

  UPDATE shot_tokens SET balance = balance - 1, updated_at = now() WHERE user_id = v_uid;

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

-- ============================================================
-- Update rpc_apply_overdue: 12-hour ban
-- ============================================================
CREATE OR REPLACE FUNCTION public.rpc_apply_overdue(p_event_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_event shot_events%ROWTYPE;
  v_ban_until timestamptz;
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

  v_ban_until := now() + interval '12 hours';

  UPDATE shot_events
  SET status = 'punished',
      punishment_applied_at = now()
  WHERE id = p_event_id;

  -- Apply 12-hour shot ban
  UPDATE shot_tokens
  SET shot_banned_until = v_ban_until, updated_at = now()
  WHERE user_id = v_event.selected_user_id;

  INSERT INTO shot_event_log (event_id, type, actor_id, payload)
  VALUES
    (p_event_id, 'overdue', v_event.selected_user_id, '{}'::jsonb),
    (p_event_id, 'punished', v_event.selected_user_id, jsonb_build_object('reason', 'overdue', 'banned_until', v_ban_until));

  RETURN jsonb_build_object('event_id', p_event_id, 'status', 'punished', 'banned_until', v_ban_until);
END;
$function$;

-- ============================================================
-- Update rpc_confirm_shot: witness_deny also applies 12h ban
-- ============================================================
CREATE OR REPLACE FUNCTION public.rpc_confirm_shot(p_event_id uuid, p_mode text, p_witness_id uuid DEFAULT NULL::uuid, p_dispute_reason text DEFAULT NULL::text, p_dispute_details text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_event shot_events%ROWTYPE;
  v_ban_until timestamptz;
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

    UPDATE shot_events
    SET status = 'disputed',
        dispute_reason = p_dispute_reason,
        dispute_details = p_dispute_details,
        witness_confirmed_by = v_uid,
        witness_confirmed_at = now()
    WHERE id = p_event_id;

    -- Apply 12h ban to the selected user
    UPDATE shot_tokens
    SET shot_banned_until = v_ban_until, updated_at = now()
    WHERE user_id = v_event.selected_user_id;

    INSERT INTO shot_event_log (event_id, type, actor_id, payload)
    VALUES (p_event_id, 'witness_disputed', v_uid, 
      jsonb_build_object('witness_id', v_uid, 'reason', p_dispute_reason, 'details', p_dispute_details, 'banned_until', v_ban_until));

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
    IF NOT is_admin(v_uid) THEN RAISE EXCEPTION 'Only admin can resolve disputes'; END IF;
    IF v_event.status != 'disputed' THEN RAISE EXCEPTION 'Event is not in disputed state'; END IF;
    IF p_dispute_reason = 'confirm' THEN
      -- Admin confirms: remove ban
      UPDATE shot_events SET status = 'confirmed', confirmed_at = now(), dispute_resolved_by = v_uid, dispute_resolved_at = now()
      WHERE id = p_event_id;
      UPDATE shot_tokens SET shot_banned_until = NULL, updated_at = now()
      WHERE user_id = v_event.selected_user_id;
      INSERT INTO shot_event_log (event_id, type, actor_id, payload)
      VALUES (p_event_id, 'admin_confirmed', v_uid, jsonb_build_object('verdict', 'confirmed', 'ban_lifted', true));
    ELSE
      -- Admin punishes: keep ban
      UPDATE shot_events SET status = 'punished', punishment_applied_at = now(), dispute_resolved_by = v_uid, dispute_resolved_at = now()
      WHERE id = p_event_id;
      INSERT INTO shot_event_log (event_id, type, actor_id, payload)
      VALUES (p_event_id, 'admin_punished', v_uid, jsonb_build_object('verdict', 'punished'));
    END IF;

  ELSE
    RAISE EXCEPTION 'Invalid mode';
  END IF;

  SELECT * INTO v_event FROM shot_events WHERE id = p_event_id;
  RETURN jsonb_build_object('event_id', p_event_id, 'status', v_event.status, 'self_confirmed', v_event.self_confirmed, 'witness_confirmed_by', v_event.witness_confirmed_by, 'chosen_witness_id', v_event.chosen_witness_id, 'dispute_reason', v_event.dispute_reason);
END;
$function$;

-- ============================================================
-- New: Admin can manually unban from shot
-- ============================================================
CREATE OR REPLACE FUNCTION public.rpc_admin_unban_shot(p_user_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF NOT is_admin(v_uid) THEN RAISE EXCEPTION 'Not admin'; END IF;

  UPDATE shot_tokens SET shot_banned_until = NULL, updated_at = now()
  WHERE user_id = p_user_id;

  INSERT INTO admin_audit_log (admin_id, action, target_user_id, details)
  VALUES (v_uid, 'unban_shot', p_user_id, jsonb_build_object('reason', 'manual_admin_unban'));

  RETURN jsonb_build_object('unbanned', true, 'user_id', p_user_id);
END;
$function$;
