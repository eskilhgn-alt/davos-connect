CREATE UNIQUE INDEX IF NOT EXISTS attachments_message_storage_path_uidx
  ON public.attachments (message_id, storage_path)
  WHERE storage_path IS NOT NULL;