-- Stories table
CREATE TABLE public.stories (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  storage_path text NOT NULL,
  type text NOT NULL DEFAULT 'video', -- 'video' | 'image'
  duration_sec integer DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '24 hours')
);

ALTER TABLE public.stories ENABLE ROW LEVEL SECURITY;

-- All authenticated users can view stories
CREATE POLICY "Authenticated can view stories"
ON public.stories FOR SELECT
USING (auth.uid() IS NOT NULL);

-- Users can create own stories
CREATE POLICY "Users can create own stories"
ON public.stories FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- Users can delete own stories
CREATE POLICY "Users can delete own stories"
ON public.stories FOR DELETE
USING (auth.uid() = user_id);

-- Story views tracking
CREATE TABLE public.story_views (
  story_id uuid NOT NULL REFERENCES public.stories(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  viewed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (story_id, user_id)
);

ALTER TABLE public.story_views ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view story_views"
ON public.story_views FOR SELECT
USING (auth.uid() IS NOT NULL);

CREATE POLICY "Users can insert own views"
ON public.story_views FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- Storage bucket for stories
INSERT INTO storage.buckets (id, name, public) VALUES ('stories', 'stories', true);

-- Storage policies
CREATE POLICY "Anyone can view stories media"
ON storage.objects FOR SELECT
USING (bucket_id = 'stories');

CREATE POLICY "Authenticated can upload stories"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'stories' AND auth.uid() IS NOT NULL);

CREATE POLICY "Users can delete own stories media"
ON storage.objects FOR DELETE
USING (bucket_id = 'stories' AND auth.uid()::text = (storage.foldername(name))[1]);

-- Enable realtime for stories
ALTER PUBLICATION supabase_realtime ADD TABLE public.stories;