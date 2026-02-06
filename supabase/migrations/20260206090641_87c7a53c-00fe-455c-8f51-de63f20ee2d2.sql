-- WEATHER ENGINE V2 - Database Schema
-- Creates comprehensive weather data storage with historical tracking and AI output

-- 1) WEATHER SOURCES - Weather model providers
CREATE TABLE IF NOT EXISTS public.weather_sources (
  id text PRIMARY KEY,
  name text NOT NULL,
  is_active boolean DEFAULT true NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL
);

-- Enable RLS
ALTER TABLE public.weather_sources ENABLE ROW LEVEL SECURITY;

-- Policy: Anyone authenticated can read
CREATE POLICY "Anyone can read weather_sources" ON public.weather_sources
  FOR SELECT USING (true);

-- 2) WEATHER LOCATIONS - Mountains and aggregate locations  
CREATE TABLE IF NOT EXISTS public.weather_locations (
  id text PRIMARY KEY,
  name text NOT NULL,
  lat double precision NOT NULL,
  lon double precision NOT NULL,
  elevation_m integer,
  is_active boolean DEFAULT true NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL
);

-- Enable RLS
ALTER TABLE public.weather_locations ENABLE ROW LEVEL SECURITY;

-- Policy: Anyone can read
CREATE POLICY "Anyone can read weather_locations" ON public.weather_locations
  FOR SELECT USING (true);

-- 3) WEATHER RAW DAILY - Raw forecasts from each model
CREATE TABLE IF NOT EXISTS public.weather_raw_daily (
  id bigserial PRIMARY KEY,
  run_at timestamptz NOT NULL DEFAULT now(),
  source_id text NOT NULL REFERENCES public.weather_sources(id) ON DELETE CASCADE,
  location_id text NOT NULL REFERENCES public.weather_locations(id) ON DELETE CASCADE,
  day_date date NOT NULL,
  payload jsonb NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  UNIQUE (run_at, source_id, location_id, day_date)
);

-- Index for efficient lookups
CREATE INDEX IF NOT EXISTS idx_weather_raw_daily_lookup 
  ON public.weather_raw_daily (source_id, location_id, day_date);
CREATE INDEX IF NOT EXISTS idx_weather_raw_daily_run 
  ON public.weather_raw_daily (run_at DESC);

-- Enable RLS
ALTER TABLE public.weather_raw_daily ENABLE ROW LEVEL SECURITY;

-- Policy: Anyone can read
CREATE POLICY "Anyone can read weather_raw_daily" ON public.weather_raw_daily
  FOR SELECT USING (true);

-- 4) WEATHER OBSERVED DAILY - Actual historical weather (ground truth)
CREATE TABLE IF NOT EXISTS public.weather_observed_daily (
  id bigserial PRIMARY KEY,
  location_id text NOT NULL REFERENCES public.weather_locations(id) ON DELETE CASCADE,
  day_date date NOT NULL,
  observed jsonb NOT NULL,
  source text DEFAULT 'open-meteo-archive' NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  UNIQUE (location_id, day_date)
);

-- Index for efficient lookups
CREATE INDEX IF NOT EXISTS idx_weather_observed_daily_lookup 
  ON public.weather_observed_daily (location_id, day_date DESC);

-- Enable RLS
ALTER TABLE public.weather_observed_daily ENABLE ROW LEVEL SECURITY;

-- Policy: Anyone can read
CREATE POLICY "Anyone can read weather_observed_daily" ON public.weather_observed_daily
  FOR SELECT USING (true);

-- 5) WEATHER SOURCE SCORES - Per-source accuracy scores
CREATE TABLE IF NOT EXISTS public.weather_source_scores (
  id bigserial PRIMARY KEY,
  location_id text NOT NULL REFERENCES public.weather_locations(id) ON DELETE CASCADE,
  source_id text NOT NULL REFERENCES public.weather_sources(id) ON DELETE CASCADE,
  day_date date NOT NULL,
  mae_temp double precision NOT NULL,
  mae_wind double precision NOT NULL,
  mae_precip double precision NOT NULL,
  mae_snow double precision NOT NULL,
  total_score double precision NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  UNIQUE (location_id, source_id, day_date)
);

