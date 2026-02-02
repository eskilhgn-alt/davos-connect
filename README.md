# Davos Ski App

A mobile-first web app for Davos ski area with weather forecasting, chat, and more.

## Weather Engine

The app uses a backend "Weather Engine" that:
- Fetches forecasts from Open-Meteo for 5 mountains (Parsenn, Jakobshorn, Pischa, Rinerhorn, Madrisa)
- Uses 4 weather models: ECMWF, GFS, ICON, GEM
- Computes weighted consensus forecasts
- Caches results in the database for fast loading
- Includes AI-generated weather summaries
- Selects Anchorman quotes based on weather conditions

### Setting up Cron (for Eskil)

The weather cache needs to be refreshed every 15 minutes. Set up a cron job in Lovable Cloud:

1. Go to **Cloud View → Database → SQL Editor** (or use Supabase dashboard)
2. Enable the `pg_cron` and `pg_net` extensions if not already enabled:

```sql
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;
```

3. Create the cron job:

```sql
SELECT cron.schedule(
  'weather-engine-refresh-15min',
  '*/15 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://psupgftxzyoyeyuhtqgw.supabase.co/functions/v1/weather-engine-refresh',
    headers := '{"Content-Type": "application/json", "x-cron-secret": "YOUR_CRON_SECRET_HERE"}'::jsonb,
    body := '{}'::jsonb
  ) AS request_id;
  $$
);
```

**IMPORTANT:** Replace `YOUR_CRON_SECRET_HERE` with the actual CRON_SECRET value stored in Cloud secrets.

4. Verify the cron job is running:

```sql
SELECT * FROM cron.job;
```

5. Check job execution history:

```sql
SELECT * FROM cron.job_run_details ORDER BY start_time DESC LIMIT 10;
```

## Technologies

- Vite + React + TypeScript
- Tailwind CSS + shadcn/ui
- Lovable Cloud (Supabase) for backend
- Open-Meteo API for weather data
- Lovable AI for weather summaries

## Development

```bash
npm install
npm run dev
```

## Project Structure

- `src/pages/` - Page components
- `src/components/` - Reusable UI components
- `src/services/` - API and data services
- `src/features/` - Feature-specific logic (weather quotes, etc.)
- `supabase/functions/` - Edge Functions
