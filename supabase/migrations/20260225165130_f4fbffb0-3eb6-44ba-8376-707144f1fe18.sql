
-- 1. Add monster_round_id column to link monster round events
ALTER TABLE public.shot_events ADD COLUMN IF NOT EXISTS monster_round_id uuid DEFAULT NULL;

-- 2. Create monster round RPC
CREATE OR REPLACE FUNCTION public.rpc_start_monster_round(p_group_id text DEFAULT 'global')
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_token_row shot_tokens%ROWTYPE;
  v_monster_id uuid := gen_random_uuid();
  v_first_user uuid;
  v_member record;
  v_weights numeric[];
  v_ids uuid[];
  v_total_weight numeric := 0;
  v_rand numeric;
  v_cumul numeric := 0;
  v_order int := 0;
  v_event_id uuid;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  -- Check no active countdown
  IF EXISTS(SELECT 1 FROM shot_events WHERE group_id = p_group_id AND status = 'countdown') THEN
    RAISE EXCEPTION 'Countdown already in progress';
  END IF;

  -- Ensure token row + check balance
  INSERT INTO shot_tokens (user_id, balance, last_refill_at) VALUES (v_uid, 5, now()) ON CONFLICT (user_id) DO NOTHING;
  SELECT * INTO v_token_row FROM shot_tokens WHERE user_id = v_uid FOR UPDATE;
  IF v_token_row.balance < 1 THEN RAISE EXCEPTION 'No tokens left'; END IF;
  UPDATE shot_tokens SET balance = balance - 1, updated_at = now() WHERE user_id = v_uid;

  -- Get all active users with weights for first pick
  v_ids := ARRAY[]::uuid[];
  v_weights := ARRAY[]::numeric[];
  
  FOR v_member IN
    SELECT p.id as user_id,
           COALESCE(
             (SELECT count(*) FROM shot_events se
              WHERE se.selected_user_id = p.id
                AND se.created_at > now() - interval '7 days'
                AND se.group_id = p_group_id
                AND se.status NOT IN ('cancelled')), 0
           ) as recent_selections
    FROM profiles p
    WHERE p.is_active = true
  LOOP
    v_ids := array_append(v_ids, v_member.user_id);
    v_weights := array_append(v_weights, 1.0 / (1.0 + 0.3 * v_member.recent_selections));
    v_total_weight := v_total_weight + 1.0 / (1.0 + 0.3 * v_member.recent_selections);
  END LOOP;

  IF array_length(v_ids, 1) IS NULL OR array_length(v_ids, 1) < 2 THEN
    RAISE EXCEPTION 'Not enough users';
  END IF;

  -- Pick first user (weighted random)
  v_rand := random() * v_total_weight;
  FOR i IN 1..array_length(v_ids, 1) LOOP
    v_cumul := v_cumul + v_weights[i];
    IF v_rand <= v_cumul THEN
      v_first_user := v_ids[i];
      EXIT;
    END IF;
  END LOOP;
  IF v_first_user IS NULL THEN v_first_user := v_ids[array_length(v_ids, 1)]; END IF;

  -- Create event for first user (order 1)
  v_order := 1;
  INSERT INTO shot_events (started_by, status, selected_user_id, selected_at, deadline_at, group_id, monster_round_id)
  VALUES (v_uid, 'selected', v_first_user, now(), now() + interval '30 minutes', p_group_id, v_monster_id)
  RETURNING id INTO v_event_id;

  INSERT INTO shot_event_log (event_id, type, actor_id, payload)
  VALUES (v_event_id, 'monster_selected', v_first_user, jsonb_build_object('order', 1, 'monster_round_id', v_monster_id));

  -- Create events for remaining users in random order
  FOR v_member IN
    SELECT u AS user_id FROM unnest(v_ids) u WHERE u != v_first_user ORDER BY random()
  LOOP
    v_order := v_order + 1;
    INSERT INTO shot_events (started_by, status, selected_user_id, selected_at, deadline_at, group_id, monster_round_id)
    VALUES (v_uid, 'selected', v_member.user_id, now(), now() + interval '30 minutes', p_group_id, v_monster_id)
    RETURNING id INTO v_event_id;

    INSERT INTO shot_event_log (event_id, type, actor_id, payload)
    VALUES (v_event_id, 'monster_selected', v_member.user_id, jsonb_build_object('order', v_order, 'monster_round_id', v_monster_id));
  END LOOP;

  RETURN jsonb_build_object('monster_round_id', v_monster_id, 'total_users', v_order, 'first_user_id', v_first_user);
END;
$$;

