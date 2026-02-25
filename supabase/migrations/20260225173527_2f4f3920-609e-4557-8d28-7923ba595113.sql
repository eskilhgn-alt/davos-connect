
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
  v_is_monster boolean := false;
  v_monster_id uuid;
  v_order int := 0;
  v_member record;
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

  -- 5% chance of monster round
  IF random() < 0.05 THEN
    v_is_monster := true;
    v_monster_id := gen_random_uuid();

    FOR v_member IN
      SELECT p.id as user_id
      FROM profiles p
      WHERE p.is_active = true
      ORDER BY random()
    LOOP
      v_order := v_order + 1;
      INSERT INTO shot_events (started_by, status, selected_user_id, selected_at, deadline_at, group_id, monster_round_id)
      VALUES (v_uid, 'selected', v_member.user_id, now(), now() + interval '30 minutes', p_group_id, v_monster_id)
      RETURNING id INTO v_event_id;

      INSERT INTO shot_event_log (event_id, type, actor_id, payload)
      VALUES (v_event_id, 'monster_selected', v_member.user_id, jsonb_build_object('order', v_order, 'monster_round_id', v_monster_id));
    END LOOP;

    RETURN jsonb_build_object('event_id', v_event_id, 'status', 'monster', 'monster_round_id', v_monster_id, 'total_users', v_order, 'is_monster', true);
  END IF;

  -- Normal round
  INSERT INTO shot_events (started_by, status, countdown_ends_at, group_id)
  VALUES (v_uid, 'countdown', now() + interval '10 seconds', p_group_id)
  RETURNING id INTO v_event_id;

  INSERT INTO shot_event_log (event_id, type, actor_id, payload)
  VALUES
    (v_event_id, 'pressed', v_uid, jsonb_build_object('user_id', v_uid)),
    (v_event_id, 'countdown_started', v_uid, jsonb_build_object('ends_at', now() + interval '10 seconds'));

  RETURN jsonb_build_object('event_id', v_event_id, 'status', 'countdown', 'countdown_ends_at', now() + interval '10 seconds', 'is_monster', false);
END;
$function$;
