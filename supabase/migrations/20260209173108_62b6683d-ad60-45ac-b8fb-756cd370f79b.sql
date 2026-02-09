
-- Backfill points for existing activity (skip non-UUID sender_ids)
DO $$
DECLARE
  r record;
BEGIN
  -- Messages (1 point each) - only valid UUIDs
  FOR r IN SELECT sender_id::uuid as uid, count(*) as cnt FROM messages WHERE deleted_at IS NULL AND sender_id ~ '^[0-9a-f]{8}-' GROUP BY sender_id LOOP
    PERFORM rpc_award_points(r.uid, r.cnt::int, 'chat_message', r.cnt || ' meldinger (backfill)');
  END LOOP;

  -- Gallery items (3 points each)
  FOR r IN SELECT uploaded_by as uid, count(*) as cnt FROM gallery_items GROUP BY uploaded_by LOOP
    PERFORM rpc_award_points(r.uid, (r.cnt * 3)::int, 'media_share', r.cnt || ' media (backfill)');
  END LOOP;

  -- Shot events started (3 points each)
  FOR r IN SELECT started_by as uid, count(*) as cnt FROM shot_events GROUP BY started_by LOOP
    PERFORM rpc_award_points(r.uid, (r.cnt * 3)::int, 'shot_start', r.cnt || ' runder startet (backfill)');
  END LOOP;

  -- Shot confirmed (4 points)
  FOR r IN SELECT selected_user_id as uid, count(*) as cnt FROM shot_events WHERE status = 'confirmed' AND selected_user_id IS NOT NULL GROUP BY selected_user_id LOOP
    PERFORM rpc_award_points(r.uid, (r.cnt * 4)::int, 'shot_confirm', r.cnt || ' shots bekreftet (backfill)');
  END LOOP;

  -- Witness activity (1 point)
  FOR r IN SELECT witness_confirmed_by as uid, count(*) as cnt FROM shot_events WHERE witness_confirmed_by IS NOT NULL GROUP BY witness_confirmed_by LOOP
    PERFORM rpc_award_points(r.uid, r.cnt::int, 'witness', r.cnt || ' vitneaktiviteter (backfill)');
  END LOOP;

  -- Stories (2 points each)
  FOR r IN SELECT user_id as uid, count(*) as cnt FROM stories GROUP BY user_id LOOP
    PERFORM rpc_award_points(r.uid, (r.cnt * 2)::int, 'story_publish', r.cnt || ' stories (backfill)');
  END LOOP;

  -- Ski vertical (2 per 100m)
  FOR r IN SELECT user_id as uid, SUM(vertical_meters) as total FROM ski_daily_vertical GROUP BY user_id LOOP
    IF floor(r.total / 100) > 0 THEN
      PERFORM rpc_award_points(r.uid, (floor(r.total / 100) * 2)::int, 'ski_vertical', round(r.total) || 'm (backfill)');
    END IF;
  END LOOP;
END $$;
