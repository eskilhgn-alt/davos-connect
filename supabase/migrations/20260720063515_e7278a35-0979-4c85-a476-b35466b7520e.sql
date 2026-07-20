
-- ============ 1. gallery_items normalization ============
ALTER TABLE public.gallery_items
  ADD COLUMN IF NOT EXISTS storage_bucket text,
  ADD COLUMN IF NOT EXISTS thumbnail_path text,
  ADD COLUMN IF NOT EXISTS caption text,
  ADD COLUMN IF NOT EXISTS mime_type text,
  ADD COLUMN IF NOT EXISTS size_bytes bigint,
  ADD COLUMN IF NOT EXISTS source_story_id uuid REFERENCES public.stories(id) ON DELETE CASCADE;

-- Reasonable caption length
ALTER TABLE public.gallery_items
  DROP CONSTRAINT IF EXISTS gallery_items_caption_check;
ALTER TABLE public.gallery_items
  ADD CONSTRAINT gallery_items_caption_check CHECK (caption IS NULL OR char_length(caption) <= 500);

-- Backfill storage_bucket
UPDATE public.gallery_items
   SET storage_bucket = CASE
     WHEN source_message_id IS NOT NULL THEN 'chat-media'
     ELSE 'stories'
   END
 WHERE storage_bucket IS NULL;

-- Backfill source_story_id where paths match
UPDATE public.gallery_items g
   SET source_story_id = s.id
  FROM public.stories s
 WHERE g.source_story_id IS NULL
   AND g.storage_bucket = 'stories'
   AND s.storage_path = g.storage_path;

-- Make storage_bucket non-null with sensible constraint
ALTER TABLE public.gallery_items
  ALTER COLUMN storage_bucket SET NOT NULL;
ALTER TABLE public.gallery_items
  DROP CONSTRAINT IF EXISTS gallery_items_storage_bucket_check;
ALTER TABLE public.gallery_items
  ADD CONSTRAINT gallery_items_storage_bucket_check
    CHECK (storage_bucket IN ('chat-media','stories','avatars','round-receipts'));

CREATE INDEX IF NOT EXISTS idx_gallery_items_bucket ON public.gallery_items(storage_bucket);
CREATE INDEX IF NOT EXISTS idx_gallery_items_source_story ON public.gallery_items(source_story_id);
CREATE INDEX IF NOT EXISTS idx_gallery_items_source_message ON public.gallery_items(source_message_id);

-- Update story→gallery trigger to fill new columns
CREATE OR REPLACE FUNCTION public.sync_story_to_gallery()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO gallery_items (storage_path, type, uploaded_by, storage_bucket, source_story_id)
  VALUES (NEW.storage_path, NEW.type, NEW.user_id, 'stories', NEW.id)
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END;
$$;

-- Update attachment→gallery trigger to fill bucket
CREATE OR REPLACE FUNCTION public.sync_attachment_to_gallery()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.type IN ('image', 'video', 'gif') THEN
    INSERT INTO gallery_items (storage_path, type, uploaded_by, source_message_id, width, height, storage_bucket)
    SELECT NEW.storage_path, NEW.type, m.sender_id::uuid, NEW.message_id, NEW.width, NEW.height, 'chat-media'
      FROM messages m
     WHERE m.id = NEW.message_id
    ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

-- Fix gallery RLS: add UPDATE own; DELETE own or admin
DROP POLICY IF EXISTS "Users can delete own gallery items" ON public.gallery_items;
CREATE POLICY "Owner or admin can delete gallery items"
  ON public.gallery_items FOR DELETE TO authenticated
  USING (auth.uid() = uploaded_by OR public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "Users can update own gallery items" ON public.gallery_items;
CREATE POLICY "Users can update own gallery items"
  ON public.gallery_items FOR UPDATE TO authenticated
  USING (auth.uid() = uploaded_by)
  WITH CHECK (auth.uid() = uploaded_by);

-- ============ 2. gallery_likes ============
CREATE TABLE IF NOT EXISTS public.gallery_likes (
  item_id uuid NOT NULL REFERENCES public.gallery_items(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (item_id, user_id)
);
GRANT SELECT, INSERT, DELETE ON public.gallery_likes TO authenticated;
GRANT ALL ON public.gallery_likes TO service_role;
ALTER TABLE public.gallery_likes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "auth read likes" ON public.gallery_likes;
CREATE POLICY "auth read likes" ON public.gallery_likes FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "own insert likes" ON public.gallery_likes;
CREATE POLICY "own insert likes" ON public.gallery_likes FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "own delete likes" ON public.gallery_likes;
CREATE POLICY "own delete likes" ON public.gallery_likes FOR DELETE TO authenticated USING (auth.uid() = user_id);
CREATE INDEX IF NOT EXISTS idx_gallery_likes_item ON public.gallery_likes(item_id);
ALTER TABLE public.gallery_likes REPLICA IDENTITY FULL;

-- ============ 3. gallery_comments ============
CREATE TABLE IF NOT EXISTS public.gallery_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id uuid NOT NULL REFERENCES public.gallery_items(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  body text NOT NULL CHECK (char_length(body) BETWEEN 1 AND 500),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.gallery_comments TO authenticated;
GRANT ALL ON public.gallery_comments TO service_role;
ALTER TABLE public.gallery_comments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "auth read comments" ON public.gallery_comments;
CREATE POLICY "auth read comments" ON public.gallery_comments FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "own insert comments" ON public.gallery_comments;
CREATE POLICY "own insert comments" ON public.gallery_comments FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "own update comments" ON public.gallery_comments;
CREATE POLICY "own update comments" ON public.gallery_comments FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "own or admin delete comments" ON public.gallery_comments;
CREATE POLICY "own or admin delete comments" ON public.gallery_comments FOR DELETE TO authenticated USING (auth.uid() = user_id OR public.is_admin(auth.uid()));
CREATE INDEX IF NOT EXISTS idx_gallery_comments_item ON public.gallery_comments(item_id, created_at);
ALTER TABLE public.gallery_comments REPLICA IDENTITY FULL;
DROP TRIGGER IF EXISTS trg_gallery_comments_updated_at ON public.gallery_comments;
CREATE TRIGGER trg_gallery_comments_updated_at
  BEFORE UPDATE ON public.gallery_comments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- Realtime for likes/comments
ALTER PUBLICATION supabase_realtime ADD TABLE public.gallery_likes;
ALTER PUBLICATION supabase_realtime ADD TABLE public.gallery_comments;

-- ============ 4. story_views: allow idempotent re-view ============
DROP POLICY IF EXISTS "Users can update own views" ON public.story_views;
CREATE POLICY "Users can update own views"
  ON public.story_views FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ============ 5. attachments: add stable metadata columns ============
ALTER TABLE public.attachments
  ADD COLUMN IF NOT EXISTS storage_bucket text NOT NULL DEFAULT 'chat-media',
  ADD COLUMN IF NOT EXISTS filename text,
  ADD COLUMN IF NOT EXISTS mime_type text,
  ADD COLUMN IF NOT EXISTS thumbnail_path text;

-- ============ 6. rounds: track receipt owner ============
ALTER TABLE public.rounds
  ADD COLUMN IF NOT EXISTS receipt_uploaded_by uuid;
