-- Speed tracking: daily top speed per user
CREATE TABLE public.ski_speed_records (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  day_date DATE NOT NULL DEFAULT CURRENT_DATE,
  max_speed_kmh NUMERIC(6,2) NOT NULL DEFAULT 0,
  altitude_m NUMERIC(7,1) NULL,
  lat NUMERIC(10,7) NULL,
  lon NUMERIC(10,7) NULL,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, day_date)
);

ALTER TABLE public.ski_speed_records ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view all speed records"
  ON public.ski_speed_records FOR SELECT USING (true);

CREATE POLICY "Users can insert own speed records"
  ON public.ski_speed_records FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own speed records"
  ON public.ski_speed_records FOR UPDATE USING (auth.uid() = user_id);

ALTER PUBLICATION supabase_realtime ADD TABLE public.ski_speed_records;
