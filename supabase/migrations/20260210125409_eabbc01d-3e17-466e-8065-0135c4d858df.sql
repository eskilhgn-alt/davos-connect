
-- Add is_treated (spandert) column to rounds
ALTER TABLE public.rounds ADD COLUMN is_treated boolean NOT NULL DEFAULT false;