-- 3. Update rpc_confirm_shot: add 'direct' mode for confirming without witness
CREATE OR REPLACE FUNCTION public.rpc_confirm_shot(p_event_id uuid, p_mode text, p_witness_id uuid DEFAULT NULL, p_dispute_reason text DEFAULT NULL, p_dispute_details text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_event shot_events%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  SELECT * INTO v_event FROM shot_events WHERE id = p_event_id FOR UPDATE;
  IF v_event IS NULL THEN RAISE EXCEPTION 'Event not found'; END IF;

  IF p_mode = 'direct' THEN
    -- Direct confirm: selected user confirms, no witness needed
    IF v_uid != v_event.selected_user_id THEN RAISE EXCEPTION 'Only the selected user can confirm'; END IF;
    IF v_event.status != 'selected' THEN RAISE EXCEPTION 'Event not in selected state'; END IF;
    
    UPDATE shot_events 
    SET self_confirmed = true, confirmed_at = now(), status = 'confirmed'
    WHERE id = p_event_id;
    
    INSERT INTO shot_event_log (event_id, type, actor_id, payload)
    VALUES (p_event_id, 'direct_confirmed', v_uid, '{}'::jsonb);

  ELSIF p_mode = 'refuse' THEN
    IF v_uid != v_event.selected_user_id THEN RAISE EXCEPTION 'Only the selected user can refuse'; END IF;
    UPDATE shot_events SET status = 'punished', punishment_applied_at = now() WHERE id = p_event_id;
    INSERT INTO shot_event_log (event_id, type, actor_id, payload)
    VALUES (p_event_id, 'refused', v_uid, jsonb_build_object('reason', 'refused'));

  ELSIF p_mode = 'admin_resolve' THEN
    IF NOT is_admin(v_uid) THEN RAISE EXCEPTION 'Only admin can resolve'; END IF;
    IF p_dispute_reason = 'confirm' THEN
      UPDATE shot_events SET status = 'confirmed', confirmed_at = now(), dispute_resolved_by = v_uid, dispute_resolved_at = now()
      WHERE id = p_event_id;
      INSERT INTO shot_event_log (event_id, type, actor_id, payload)
      VALUES (p_event_id, 'admin_confirmed', v_uid, jsonb_build_object('verdict', 'confirmed'));
    ELSE
      UPDATE shot_events SET status = 'punished', punishment_applied_at = now(), dispute_resolved_by = v_uid, dispute_resolved_at = now()
      WHERE id = p_event_id;
      INSERT INTO shot_event_log (event_id, type, actor_id, payload)
      VALUES (p_event_id, 'admin_punished', v_uid, jsonb_build_object('verdict', 'punished'));
    END IF;

  ELSE
    RAISE EXCEPTION 'Invalid mode: %', p_mode;
  END IF;

  SELECT * INTO v_event FROM shot_events WHERE id = p_event_id;
  RETURN jsonb_build_object('event_id', p_event_id, 'status', v_event.status, 'self_confirmed', v_event.self_confirmed);
END;
$$;

-- 4. Update rpc_start_shot_round: remove ban check
CREATE OR REPLACE FUNCTION public.rpc_start_shot_round(p_group_id text DEFAULT 'global')
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_active_count int;
  v_token_row shot_tokens%ROWTYPE;
  v_days_since numeric;
  v_refill int;
  v_event_id uuid;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  -- Only block if a COUNTDOWN is actively running
  SELECT count(*) INTO v_active_count
  FROM shot_events WHERE group_id = p_group_id AND status = 'countdown';
  IF v_active_count > 0 THEN RAISE EXCEPTION 'Countdown already in progress'; END IF;

  -- Ensure token row exists
  INSERT INTO shot_tokens (user_id, balance, last_refill_at, updated_at)
  VALUES (v_uid, 5, now(), now())
  ON CONFLICT (user_id) DO NOTHING;

  SELECT * INTO v_token_row FROM shot_tokens WHERE user_id = v_uid FOR UPDATE;

  -- Refill: 5 tokens per full day
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
$$;

-- 5. Update rpc_apply_overdue: no ban, just mark as punished
CREATE OR REPLACE FUNCTION public.rpc_apply_overdue(p_event_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
  SET status = 'punished', punishment_applied_at = now()
  WHERE id = p_event_id;

  INSERT INTO shot_event_log (event_id, type, actor_id, payload)
  VALUES (p_event_id, 'overdue', v_event.selected_user_id, '{}'::jsonb);

  RETURN jsonb_build_object('event_id', p_event_id, 'status', 'punished');
END;
$$;
