-- Add quorum and pin support to polls
ALTER TABLE public.polls ADD COLUMN IF NOT EXISTS min_votes integer DEFAULT NULL;
ALTER TABLE public.polls ADD COLUMN IF NOT EXISTS is_pinned boolean NOT NULL DEFAULT false;

-- Allow admins to update any poll (for pin, force close, cancel)
CREATE POLICY "Admins can update any poll"
ON public.polls
FOR UPDATE
USING (is_admin(auth.uid()));
