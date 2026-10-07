\set ON_ERROR_STOP 1
CREATE TEMP TABLE results (name text, ok boolean);
GRANT ALL ON results TO PUBLIC;
CREATE FUNCTION pg_temp.expect_fail(p_name text, p_role text, p_uid text, p_sql text, p_err text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('request.uid', coalesce(p_uid,''), true);
  EXECUTE format('SET LOCAL ROLE %I', p_role);
  BEGIN EXECUTE p_sql; RESET ROLE; INSERT INTO results VALUES (p_name, false);
  EXCEPTION WHEN OTHERS THEN RESET ROLE; INSERT INTO results VALUES (p_name, SQLERRM LIKE '%'||p_err||'%');
    IF SQLERRM NOT LIKE '%'||p_err||'%' THEN RAISE NOTICE '% got: %', p_name, SQLERRM; END IF;
  END;
END $$;

-- Historical rows untouched.
INSERT INTO results SELECT 'historical rows preserved (2)', count(*) = 2 FROM gallery_items;
INSERT INTO results SELECT 'auto-copy triggers removed', NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname IN ('trg_sync_story_to_gallery','trg_sync_attachment_to_gallery'));

-- New source content (no auto-copy anymore).
INSERT INTO stories VALUES ('10000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-00000000000a','a/new.jpg','image','00000000-0000-0000-0000-0000000000a1'),
                           ('10000000-0000-0000-0000-000000000003','00000000-0000-0000-0000-00000000000a','a/arch.jpg','image','00000000-0000-0000-0000-0000000000a2');
INSERT INTO messages VALUES ('20000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-00000000000a','00000000-0000-0000-0000-0000000000a1',NULL),
                            ('20000000-0000-0000-0000-000000000003','00000000-0000-0000-0000-00000000000a','00000000-0000-0000-0000-0000000000a2',NULL);
INSERT INTO attachments (id,message_id,type,storage_path,width) VALUES
 ('30000000-0000-0000-0000-000000000002','20000000-0000-0000-0000-000000000002','video','a/new.mp4',640),
 ('30000000-0000-0000-0000-000000000003','20000000-0000-0000-0000-000000000002','file','a/doc.pdf',NULL),
 ('30000000-0000-0000-0000-000000000004','20000000-0000-0000-0000-000000000003','image','a/arch-att.jpg',NULL),
 ('30000000-0000-0000-0000-000000000005','20000000-0000-0000-0000-000000000002','image','b/share.jpg',NULL);
INSERT INTO results SELECT 'no automatic copy on new content', count(*) = 2 FROM gallery_items;

\set S2 '''10000000-0000-0000-0000-000000000002'''
SELECT pg_temp.expect_fail('anon cannot execute', 'anon', NULL, 'SELECT rpc_save_story_to_minner('||:S2||')', 'permission denied');
SELECT pg_temp.expect_fail('authenticated w/o uid', 'authenticated', NULL, 'SELECT rpc_save_story_to_minner('||:S2||')', 'unauthorized');
SELECT pg_temp.expect_fail('non-owner member story', 'authenticated', '00000000-0000-0000-0000-00000000000b', 'SELECT rpc_save_story_to_minner('||:S2||')', 'not_owner');
SELECT pg_temp.expect_fail('banned member', 'authenticated', '00000000-0000-0000-0000-00000000000d', 'SELECT rpc_save_story_to_minner('||:S2||')', 'not_approved');
SELECT pg_temp.expect_fail('archived trip story', 'authenticated', '00000000-0000-0000-0000-00000000000a', 'SELECT rpc_save_story_to_minner(''10000000-0000-0000-0000-000000000003'')', 'trip_not_active');
SELECT pg_temp.expect_fail('unknown story id', 'authenticated', '00000000-0000-0000-0000-00000000000a', 'SELECT rpc_save_story_to_minner(gen_random_uuid())', 'not_found');
SELECT pg_temp.expect_fail('non-owner attachment', 'authenticated', '00000000-0000-0000-0000-00000000000b', 'SELECT rpc_save_attachment_to_minner(''30000000-0000-0000-0000-000000000002'')', 'not_owner');
SELECT pg_temp.expect_fail('file attachment rejected', 'authenticated', '00000000-0000-0000-0000-00000000000a', 'SELECT rpc_save_attachment_to_minner(''30000000-0000-0000-0000-000000000003'')', 'unsupported_type');
SELECT pg_temp.expect_fail('archived trip attachment', 'authenticated', '00000000-0000-0000-0000-00000000000a', 'SELECT rpc_save_attachment_to_minner(''30000000-0000-0000-0000-000000000004'')', 'trip_not_active');
SELECT pg_temp.expect_fail('manipulated direct insert w/ story provenance', 'authenticated', '00000000-0000-0000-0000-00000000000b',
  'INSERT INTO gallery_items (uploaded_by,storage_path,type,storage_bucket,source_story_id,trip_id) VALUES (''00000000-0000-0000-0000-00000000000b'',''a/new.jpg'',''image'',''stories'',''10000000-0000-0000-0000-000000000002'',''00000000-0000-0000-0000-0000000000a1'')', 'row-level security');
