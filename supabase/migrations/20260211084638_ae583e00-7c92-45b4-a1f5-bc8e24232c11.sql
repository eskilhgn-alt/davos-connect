-- Allow admins to delete bug reports
CREATE POLICY "Admins can delete reports"
ON public.bug_reports
FOR DELETE
USING (is_admin(auth.uid()));