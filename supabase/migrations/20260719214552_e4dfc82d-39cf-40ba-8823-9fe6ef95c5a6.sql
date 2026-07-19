DROP POLICY IF EXISTS "Authenticated can update messages" ON public.messages;
CREATE POLICY "Sender or admin can update messages"
  ON public.messages FOR UPDATE
  TO authenticated
  USING (
    sender_id = auth.uid()::text
    OR public.is_admin(auth.uid())
  )
  WITH CHECK (
    sender_id = auth.uid()::text
    OR public.is_admin(auth.uid())
  );

DROP POLICY IF EXISTS "Authenticated can delete messages" ON public.messages;
CREATE POLICY "Sender or admin can delete messages"
  ON public.messages FOR DELETE
  TO authenticated
  USING (
    sender_id = auth.uid()::text
    OR public.is_admin(auth.uid())
  );