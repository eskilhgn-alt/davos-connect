
-- Allow admins to read all token_ledger entries
CREATE POLICY "Admins can read all token_ledger"
  ON public.token_ledger FOR SELECT
  USING (public.is_admin(auth.uid()));

-- Allow admins to read all push_tokens (for push status overview)
CREATE POLICY "Admins can read all push_tokens"
  ON public.push_tokens FOR SELECT
  USING (public.is_admin(auth.uid()));

-- Allow admin to insert frikort
CREATE POLICY "Admins can insert frikort"
  ON public.user_frikort FOR INSERT
  WITH CHECK (public.is_admin(auth.uid()));
