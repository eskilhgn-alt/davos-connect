
-- Add random checker fields to shot_events
ALTER TABLE public.shot_events
  ADD COLUMN IF NOT EXISTS random_checker_id uuid,
  ADD COLUMN IF NOT EXISTS checker_verdict text,
  ADD COLUMN IF NOT EXISTS checker_reason text,
  ADD COLUMN IF NOT EXISTS admin_verdict text,
  ADD COLUMN IF NOT EXISTS admin_reason text;

-- Create RPC for random checker to submit verdict
CREATE OR REPLACE FUNCTION public.rpc_checker_verdict(
  p_event_id uuid,
  p_verdict text,  -- 'approve', 'deny', 'escalate'
  p_reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_event shot_events%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  SELECT * INTO v_event FROM shot_events WHERE id = p_event_id FOR UPDATE;
  IF v_event IS NULL THEN RAISE EXCEPTION 'Event not found'; END IF;
  IF v_event.random_checker_id != v_uid THEN RAISE EXCEPTION 'You are not the assigned checker'; END IF;
  IF v_event.checker_verdict IS NOT NULL THEN RAISE EXCEPTION 'Already submitted verdict'; END IF;
  IF p_verdict NOT IN ('approve', 'deny', 'escalate') THEN RAISE EXCEPTION 'Invalid verdict'; END IF;

  UPDATE shot_events
  SET checker_verdict = p_verdict,
      checker_reason = p_reason
  WHERE id = p_event_id;

  IF p_verdict = 'approve' THEN
    -- Checker approves: confirm the shot, remove ban
    UPDATE shot_events SET status = 'confirmed', confirmed_at = now() WHERE id = p_event_id;
    UPDATE shot_tokens SET shot_banned_until = NULL, updated_at = now()
    WHERE user_id = v_event.selected_user_id;

    INSERT INTO shot_event_log (event_id, type, actor_id, payload)
    VALUES (p_event_id, 'checker_approved', v_uid,
      jsonb_build_object('reason', p_reason, 'checker_id', v_uid));

  ELSIF p_verdict = 'deny' THEN
    -- Checker denies: keep punishment
    UPDATE shot_events SET status = 'punished', punishment_applied_at = now() WHERE id = p_event_id;

    INSERT INTO shot_event_log (event_id, type, actor_id, payload)
    VALUES (p_event_id, 'checker_denied', v_uid,
      jsonb_build_object('reason', p_reason, 'checker_id', v_uid));

  ELSIF p_verdict = 'escalate' THEN
    -- Escalate to admin: keep disputed status
    INSERT INTO shot_event_log (event_id, type, actor_id, payload)
    VALUES (p_event_id, 'checker_escalated', v_uid,
      jsonb_build_object('reason', p_reason, 'checker_id', v_uid));
  END IF;

  RETURN jsonb_build_object('event_id', p_event_id, 'verdict', p_verdict);
END;
$$;

-- Update admin_resolve to also log admin_reason and admin_verdict
CREATE OR REPLACE FUNCTION public.rpc_admin_resolve_shot(
  p_event_id uuid,
  p_verdict text,  -- 'approve', 'deny', 'approve_reluctant'
  p_reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_event shot_events%ROWTYPE;
BEGIN
  IF NOT is_admin(v_uid) THEN RAISE EXCEPTION 'Not admin'; END IF;

  SELECT * INTO v_event FROM shot_events WHERE id = p_event_id FOR UPDATE;
  IF v_event IS NULL THEN RAISE EXCEPTION 'Event not found'; END IF;
  IF v_event.status != 'disputed' THEN RAISE EXCEPTION 'Event is not in disputed state'; END IF;
  IF p_verdict NOT IN ('approve', 'deny', 'approve_reluctant') THEN RAISE EXCEPTION 'Invalid verdict'; END IF;

  UPDATE shot_events
  SET admin_verdict = p_verdict,
      admin_reason = p_reason,
      dispute_resolved_by = v_uid,
      dispute_resolved_at = now()
  WHERE id = p_event_id;

  IF p_verdict IN ('approve', 'approve_reluctant') THEN
    UPDATE shot_events SET status = 'confirmed', confirmed_at = now() WHERE id = p_event_id;
    UPDATE shot_tokens SET shot_banned_until = NULL, updated_at = now()
    WHERE user_id = v_event.selected_user_id;

    INSERT INTO shot_event_log (event_id, type, actor_id, payload)
    VALUES (p_event_id, 'admin_confirmed', v_uid,
      jsonb_build_object('verdict', p_verdict, 'reason', p_reason, 'ban_lifted', true));
  ELSE
    UPDATE shot_events SET status = 'punished', punishment_applied_at = now() WHERE id = p_event_id;

    INSERT INTO shot_event_log (event_id, type, actor_id, payload)
    VALUES (p_event_id, 'admin_punished', v_uid,
      jsonb_build_object('verdict', p_verdict, 'reason', p_reason));
  END IF;

  INSERT INTO admin_audit_log (admin_id, action, details)
  VALUES (v_uid, 'shot_dispute_resolved',
    jsonb_build_object('event_id', p_event_id, 'verdict', p_verdict, 'reason', p_reason));

  RETURN jsonb_build_object('event_id', p_event_id, 'verdict', p_verdict, 'resolved', true);
END;
$$;
