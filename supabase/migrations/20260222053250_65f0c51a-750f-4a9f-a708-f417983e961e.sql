
-- 1. Add hotel_room column to roomie_draws pairs (no schema change needed, pairs is JSONB)
-- But we need a user-editable hotel room field on profiles or a separate table
-- Using a simple table for hotel room assignments

CREATE TABLE IF NOT EXISTS public.roomie_rooms (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  room_label text NOT NULL DEFAULT '',
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.roomie_rooms ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read all rooms"
  ON public.roomie_rooms FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Users can upsert own room"
  ON public.roomie_rooms FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own room"
  ON public.roomie_rooms FOR UPDATE
  USING (auth.uid() = user_id);

-- 2. Story likes table
CREATE TABLE IF NOT EXISTS public.story_likes (
  story_id uuid NOT NULL REFERENCES public.stories(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (story_id, user_id)
);

ALTER TABLE public.story_likes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read story likes"
  ON public.story_likes FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Users can like stories"
  ON public.story_likes FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can unlike stories"
  ON public.story_likes FOR DELETE
  USING (auth.uid() = user_id);

-- Enable realtime for story_likes
ALTER PUBLICATION supabase_realtime ADD TABLE public.story_likes;
