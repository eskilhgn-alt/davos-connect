
-- Rounds table: who bought, what type, total cost
CREATE TABLE public.rounds (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  buyer_id TEXT NOT NULL,
  drink_type TEXT NOT NULL, -- 'drink', 'beer', 'shots'
  total_cost NUMERIC(10,2) NOT NULL DEFAULT 0,
  cost_per_person NUMERIC(10,2) NOT NULL DEFAULT 0,
  note TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Participants in each round
CREATE TABLE public.round_participants (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  round_id UUID NOT NULL REFERENCES public.rounds(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.rounds ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.round_participants ENABLE ROW LEVEL SECURITY;

-- All authenticated users can read all rounds
CREATE POLICY "Authenticated users can view rounds"
  ON public.rounds FOR SELECT
  USING (auth.uid() IS NOT NULL);

-- All authenticated users can insert rounds
CREATE POLICY "Authenticated users can create rounds"
  ON public.rounds FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

-- All authenticated users can view participants
CREATE POLICY "Authenticated users can view round participants"
  ON public.round_participants FOR SELECT
  USING (auth.uid() IS NOT NULL);

-- All authenticated users can insert participants
CREATE POLICY "Authenticated users can create round participants"
  ON public.round_participants FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

-- Enable realtime for rounds
ALTER PUBLICATION supabase_realtime ADD TABLE public.rounds;

-- Index for fast lookups
CREATE INDEX idx_rounds_buyer ON public.rounds(buyer_id);
CREATE INDEX idx_round_participants_round ON public.round_participants(round_id);
CREATE INDEX idx_round_participants_user ON public.round_participants(user_id);