-- Index for rolling window lookups
CREATE INDEX IF NOT EXISTS idx_weather_source_scores_rolling 
  ON public.weather_source_scores (source_id, day_date DESC);

-- Enable RLS
ALTER TABLE public.weather_source_scores ENABLE ROW LEVEL SECURITY;

-- Policy: Anyone can read
CREATE POLICY "Anyone can read weather_source_scores" ON public.weather_source_scores
  FOR SELECT USING (true);

-- 6) WEATHER AI DAILY - AI-aggregated output for UI
CREATE TABLE IF NOT EXISTS public.weather_ai_daily (
  id bigserial PRIMARY KEY,
  run_at timestamptz NOT NULL DEFAULT now(),
  location_id text NOT NULL REFERENCES public.weather_locations(id) ON DELETE CASCADE,
  day_date date NOT NULL,
  ai_daily jsonb NOT NULL,
  confidence text NOT NULL CHECK (confidence IN ('low', 'medium', 'high')),
  rationale_short text NOT NULL,
  ai_summary_today text,
  ai_summary_tomorrow text,
  quote jsonb,
  source_weights jsonb NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  UNIQUE (run_at, location_id, day_date)
);

-- Index for latest fetch
CREATE INDEX IF NOT EXISTS idx_weather_ai_daily_latest 
  ON public.weather_ai_daily (location_id, run_at DESC);

-- Enable RLS
ALTER TABLE public.weather_ai_daily ENABLE ROW LEVEL SECURITY;

-- Policy: Anyone can read
CREATE POLICY "Anyone can read weather_ai_daily" ON public.weather_ai_daily
  FOR SELECT USING (true);

-- 7) QUOTE HISTORY - Anti-repeat tracking for quotes
CREATE TABLE IF NOT EXISTS public.quote_history (
  id bigserial PRIMARY KEY,
  quote_hash text NOT NULL,
  speaker text NOT NULL,
  category text NOT NULL,
  last_used_at date NOT NULL DEFAULT CURRENT_DATE,
  used_count integer DEFAULT 1 NOT NULL,
  UNIQUE (quote_hash)
);

CREATE INDEX IF NOT EXISTS idx_quote_history_recent 
  ON public.quote_history (last_used_at DESC);

-- Enable RLS
ALTER TABLE public.quote_history ENABLE ROW LEVEL SECURITY;

-- Policy: Anyone can read
CREATE POLICY "Anyone can read quote_history" ON public.quote_history
  FOR SELECT USING (true);

-- ================================================
-- SEED DATA
-- ================================================

-- Insert weather sources (includes Yr.no)
INSERT INTO public.weather_sources (id, name, is_active) VALUES
  ('ecmwf', 'ECMWF IFS', true),
  ('gfs', 'GFS (NOAA)', true),
  ('icon', 'ICON (DWD)', true),
  ('gem', 'GEM (ECCC)', true),
  ('yr', 'Yr.no (MET Norway)', true)
ON CONFLICT (id) DO NOTHING;

-- Insert weather locations (mountains + aggregate)
INSERT INTO public.weather_locations (id, name, lat, lon, elevation_m, is_active) VALUES
  ('parsenn', 'Parsenn', 46.83, 9.80, 2844, true),
  ('jakobshorn', 'Jakobshorn', 46.77, 9.85, 2590, true),
  ('pischa', 'Pischa', 46.85, 9.90, 2483, true),
  ('rinerhorn', 'Rinerhorn', 46.74, 9.77, 2490, true),
  ('madrisa', 'Madrisa', 46.93, 9.86, 2602, true),
  ('davos_agg', 'Davos (aggregert)', 46.80, 9.84, 1560, true)
ON CONFLICT (id) DO NOTHING;