
-- Table for faktasjekker threads (shared across all users)
CREATE TABLE public.faktasjekker_threads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  title text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Table for messages within threads
CREATE TABLE public.faktasjekker_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id uuid NOT NULL REFERENCES public.faktasjekker_threads(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('user', 'assistant')),
  content text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.faktasjekker_threads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.faktasjekker_messages ENABLE ROW LEVEL SECURITY;

-- All authenticated users can read all threads
CREATE POLICY "Authenticated can read all threads"
  ON public.faktasjekker_threads FOR SELECT
  USING (auth.uid() IS NOT NULL);

-- Users can create own threads
CREATE POLICY "Users can create own threads"
  ON public.faktasjekker_threads FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Users can delete own threads
CREATE POLICY "Users can delete own threads"
  ON public.faktasjekker_threads FOR DELETE
  USING (auth.uid() = user_id);

-- All authenticated users can read all messages
CREATE POLICY "Authenticated can read all messages"
  ON public.faktasjekker_messages FOR SELECT
  USING (auth.uid() IS NOT NULL);

-- Users can insert messages into own threads
CREATE POLICY "Users can insert messages into own threads"
  ON public.faktasjekker_messages FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.faktasjekker_threads
    WHERE id = thread_id AND user_id = auth.uid()
  ));

-- Users can update messages in own threads (for streaming)
CREATE POLICY "Users can update messages in own threads"
  ON public.faktasjekker_messages FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM public.faktasjekker_threads
    WHERE id = faktasjekker_messages.thread_id AND user_id = auth.uid()
  ));

-- Index for fast lookups
CREATE INDEX idx_faktasjekker_messages_thread ON public.faktasjekker_messages(thread_id);
CREATE INDEX idx_faktasjekker_threads_created ON public.faktasjekker_threads(created_at DESC);
