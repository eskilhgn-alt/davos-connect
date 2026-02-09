
-- Table to store computed streaks for all users (updated by award-points edge function)
CREATE TABLE public.user_streaks (
  user_id uuid PRIMARY KEY,
  current_streak integer NOT NULL DEFAULT 0,
  best_streak integer NOT NULL DEFAULT 0,
  last_active_date date,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.user_streaks ENABLE ROW LEVEL SECURITY;

-- Everyone can read streaks (it's a leaderboard)
CREATE POLICY "Anyone can read streaks"
  ON public.user_streaks FOR SELECT
  TO authenticated
  USING (true);

-- Only service role inserts/updates (via edge function)
CREATE POLICY "Service role manages streaks"
  ON public.user_streaks FOR ALL
  USING (public.is_admin(auth.uid()));
