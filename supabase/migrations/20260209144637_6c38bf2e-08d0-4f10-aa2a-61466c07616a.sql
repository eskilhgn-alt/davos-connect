
-- Polls table
CREATE TABLE public.polls (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  created_by UUID NOT NULL,
  question TEXT NOT NULL,
  require_all BOOLEAN NOT NULL DEFAULT false,
  send_push_on_create BOOLEAN NOT NULL DEFAULT true,
  send_push_on_resolved BOOLEAN NOT NULL DEFAULT true,
  deadline_at TIMESTAMP WITH TIME ZONE,
  resolved_at TIMESTAMP WITH TIME ZONE,
  winning_option_id UUID,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Poll options
CREATE TABLE public.poll_options (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  poll_id UUID NOT NULL REFERENCES public.polls(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Poll votes (one per user per poll)
CREATE TABLE public.poll_votes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  poll_id UUID NOT NULL REFERENCES public.polls(id) ON DELETE CASCADE,
  option_id UUID NOT NULL REFERENCES public.poll_options(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(poll_id, user_id)
);

-- Enable RLS
ALTER TABLE public.polls ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.poll_options ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.poll_votes ENABLE ROW LEVEL SECURITY;

-- Polls: any authenticated can read, creator can create
CREATE POLICY "Authenticated can view polls" ON public.polls FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "Authenticated can create polls" ON public.polls FOR INSERT WITH CHECK (auth.uid() = created_by);
CREATE POLICY "Creator can update own polls" ON public.polls FOR UPDATE USING (auth.uid() = created_by);
CREATE POLICY "Creator can delete own polls" ON public.polls FOR DELETE USING (auth.uid() = created_by);

-- Options: any authenticated can read, creator of parent poll can manage
CREATE POLICY "Authenticated can view options" ON public.poll_options FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "Poll creator can insert options" ON public.poll_options FOR INSERT 
  WITH CHECK (EXISTS (SELECT 1 FROM public.polls WHERE id = poll_id AND created_by = auth.uid()));
CREATE POLICY "Poll creator can delete options" ON public.poll_options FOR DELETE 
  USING (EXISTS (SELECT 1 FROM public.polls WHERE id = poll_id AND created_by = auth.uid()));

-- Votes: any authenticated can read, users can vote
CREATE POLICY "Authenticated can view votes" ON public.poll_votes FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "Users can cast vote" ON public.poll_votes FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can change vote" ON public.poll_votes FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can remove vote" ON public.poll_votes FOR DELETE USING (auth.uid() = user_id);

-- Enable realtime for votes
ALTER PUBLICATION supabase_realtime ADD TABLE public.poll_votes;
ALTER PUBLICATION supabase_realtime ADD TABLE public.polls;

-- Trigger for updated_at
CREATE TRIGGER update_polls_updated_at BEFORE UPDATE ON public.polls
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
