-- Trigger to sync stories to gallery when they are created
-- Stories media will remain in gallery even after the 24h story expires
CREATE OR REPLACE FUNCTION public.sync_story_to_gallery()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  INSERT INTO gallery_items (storage_path, type, uploaded_by)
  VALUES (NEW.storage_path, NEW.type, NEW.user_id)
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_sync_story_to_gallery
AFTER INSERT ON public.stories
FOR EACH ROW
EXECUTE FUNCTION public.sync_story_to_gallery();