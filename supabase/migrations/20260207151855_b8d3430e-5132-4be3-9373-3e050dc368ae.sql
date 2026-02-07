-- Allow all authenticated users to see all profiles (private group app)
DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
DROP POLICY IF EXISTS "Admins can view all profiles" ON public.profiles;

CREATE POLICY "Authenticated can view all profiles"
ON public.profiles
FOR SELECT
USING (auth.uid() IS NOT NULL);

-- Ensure chat_reads has proper unique constraint for upsert
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'chat_reads_pkey' OR conname = 'chat_reads_message_id_user_id_key'
  ) THEN
    ALTER TABLE public.chat_reads ADD CONSTRAINT chat_reads_message_id_user_id_key UNIQUE (message_id, user_id);
  END IF;
END $$;