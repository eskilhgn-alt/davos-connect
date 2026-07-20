
DO $$
DECLARE
  v_msg_id uuid;
  v_att jsonb;
  v_url text;
  v_thumb text;
  v_path text;
  v_thumb_path text;
  v_kind text;
  v_prefix text := 'https://psupgftxzyoyeyuhtqgw.supabase.co/storage/v1/object/public/chat-media/';
  v_inserted int := 0;
BEGIN
  ALTER TABLE public.attachments DISABLE TRIGGER trg_sync_attachment_to_gallery;

  FOR v_msg_id, v_att IN
    SELECT m.id,
           jsonb_array_elements(
             CASE WHEN jsonb_typeof(m.attachments) = 'array' THEN m.attachments ELSE '[]'::jsonb END
           )
    FROM public.messages m
    WHERE jsonb_typeof(m.attachments) = 'array'
      AND NOT EXISTS (SELECT 1 FROM public.attachments a WHERE a.message_id = m.id)
  LOOP
    v_kind := v_att->>'kind';
    v_url  := v_att->>'objectUrl';
    v_thumb := v_att->>'thumbUrl';

    IF v_kind NOT IN ('image','video','gif') THEN CONTINUE; END IF;
    IF v_url IS NULL OR position(v_prefix in v_url) <> 1 THEN CONTINUE; END IF;

    v_path := substring(v_url from length(v_prefix) + 1);
    v_thumb_path := NULL;
    IF v_thumb IS NOT NULL AND position(v_prefix in v_thumb) = 1 THEN
      v_thumb_path := substring(v_thumb from length(v_prefix) + 1);
    END IF;

    INSERT INTO public.attachments (message_id, type, storage_bucket, storage_path, thumbnail_path)
    VALUES (v_msg_id, v_kind, 'chat-media', v_path, v_thumb_path);
    v_inserted := v_inserted + 1;
  END LOOP;

  ALTER TABLE public.attachments ENABLE TRIGGER trg_sync_attachment_to_gallery;

  RAISE NOTICE 'Backfilled % legacy chat attachments', v_inserted;
END $$;
