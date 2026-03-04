
-- Clean handle_new_user: remove shot_tokens and frikort inserts
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  INSERT INTO public.profiles (id, email)
  VALUES (NEW.id, NEW.email);
  
  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'user');
  
  -- Auto-assign admin role for project owner
  IF NEW.email = 'eskilhgn@gmail.com' THEN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, 'admin')
    ON CONFLICT (user_id, role) DO NOTHING;
  END IF;
  
  RETURN NEW;
END;
$$;

-- Drop unused ski functions
DROP FUNCTION IF EXISTS public.rpc_record_ski_sample(double precision, double precision, double precision, double precision);
DROP FUNCTION IF EXISTS public.rpc_get_ski_leaderboard(integer);
DROP FUNCTION IF EXISTS public.rpc_award_ski_daily_winner();
DROP FUNCTION IF EXISTS public.rpc_award_ski_speed_winner();
DROP FUNCTION IF EXISTS public.rpc_claim_ski_award(uuid, text);

-- Drop unused gamification/points/streaks
DROP FUNCTION IF EXISTS public.rpc_get_gamification_leaderboard();
DROP FUNCTION IF EXISTS public.rpc_get_points_leaderboard(integer);
DROP FUNCTION IF EXISTS public.rpc_award_points(uuid, integer, text, text);

-- Drop unused token functions
DROP FUNCTION IF EXISTS public.rpc_get_shot_tokens();
DROP FUNCTION IF EXISTS public.rpc_get_all_shot_tokens();
DROP FUNCTION IF EXISTS public.rpc_admin_adjust_tokens(uuid, integer, text);
DROP FUNCTION IF EXISTS public.rpc_start_shot_round(text);
DROP FUNCTION IF EXISTS public.rpc_start_monster_round(text);
DROP FUNCTION IF EXISTS public.rpc_use_frikort(uuid);
DROP FUNCTION IF EXISTS public.rpc_check_bonus_token(uuid, text);
DROP FUNCTION IF EXISTS public.rpc_get_shot_leaderboard(text, integer);
