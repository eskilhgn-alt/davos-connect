
CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.profiles (id, email)
  VALUES (NEW.id, NEW.email);
  
  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'user');
  
  -- Give new user 5 tokens
  INSERT INTO public.shot_tokens (user_id, balance, last_refill_at)
  VALUES (NEW.id, 5, now())
  ON CONFLICT (user_id) DO NOTHING;
  
  -- Give new user 1 frikort
  INSERT INTO public.user_frikort (user_id, reason)
  VALUES (NEW.id, 'welcome_bonus');
  
  -- Auto-assign admin role for project owner
  IF NEW.email = 'eskilhgn@gmail.com' THEN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, 'admin')
    ON CONFLICT (user_id, role) DO NOTHING;
  END IF;
  
  RETURN NEW;
END;
$function$;
