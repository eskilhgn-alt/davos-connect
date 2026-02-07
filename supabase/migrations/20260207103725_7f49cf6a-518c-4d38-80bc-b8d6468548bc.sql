
CREATE OR REPLACE FUNCTION public.rpc_check_bonus_token(p_user_id uuid, p_group_id text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user_count int;
  v_second_count int;
BEGIN
  SELECT count(*) INTO v_user_count
  FROM shot_events
  WHERE selected_user_id = p_user_id AND group_id = p_group_id
    AND status IN ('selected','confirmed','punished');

  SELECT COALESCE(max(cnt), 0) INTO v_second_count
  FROM (
    SELECT count(*) as cnt
    FROM shot_events
    WHERE selected_user_id != p_user_id AND group_id = p_group_id
      AND status IN ('selected','confirmed','punished')
    GROUP BY selected_user_id
  ) sub;

  IF v_user_count >= v_second_count + 2 THEN
    UPDATE shot_tokens SET balance = LEAST(balance + 1, 5), updated_at = now()
    WHERE user_id = p_user_id;

    INSERT INTO shot_event_log (event_id, type, actor_id, payload)
    SELECT id, 'bonus_token', p_user_id, jsonb_build_object('reason', 'leads_by_2_plus')
    FROM shot_events
    WHERE selected_user_id = p_user_id AND group_id = p_group_id
    ORDER BY created_at DESC LIMIT 1;
  END IF;
END;
$function$;

CREATE OR REPLACE FUNCTION public.rpc_get_all_shot_tokens()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_result jsonb;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  SELECT jsonb_agg(row_to_json(t)) INTO v_result
  FROM (
    SELECT
      p.id as user_id,
      COALESCE(p.nickname, p.full_name, p.email) as display_name,
      COALESCE(st.balance, 5) as balance
    FROM profiles p
    LEFT JOIN shot_tokens st ON st.user_id = p.id
    WHERE p.is_active = true
    ORDER BY COALESCE(st.balance, 5) DESC
  ) t;

  RETURN COALESCE(v_result, '[]'::jsonb);
END;
$function$;
