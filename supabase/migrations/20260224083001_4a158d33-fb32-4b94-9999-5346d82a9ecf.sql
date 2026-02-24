
-- Fix shot_events FKs that block user deletion (change NO ACTION to SET NULL)
ALTER TABLE public.shot_events DROP CONSTRAINT shot_events_selected_user_id_fkey;
ALTER TABLE public.shot_events ADD CONSTRAINT shot_events_selected_user_id_fkey
  FOREIGN KEY (selected_user_id) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.shot_events DROP CONSTRAINT shot_events_started_by_fkey;
ALTER TABLE public.shot_events ADD CONSTRAINT shot_events_started_by_fkey
  FOREIGN KEY (started_by) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.shot_events DROP CONSTRAINT shot_events_witness_confirmed_by_fkey;
ALTER TABLE public.shot_events ADD CONSTRAINT shot_events_witness_confirmed_by_fkey
  FOREIGN KEY (witness_confirmed_by) REFERENCES auth.users(id) ON DELETE SET NULL;

-- Fix shot_event_log FK
ALTER TABLE public.shot_event_log DROP CONSTRAINT shot_event_log_actor_id_fkey;
ALTER TABLE public.shot_event_log ADD CONSTRAINT shot_event_log_actor_id_fkey
  FOREIGN KEY (actor_id) REFERENCES auth.users(id) ON DELETE SET NULL;

-- started_by is NOT NULL, so we need to allow NULL for it to work with SET NULL
ALTER TABLE public.shot_events ALTER COLUMN started_by DROP NOT NULL;
