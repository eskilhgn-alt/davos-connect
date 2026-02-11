-- Allow authenticated users to update their own rounds
CREATE POLICY "Buyer can update own rounds"
ON public.rounds
FOR UPDATE
USING (auth.uid()::text = buyer_id)
WITH CHECK (auth.uid()::text = buyer_id);
