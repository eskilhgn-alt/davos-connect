
-- A1: Tighten messages INSERT — sender must match auth.uid()
DROP POLICY IF EXISTS "Authenticated can create messages" ON public.messages;
CREATE POLICY "Sender must be self on insert"
  ON public.messages FOR INSERT TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL AND sender_id = (auth.uid())::text);

-- C2: reply_to_id on messages
ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS reply_to_id uuid REFERENCES public.messages(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS messages_reply_to_id_idx ON public.messages(reply_to_id);
CREATE INDEX IF NOT EXISTS messages_thread_created_idx ON public.messages(thread_id, created_at DESC);

-- C3: chat_reads UPDATE WITH CHECK
DROP POLICY IF EXISTS "Users can update own read status" ON public.chat_reads;
CREATE POLICY "Users can update own read status"
  ON public.chat_reads FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- A2: message_reactions normalized table
CREATE TABLE IF NOT EXISTS public.message_reactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id uuid NOT NULL REFERENCES public.messages(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  emoji text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (message_id, user_id)
);
CREATE INDEX IF NOT EXISTS message_reactions_message_idx ON public.message_reactions(message_id);
CREATE INDEX IF NOT EXISTS message_reactions_user_idx ON public.message_reactions(user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.message_reactions TO authenticated;
GRANT ALL ON public.message_reactions TO service_role;

ALTER TABLE public.message_reactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Auth can view reactions"
  ON public.message_reactions FOR SELECT TO authenticated
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Users insert own reactions"
  ON public.message_reactions FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users update own reactions"
  ON public.message_reactions FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users delete own reactions"
  ON public.message_reactions FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

-- updated_at trigger
CREATE TRIGGER trg_message_reactions_updated_at
  BEFORE UPDATE ON public.message_reactions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- Add to realtime publication
ALTER PUBLICATION supabase_realtime ADD TABLE public.message_reactions;

-- Backfill from legacy messages.reactions JSONB — only valid UUID entries
-- Preserve legacy JSONB (do NOT clear) for backward-compat fallback
INSERT INTO public.message_reactions (message_id, user_id, emoji, created_at, updated_at)
SELECT m.id, uid::uuid, emoji_key, m.created_at, now()
FROM public.messages m
CROSS JOIN LATERAL jsonb_each(COALESCE(m.reactions, '{}'::jsonb)) AS r(emoji_key, users_arr)
CROSS JOIN LATERAL jsonb_array_elements_text(users_arr) AS uid
WHERE m.reactions IS NOT NULL
  AND jsonb_typeof(m.reactions) = 'object'
  AND uid ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
ON CONFLICT (message_id, user_id) DO NOTHING;
