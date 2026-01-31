-- Add unique constraint on user_id and thread_id for upsert to work
ALTER TABLE public.members 
ADD CONSTRAINT members_user_thread_unique UNIQUE (user_id, thread_id);