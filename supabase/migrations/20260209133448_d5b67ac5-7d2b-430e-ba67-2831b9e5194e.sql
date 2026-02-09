
-- Comprehensive gamification leaderboard RPC
CREATE OR REPLACE FUNCTION public.rpc_get_gamification_leaderboard()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_result jsonb;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  SELECT jsonb_agg(row_to_json(t)) INTO v_result
  FROM (
    SELECT
      p.id as user_id,
      COALESCE(p.nickname, p.full_name, p.email) as display_name,
      -- Points
      COALESCE(up.total_points, 0) as total_points,
      -- Streaks
      COALESCE(us.current_streak, 0) as current_streak,
      COALESCE(us.best_streak, 0) as best_streak,
      -- Tokens
      COALESCE(st.balance, 5) as token_balance,
      -- Shot stats
      COALESCE(shot_stats.times_selected, 0) as shots_selected,
      COALESCE(shot_stats.times_confirmed, 0) as shots_confirmed,
      COALESCE(shot_stats.times_punished, 0) as shots_punished,
      COALESCE(shot_stats.times_refused, 0) as shots_refused,
      COALESCE(shot_stats.times_started, 0) as rounds_started,
      COALESCE(shot_stats.times_witnessed, 0) as times_witnessed,
      -- Ski stats
      COALESCE(ski_stats.total_vertical, 0) as ski_total_vertical,
      COALESCE(ski_stats.active_days, 0) as ski_active_days,
      COALESCE(ski_stats.today_vertical, 0) as ski_today_vertical,
      -- Frikort
      COALESCE(frikort_stats.frikort_earned, 0) as frikort_earned,
      COALESCE(frikort_stats.frikort_used, 0) as frikort_used,
      COALESCE(frikort_stats.frikort_available, 0) as frikort_available,
      -- Chat stats
      COALESCE(chat_stats.messages_sent, 0) as messages_sent,
      COALESCE(chat_stats.media_shared, 0) as media_shared,
      -- Stories
      COALESCE(story_stats.stories_posted, 0) as stories_posted,
      -- Derived
      CASE WHEN COALESCE(shot_stats.times_selected, 0) > 0 
        THEN round(100.0 * COALESCE(shot_stats.times_confirmed, 0) / shot_stats.times_selected)
        ELSE 0 END as shot_success_rate
    FROM profiles p
    LEFT JOIN user_points up ON up.user_id = p.id
    LEFT JOIN user_streaks us ON us.user_id = p.id
    LEFT JOIN shot_tokens st ON st.user_id = p.id
    -- Shot aggregates
    LEFT JOIN LATERAL (
      SELECT
        count(*) FILTER (WHERE se.selected_user_id = p.id) as times_selected,
        count(*) FILTER (WHERE se.selected_user_id = p.id AND se.status = 'confirmed') as times_confirmed,
        count(*) FILTER (WHERE se.selected_user_id = p.id AND se.status = 'punished') as times_punished,
        count(*) FILTER (WHERE se.selected_user_id = p.id AND se.status = 'punished' 
          AND EXISTS(SELECT 1 FROM shot_event_log sel WHERE sel.event_id = se.id AND sel.type = 'refused')) as times_refused,
        count(*) FILTER (WHERE se.started_by = p.id) as times_started,
        count(*) FILTER (WHERE se.witness_confirmed_by = p.id) as times_witnessed
      FROM shot_events se
    ) shot_stats ON true
    -- Ski aggregates
    LEFT JOIN LATERAL (
      SELECT
        COALESCE(SUM(sdv.vertical_meters), 0) as total_vertical,
        COUNT(sdv.id) as active_days,
        COALESCE(SUM(sdv.vertical_meters) FILTER (WHERE sdv.day_date = CURRENT_DATE), 0) as today_vertical
      FROM ski_daily_vertical sdv
      WHERE sdv.user_id = p.id
    ) ski_stats ON true
    -- Frikort
    LEFT JOIN LATERAL (
      SELECT
        count(*) as frikort_earned,
        count(*) FILTER (WHERE uf.used_at IS NOT NULL) as frikort_used,
        count(*) FILTER (WHERE uf.used_at IS NULL) as frikort_available
      FROM user_frikort uf
      WHERE uf.user_id = p.id
    ) frikort_stats ON true
    -- Chat
    LEFT JOIN LATERAL (
      SELECT
        count(*) as messages_sent,
        count(*) FILTER (WHERE m.attachments IS NOT NULL AND m.attachments != '[]'::jsonb) as media_shared
      FROM messages m
      WHERE m.sender_id = p.id::text
    ) chat_stats ON true
    -- Stories
    LEFT JOIN LATERAL (
      SELECT count(*) as stories_posted
      FROM stories s
      WHERE s.user_id = p.id
    ) story_stats ON true
    WHERE p.is_active = true
    ORDER BY COALESCE(up.total_points, 0) DESC
  ) t;

  RETURN COALESCE(v_result, '[]'::jsonb);
END;
$$;
