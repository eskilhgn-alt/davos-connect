-- ============================================
-- CHAT BACKEND: threads, members, messages
-- ============================================

-- Threads table (chat rooms/crews)
CREATE TABLE public.threads (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL DEFAULT 'Crew Chat',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Members table (who belongs to which thread)
CREATE TABLE public.members (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  thread_id UUID NOT NULL REFERENCES public.threads(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL, -- local device id (no auth required)
  display_name TEXT NOT NULL,
  push_token TEXT, -- OneSignal player ID for push
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(thread_id, user_id)
);

-- Messages table
CREATE TABLE public.messages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  thread_id UUID NOT NULL REFERENCES public.threads(id) ON DELETE CASCADE,
  sender_id TEXT NOT NULL,
  sender_name TEXT NOT NULL,
  text TEXT NOT NULL DEFAULT '',
  attachments JSONB DEFAULT '[]'::jsonb,
  reactions JSONB DEFAULT '{}'::jsonb,
  edited_at TIMESTAMP WITH TIME ZONE,
  deleted_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Indexes for performance
CREATE INDEX idx_messages_thread_id ON public.messages(thread_id);
CREATE INDEX idx_messages_created_at ON public.messages(created_at DESC);
CREATE INDEX idx_members_thread_id ON public.members(thread_id);
CREATE INDEX idx_members_user_id ON public.members(user_id);

-- Enable RLS
ALTER TABLE public.threads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

-- RLS Policies: Allow all operations for now (no auth)
-- Threads: anyone can read/create
CREATE POLICY "Anyone can read threads" ON public.threads FOR SELECT USING (true);
CREATE POLICY "Anyone can create threads" ON public.threads FOR INSERT WITH CHECK (true);

-- Members: anyone can read/create/update their own
CREATE POLICY "Anyone can read members" ON public.members FOR SELECT USING (true);
CREATE POLICY "Anyone can create members" ON public.members FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can update their membership" ON public.members FOR UPDATE USING (true);

-- Messages: anyone can read/create/update/delete
CREATE POLICY "Anyone can read messages" ON public.messages FOR SELECT USING (true);
CREATE POLICY "Anyone can create messages" ON public.messages FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can update messages" ON public.messages FOR UPDATE USING (true);
CREATE POLICY "Anyone can delete messages" ON public.messages FOR DELETE USING (true);

-- Enable realtime for messages
ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;

-- Create default thread for the crew
INSERT INTO public.threads (id, name) VALUES ('00000000-0000-0000-0000-000000000001', 'Crew Chat');