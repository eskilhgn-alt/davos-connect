
-- Bug reports table
CREATE TABLE public.bug_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  message text NOT NULL,
  page_url text,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.bug_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can create own reports"
  ON public.bug_reports FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Admins can read all reports"
  ON public.bug_reports FOR SELECT
  USING (is_admin(auth.uid()));

CREATE POLICY "Users can read own reports"
  ON public.bug_reports FOR SELECT
  USING (auth.uid() = user_id);
