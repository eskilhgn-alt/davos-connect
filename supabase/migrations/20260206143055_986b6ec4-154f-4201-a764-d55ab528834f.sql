
-- Make chat-media bucket readable for chat attachments
UPDATE storage.buckets SET public = true WHERE id = 'chat-media';

-- Allow authenticated users to upload to chat-media
CREATE POLICY "Authenticated can upload chat media"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'chat-media' AND auth.uid() IS NOT NULL);

-- Allow public reads on chat-media (bucket is public)
CREATE POLICY "Public can read chat media"
ON storage.objects FOR SELECT
USING (bucket_id = 'chat-media');
