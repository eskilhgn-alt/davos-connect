-- CHAT-MEDIA-01: explicit "Lagre i Minner". Idempotent, non-destructive.
-- No rows are deleted or updated. Auto-copy triggers are removed so that new
-- permanent copies only happen through the explicit RPCs below.

DROP TRIGGER IF EXISTS trg_sync_story_to_gallery ON public.stories;
DROP TRIGGER IF EXISTS trg_sync_attachment_to_gallery ON public.attachments;
-- Functions kept for history but locked away from clients.
REVOKE ALL ON FUNCTION public.sync_story_to_gallery() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.sync_attachment_to_gallery() FROM PUBLIC, anon, authenticated;

CREATE UNIQUE INDEX IF NOT EXISTS gallery_items_bucket_path_key
  ON public.gallery_items (storage_bucket, storage_path);

-- Direct Minner-upload may not fake provenance or target a trip the caller is
-- not an approved member of. Restrictive => ANDed with existing permissive policies.
DROP POLICY IF EXISTS chat_media_direct_insert_guard ON public.gallery_items;
CREATE POLICY chat_media_direct_insert_guard ON public.gallery_items
  AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (
    source_story_id IS NULL
    AND source_message_id IS NULL
    AND uploaded_by = auth.uid()
    AND (public.is_admin(auth.uid()) OR public.is_approved_trip_member(trip_id, auth.uid()))
  );

CREATE OR REPLACE FUNCTION public.rpc_save_story_to_minner(p_story_id uuid)
RETURNS public.gallery_items
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_story public.stories%ROWTYPE;
  v_row public.gallery_items%ROWTYPE;
  v_admin boolean;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'unauthorized' USING ERRCODE = '28000'; END IF;
  IF NOT public.is_approved_member(v_uid) THEN RAISE EXCEPTION 'not_approved' USING ERRCODE = '42501'; END IF;
  SELECT * INTO v_story FROM public.stories WHERE id = p_story_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'not_found' USING ERRCODE = 'P0002'; END IF;
  v_admin := public.is_admin(v_uid);
  IF v_story.user_id <> v_uid AND NOT v_admin THEN RAISE EXCEPTION 'not_owner' USING ERRCODE = '42501'; END IF;
  IF NOT v_admin AND NOT public.is_trip_member(v_story.trip_id, v_uid) THEN
    RAISE EXCEPTION 'not_trip_member' USING ERRCODE = '42501';
  END IF;
  IF NOT public.is_trip_active(v_story.trip_id) THEN RAISE EXCEPTION 'trip_not_active' USING ERRCODE = '42501'; END IF;

  INSERT INTO public.gallery_items (storage_path, storage_bucket, type, uploaded_by, source_story_id, trip_id)
  VALUES (v_story.storage_path, 'stories', v_story.type, v_story.user_id, v_story.id, v_story.trip_id)
  ON CONFLICT (storage_bucket, storage_path) DO NOTHING;

  SELECT * INTO v_row FROM public.gallery_items
   WHERE storage_bucket = 'stories' AND storage_path = v_story.storage_path;
  RETURN v_row;
END;
$$;

CREATE OR REPLACE FUNCTION public.rpc_save_attachment_to_minner(p_attachment_id uuid)
RETURNS public.gallery_items
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_att public.attachments%ROWTYPE;
  v_msg public.messages%ROWTYPE;
  v_row public.gallery_items%ROWTYPE;
  v_admin boolean;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'unauthorized' USING ERRCODE = '28000'; END IF;
  IF NOT public.is_approved_member(v_uid) THEN RAISE EXCEPTION 'not_approved' USING ERRCODE = '42501'; END IF;
  SELECT * INTO v_att FROM public.attachments WHERE id = p_attachment_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'not_found' USING ERRCODE = 'P0002'; END IF;
  IF v_att.type NOT IN ('image', 'video', 'gif') THEN RAISE EXCEPTION 'unsupported_type' USING ERRCODE = '22023'; END IF;
  SELECT * INTO v_msg FROM public.messages WHERE id = v_att.message_id;
  IF NOT FOUND OR v_msg.deleted_at IS NOT NULL THEN RAISE EXCEPTION 'not_found' USING ERRCODE = 'P0002'; END IF;
  v_admin := public.is_admin(v_uid);
  IF v_msg.sender_id <> v_uid::text AND NOT v_admin THEN RAISE EXCEPTION 'not_owner' USING ERRCODE = '42501'; END IF;
  IF NOT v_admin AND NOT public.is_trip_member(v_msg.trip_id, v_uid) THEN
    RAISE EXCEPTION 'not_trip_member' USING ERRCODE = '42501';
  END IF;
  IF NOT public.is_trip_active(v_msg.trip_id) THEN RAISE EXCEPTION 'trip_not_active' USING ERRCODE = '42501'; END IF;

  INSERT INTO public.gallery_items (storage_path, storage_bucket, thumbnail_path, type, uploaded_by,
                                    source_message_id, width, height, mime_type, size_bytes, trip_id)
  VALUES (v_att.storage_path, v_att.storage_bucket, v_att.thumbnail_path, v_att.type, v_msg.sender_id::uuid,
          v_msg.id, v_att.width, v_att.height, v_att.mime_type, v_att.file_size, v_msg.trip_id)
  ON CONFLICT (storage_bucket, storage_path) DO NOTHING;

  SELECT * INTO v_row FROM public.gallery_items
   WHERE storage_bucket = v_att.storage_bucket AND storage_path = v_att.storage_path;
  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_save_story_to_minner(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.rpc_save_attachment_to_minner(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_save_story_to_minner(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.rpc_save_attachment_to_minner(uuid) TO authenticated, service_role;