SELECT pg_temp.expect_fail('direct insert into foreign trip', 'authenticated', '00000000-0000-0000-0000-00000000000c',
  'INSERT INTO gallery_items (uploaded_by,storage_path,type,trip_id) VALUES (''00000000-0000-0000-0000-00000000000c'',''c/x.jpg'',''image'',''00000000-0000-0000-0000-0000000000a1'')', 'row-level security');
INSERT INTO results SELECT 'denials wrote nothing', count(*) = 2 FROM gallery_items;

-- Positive: owner saves story twice (retry) -> one row, server-derived fields.
DO $$ DECLARE r1 gallery_items; r2 gallery_items; BEGIN
  PERFORM set_config('request.uid','00000000-0000-0000-0000-00000000000a', true); SET LOCAL ROLE authenticated;
  r1 := rpc_save_story_to_minner('10000000-0000-0000-0000-000000000002');
  r2 := rpc_save_story_to_minner('10000000-0000-0000-0000-000000000002');
  RESET ROLE;
  INSERT INTO results VALUES ('story save returns row', r1.id IS NOT NULL AND r1.storage_bucket='stories' AND r1.storage_path='a/new.jpg' AND r1.trip_id='00000000-0000-0000-0000-0000000000a1');
  INSERT INTO results VALUES ('story retry idempotent (same id)', r1.id = r2.id);
  -- Historical auto-copied story: saving returns the existing row, no duplicate.
  PERFORM set_config('request.uid','00000000-0000-0000-0000-00000000000a', true); SET LOCAL ROLE authenticated;
  r1 := rpc_save_story_to_minner('10000000-0000-0000-0000-000000000001');
  RESET ROLE;
  INSERT INTO results VALUES ('existing historical row returned', r1.storage_path = 'a/old.jpg');
  -- Owner saves attachment.
  PERFORM set_config('request.uid','00000000-0000-0000-0000-00000000000a', true); SET LOCAL ROLE authenticated;
  r1 := rpc_save_attachment_to_minner('30000000-0000-0000-0000-000000000002');
  RESET ROLE;
  INSERT INTO results VALUES ('attachment save carries metadata', r1.type='video' AND r1.width=640 AND r1.uploaded_by='00000000-0000-0000-0000-00000000000a' AND r1.source_message_id='20000000-0000-0000-0000-000000000002');
  -- Admin (non-member) may save on behalf; uploaded_by stays the sender.
  PERFORM set_config('request.uid','00000000-0000-0000-0000-00000000000f', true); SET LOCAL ROLE authenticated;
  r1 := rpc_save_attachment_to_minner('30000000-0000-0000-0000-000000000005');
  RESET ROLE;
  INSERT INTO results VALUES ('admin save keeps sender as owner', r1.uploaded_by='00000000-0000-0000-0000-00000000000a');
END $$;
INSERT INTO results SELECT 'exactly one row per source path', NOT EXISTS (SELECT 1 FROM gallery_items GROUP BY storage_bucket, storage_path HAVING count(*) > 1);
INSERT INTO results SELECT 'total rows = 2 historical + 3 saved', count(*) = 5 FROM gallery_items;
INSERT INTO results SELECT 'PUBLIC/anon have no EXECUTE', NOT has_function_privilege('anon','public.rpc_save_story_to_minner(uuid)','EXECUTE')
  AND NOT has_function_privilege('anon','public.rpc_save_attachment_to_minner(uuid)','EXECUTE');
INSERT INTO results SELECT 'search_path locked', bool_and(proconfig @> ARRAY['search_path=""']) FROM pg_proc WHERE proname IN ('rpc_save_story_to_minner','rpc_save_attachment_to_minner');

SELECT name, CASE WHEN ok THEN 'PASS' ELSE 'FAIL' END FROM results;
DO $$ BEGIN IF EXISTS (SELECT 1 FROM results WHERE NOT ok) THEN RAISE EXCEPTION 'harness failed'; END IF; END $$;
