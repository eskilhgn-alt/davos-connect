
CREATE OR REPLACE FUNCTION public.rpc_start_monster_round(p_group_id text DEFAULT 'global'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_token_row shot_tokens%ROWTYPE;
  v_monster_id uuid := gen_random_uuid();
  v_order int := 0;
  v_event_id uuid;
  v_member record;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  IF EXISTS(SELECT 1 FROM shot_events WHERE group_id = p_group_id AND status = 'countdown') THEN
    RAISE EXCEPTION 'Countdown already in progress';
  END IF;

  INSERT INTO shot_tokens (user_id, balance, last_refill_at) VALUES (v_uid, 5, now()) ON CONFLICT (user_id) DO NOTHING;
  SELECT * INTO v_token_row FROM shot_tokens WHERE user_id = v_uid FOR UPDATE;
  IF v_token_row.balance < 1 THEN RAISE EXCEPTION 'No tokens left'; END IF;
  UPDATE shot_tokens SET balance = balance - 1, updated_at = now() WHERE user_id = v_uid;

  -- All active users in fully random order
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

  IF v_order < 2 THEN RAISE EXCEPTION 'Not enough users'; END IF;

  RETURN jsonb_build_object('monster_round_id', v_monster_id, 'total_users', v_order);
END;
$function$;
