
-- Places table: normalized restaurant data from any source
CREATE TABLE public.places (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  source text NOT NULL DEFAULT 'manual',
  external_id text,
  name text NOT NULL,
  lat double precision NOT NULL,
  lng double precision NOT NULL,
  address text,
  city text,
  country text,
  price_level integer,
  rating numeric,
  review_count integer,
  categories jsonb DEFAULT '[]'::jsonb,
  opening_hours jsonb,
  website text,
  phone text,
  photo_url text,
  last_synced_at timestamptz DEFAULT now(),
  raw_source_payload jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.places ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read places"
  ON public.places FOR SELECT
  USING (auth.uid() IS NOT NULL);

-- Unique constraint on source + external_id to prevent duplicates
CREATE UNIQUE INDEX idx_places_source_external ON public.places (source, external_id) WHERE external_id IS NOT NULL;
CREATE INDEX idx_places_location ON public.places (lat, lng);

-- Place signals: AI-generated scores and summaries
CREATE TABLE public.place_signals (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  place_id uuid NOT NULL REFERENCES public.places(id) ON DELETE CASCADE,
  ai_summary text,
  why_this text,
  touristy_score numeric,
  local_vibe_score numeric,
  group_friendly_score numeric,
  quick_bite_score numeric,
  date_night_score numeric,
  value_score numeric,
  quality_score numeric,
  evidence jsonb DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(place_id)
);

ALTER TABLE public.place_signals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read place_signals"
  ON public.place_signals FOR SELECT
  USING (auth.uid() IS NOT NULL);

-- Query cache: avoid redundant API calls
CREATE TABLE public.place_query_cache (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  location_hash text NOT NULL,
  lat double precision NOT NULL,
  lng double precision NOT NULL,
  radius_m integer NOT NULL,
  query_type text NOT NULL,
  filters jsonb DEFAULT '{}'::jsonb,
  result_place_ids jsonb DEFAULT '[]'::jsonb,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.place_query_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read query cache"
  ON public.place_query_cache FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE INDEX idx_place_query_cache_hash ON public.place_query_cache (location_hash, query_type);
