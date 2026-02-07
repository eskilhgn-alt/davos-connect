
-- Table for storing real-time user positions
CREATE TABLE public.user_locations (
  user_id uuid NOT NULL PRIMARY KEY,
  lat double precision NOT NULL,
  lon double precision NOT NULL,
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.user_locations ENABLE ROW LEVEL SECURITY;

-- All authenticated users can see everyone's location
CREATE POLICY "Authenticated can read all locations"
ON public.user_locations FOR SELECT
USING (auth.uid() IS NOT NULL);

-- Users can insert their own location
CREATE POLICY "Users can insert own location"
ON public.user_locations FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- Users can update their own location
CREATE POLICY "Users can update own location"
ON public.user_locations FOR UPDATE
USING (auth.uid() = user_id);

-- Users can delete their own location
CREATE POLICY "Users can delete own location"
ON public.user_locations FOR DELETE
USING (auth.uid() = user_id);

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.user_locations;
