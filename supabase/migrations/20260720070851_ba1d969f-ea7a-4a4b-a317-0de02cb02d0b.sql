DROP INDEX IF EXISTS public.attachments_message_storage_path_uidx;
CREATE UNIQUE INDEX attachments_message_storage_path_uidx
  ON public.attachments (message_id, storage_path);