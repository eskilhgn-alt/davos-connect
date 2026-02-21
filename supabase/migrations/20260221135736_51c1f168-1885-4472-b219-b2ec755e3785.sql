
-- Table for roomie draws (room pairing events)
CREATE TABLE public.roomie_draws (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  created_by uuid NOT NULL,
  status text NOT NULL DEFAULT 'countdown',
  pairs jsonb NOT NULL DEFAULT '[]'::jsonb,
  countdown_ends_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.roomie_draws ENABLE ROW LEVEL SECURITY;

-- All authenticated users can read draws
CREATE POLICY "Authenticated can read roomie draws"
  ON public.roomie_draws FOR SELECT
  USING (auth.uid() IS NOT NULL);

-- Only admins can insert
CREATE POLICY "Admins can create roomie draws"
  ON public.roomie_draws FOR INSERT
  WITH CHECK (is_admin(auth.uid()));

-- Only admins can update
CREATE POLICY "Admins can update roomie draws"
  ON public.roomie_draws FOR UPDATE
  USING (is_admin(auth.uid()));

-- Only admins can delete
CREATE POLICY "Admins can delete roomie draws"
  ON public.roomie_draws FOR DELETE
  USING (is_admin(auth.uid()));

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.roomie_draws;
