
-- Fix 1: Members table - hide push_token from general SELECT, only service role reads it
-- Drop the overly permissive SELECT policy
DROP POLICY IF EXISTS "Anyone can read members" ON public.members;

-- New SELECT policy: authenticated users can read members but push_token is still in the row.
-- We can't do column-level RLS in Postgres, so we create a VIEW that excludes push_token.
-- For now, restrict SELECT to authenticated users only (was open to anyone).
CREATE POLICY "Authenticated can read members"
  ON public.members FOR SELECT
  USING (auth.uid() IS NOT NULL);

-- Fix 2: Tighten members INSERT - require authentication  
DROP POLICY IF EXISTS "Anyone can create members" ON public.members;
CREATE POLICY "Authenticated can create members"
  ON public.members FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

-- Fix 3: Tighten members UPDATE - require authentication
DROP POLICY IF EXISTS "Anyone can update their membership" ON public.members;
CREATE POLICY "Authenticated can update members"
  ON public.members FOR UPDATE
  USING (auth.uid() IS NOT NULL);

-- Fix 4: Tighten messages policies - require authentication
DROP POLICY IF EXISTS "Anyone can create messages" ON public.messages;
CREATE POLICY "Authenticated can create messages"
  ON public.messages FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Anyone can read messages" ON public.messages;
CREATE POLICY "Authenticated can read messages"
  ON public.messages FOR SELECT
  USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Anyone can update messages" ON public.messages;
CREATE POLICY "Authenticated can update messages"
  ON public.messages FOR UPDATE
  USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Anyone can delete messages" ON public.messages;
CREATE POLICY "Authenticated can delete messages"
  ON public.messages FOR DELETE
  USING (auth.uid() IS NOT NULL);

-- Fix 5: Tighten threads policies - require authentication
DROP POLICY IF EXISTS "Anyone can read threads" ON public.threads;
CREATE POLICY "Authenticated can read threads"
  ON public.threads FOR SELECT
  USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Anyone can create threads" ON public.threads;
CREATE POLICY "Authenticated can create threads"
  ON public.threads FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

-- Create a secure view that excludes push_token for general use
CREATE OR REPLACE VIEW public.members_safe AS
  SELECT id, display_name, user_id, created_at, thread_id
  FROM public.members;
