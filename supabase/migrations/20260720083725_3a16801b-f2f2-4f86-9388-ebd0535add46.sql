ALTER TABLE public.gallery_comments ADD COLUMN IF NOT EXISTS client_id uuid;
CREATE UNIQUE INDEX IF NOT EXISTS gallery_comments_user_client_uidx
  ON public.gallery_comments (user_id, client_id) WHERE client_id IS NOT NULL;