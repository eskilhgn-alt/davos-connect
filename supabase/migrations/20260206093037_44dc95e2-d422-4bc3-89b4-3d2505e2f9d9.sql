-- chat_reads table for "seen by" functionality
CREATE TABLE public.chat_reads (
  message_id uuid NOT NULL REFERENCES public.messages(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  read_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (message_id, user_id)
);

-- Enable RLS
ALTER TABLE public.chat_reads ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Authenticated users can view reads"
ON public.chat_reads
FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Users can mark messages as read"
ON public.chat_reads
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own read status"
ON public.chat_reads
FOR UPDATE
TO authenticated
USING (auth.uid() = user_id);

-- Index for fast lookups
CREATE INDEX idx_chat_reads_message ON public.chat_reads(message_id);
CREATE INDEX idx_chat_reads_user ON public.chat_reads(user_id);