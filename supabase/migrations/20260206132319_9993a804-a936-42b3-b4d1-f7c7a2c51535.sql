
-- Drop unused quote tables
DROP TABLE IF EXISTS public.quote_usage;
DROP TABLE IF EXISTS public.quote_history;

-- Remove quote column from weather_ai_daily
ALTER TABLE public.weather_ai_daily DROP COLUMN IF EXISTS quote;

-- Assign admin role to eskilhgn@gmail.com
INSERT INTO public.user_roles (user_id, role)
SELECT id, 'admin'::app_role
FROM auth.users
WHERE email = 'eskilhgn@gmail.com'
ON CONFLICT (user_id, role) DO NOTHING;
