
-- Add drink quantities as JSON: e.g. {"beer": 3, "shots": 2, "drink": 0}
ALTER TABLE public.rounds ADD COLUMN drink_quantities JSONB NOT NULL DEFAULT '{}';
-- drink_type becomes less important now, but keep for backwards compat
