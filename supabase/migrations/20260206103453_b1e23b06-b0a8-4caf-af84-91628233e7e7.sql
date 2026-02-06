
-- Fix the SECURITY DEFINER view warning by dropping and recreating with SECURITY INVOKER
DROP VIEW IF EXISTS public.members_safe;
CREATE VIEW public.members_safe 
WITH (security_invoker = true)
AS SELECT id, display_name, user_id, created_at, thread_id FROM public.members;
