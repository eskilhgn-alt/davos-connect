
-- GPS track points for ski route visualization
CREATE TABLE public.ski_track_points (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  day_date date NOT NULL DEFAULT CURRENT_DATE,
  lat double precision NOT NULL,
  lon double precision NOT NULL,
  altitude double precision NOT NULL,
  speed double precision,
  direction text NOT NULL DEFAULT 'down', -- 'up' = lift, 'down' = skiing
  recorded_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_ski_track_points_user_day ON public.ski_track_points (user_id, day_date);
CREATE INDEX idx_ski_track_points_day ON public.ski_track_points (day_date);

ALTER TABLE public.ski_track_points ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can insert own track points"
  ON public.ski_track_points FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Authenticated can read all track points"
  ON public.ski_track_points FOR SELECT
  USING (auth.uid() IS NOT NULL);

-- Debt settlements table for Venmo-style tracking
CREATE TABLE public.debt_settlements (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  from_user_id uuid NOT NULL,
  to_user_id uuid NOT NULL,
  amount numeric NOT NULL,
  note text,
  settled_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid NOT NULL
);

ALTER TABLE public.debt_settlements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read all settlements"
  ON public.debt_settlements FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Users can create settlements"
  ON public.debt_settlements FOR INSERT
  WITH CHECK (auth.uid() = created_by);

-- Enable realtime for track points
ALTER PUBLICATION supabase_realtime ADD TABLE public.ski_track_points;
