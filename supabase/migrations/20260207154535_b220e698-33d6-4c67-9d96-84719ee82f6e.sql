
-- Trigger function: auto-insert chat media attachments into gallery_items
CREATE OR REPLACE FUNCTION public.sync_attachment_to_gallery()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Only sync image, video, gif types
  IF NEW.type IN ('image', 'video', 'gif') THEN
    INSERT INTO gallery_items (storage_path, type, uploaded_by, source_message_id, width, height)
    SELECT
      NEW.storage_path,
      NEW.type,
      m.sender_id::uuid,
      NEW.message_id,
      NEW.width,
      NEW.height
    FROM messages m
    WHERE m.id = NEW.message_id
    ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

-- Create trigger on attachments table
CREATE TRIGGER trg_sync_attachment_to_gallery
  AFTER INSERT ON public.attachments
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_attachment_to_gallery();
