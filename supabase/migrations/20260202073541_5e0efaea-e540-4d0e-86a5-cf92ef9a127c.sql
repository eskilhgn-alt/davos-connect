-- Weather Engine Cache Tables
-- Stores cached weather data from Open-Meteo multi-model aggregation

-- Table: weather_cache
-- Stores cached weather payload per mountain (or 'davos' for regional)
CREATE TABLE public.weather_cache (
  mountain_id text PRIMARY KEY,
  generated_at timestamptz NOT NULL DEFAULT now(),
  payload jsonb NOT NULL
);

-- Enable RLS
ALTER TABLE public.weather_cache ENABLE ROW LEVEL SECURITY;

-- Policy: Anyone can read cached weather (public data)
CREATE POLICY "Anyone can read weather cache"
  ON public.weather_cache
  FOR SELECT
  USING (true);

-- No insert/update policies for anon - only service role can write

-- Table: weather_model_weights
-- Optional table for custom model weighting per mountain
CREATE TABLE public.weather_model_weights (
  mountain_id text PRIMARY KEY,
  weights jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.weather_model_weights ENABLE ROW LEVEL SECURITY;

-- Policy: Anyone can read weights (public config)
CREATE POLICY "Anyone can read weather weights"
  ON public.weather_model_weights
  FOR SELECT
  USING (true);

-- No insert/update policies for anon - only service role can write