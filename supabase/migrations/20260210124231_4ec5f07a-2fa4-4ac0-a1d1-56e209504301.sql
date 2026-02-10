
-- Create storage bucket for round receipts
INSERT INTO storage.buckets (id, name, public) VALUES ('round-receipts', 'round-receipts', true)
ON CONFLICT (id) DO NOTHING;

-- Allow authenticated users to upload receipts
CREATE POLICY "Authenticated users can upload receipts"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'round-receipts');

-- Public read access for receipts
CREATE POLICY "Receipts are publicly readable"
ON storage.objects FOR SELECT
USING (bucket_id = 'round-receipts');
