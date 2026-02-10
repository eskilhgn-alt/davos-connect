
-- Allow admins to read all shot_tokens (for ban management)
CREATE POLICY "Admins can read all shot_tokens"
ON public.shot_tokens
FOR SELECT
USING (is_admin(auth.uid()));
