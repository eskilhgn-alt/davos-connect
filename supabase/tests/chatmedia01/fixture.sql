-- Minimal Supabase-like fixture for CHAT-MEDIA-01 (isolated PostgreSQL only).
CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; CREATE ROLE service_role NOLOGIN BYPASSRLS;
CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
  $$ SELECT nullif(current_setting('request.uid', true), '')::uuid $$;
GRANT USAGE ON SCHEMA auth, public TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION auth.uid() TO anon, authenticated, service_role;

CREATE TYPE public.trip_status AS ENUM ('active','archived','draft');
CREATE TABLE public.trips (id uuid PRIMARY KEY, status public.trip_status NOT NULL);
CREATE TABLE public.profiles (id uuid PRIMARY KEY, approved boolean NOT NULL, banned boolean NOT NULL DEFAULT false);
CREATE TABLE public.admins (user_id uuid PRIMARY KEY);
CREATE TABLE public.trip_members (trip_id uuid, user_id uuid, PRIMARY KEY (trip_id, user_id));

CREATE FUNCTION public.is_approved_member(_uid uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS
  $$ SELECT EXISTS (SELECT 1 FROM profiles WHERE id = _uid AND approved AND NOT banned) $$;
CREATE FUNCTION public.is_admin(_user_id uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS
  $$ SELECT EXISTS (SELECT 1 FROM admins WHERE user_id = _user_id) $$;
CREATE FUNCTION public.is_trip_member(_trip_id uuid, _user_id uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS
  $$ SELECT EXISTS (SELECT 1 FROM trip_members WHERE trip_id = _trip_id AND user_id = _user_id) $$;
CREATE FUNCTION public.is_approved_trip_member(_trip_id uuid, _user_id uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS
  $$ SELECT _trip_id IS NOT NULL AND is_approved_member(_user_id) AND is_trip_member(_trip_id, _user_id) $$;
CREATE FUNCTION public.is_trip_active(_trip_id uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS
  $$ SELECT EXISTS (SELECT 1 FROM trips WHERE id = _trip_id AND status = 'active') $$;
CREATE FUNCTION public.active_trip_id() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT id FROM public.trips WHERE status='active' LIMIT 1 $$;

CREATE TABLE public.stories (id uuid PRIMARY KEY, user_id uuid NOT NULL, storage_path text NOT NULL, type text NOT NULL,
  trip_id uuid NOT NULL, expires_at timestamptz NOT NULL DEFAULT now() + interval '24 hours');
CREATE TABLE public.messages (id uuid PRIMARY KEY, sender_id text NOT NULL, trip_id uuid NOT NULL, deleted_at timestamptz);
CREATE TABLE public.attachments (id uuid PRIMARY KEY, message_id uuid NOT NULL REFERENCES public.messages, type text NOT NULL,
  storage_path text NOT NULL, storage_bucket text NOT NULL DEFAULT 'chat-media', thumbnail_path text, width int, height int,
  file_size int, mime_type text);
CREATE TABLE public.gallery_items (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), uploaded_by uuid NOT NULL,
  storage_path text NOT NULL, type text NOT NULL, width int, height int, source_message_id uuid, source_story_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(), storage_bucket text NOT NULL DEFAULT 'chat-media', thumbnail_path text,
  caption text, mime_type text, size_bytes bigint, trip_id uuid NOT NULL DEFAULT public.active_trip_id());
GRANT SELECT, INSERT, UPDATE, DELETE ON public.gallery_items TO authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
ALTER TABLE public.gallery_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Approved members create gallery items" ON public.gallery_items FOR INSERT
  WITH CHECK (is_approved_member(auth.uid()) AND auth.uid() = uploaded_by);
CREATE POLICY "Approved members view gallery" ON public.gallery_items FOR SELECT USING (is_approved_member(auth.uid()));

-- Legacy auto-copy triggers as in production.
CREATE FUNCTION public.sync_story_to_gallery() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN INSERT INTO gallery_items (storage_path, type, uploaded_by, storage_bucket, source_story_id, trip_id)
VALUES (NEW.storage_path, NEW.type, NEW.user_id, 'stories', NEW.id, NEW.trip_id) ON CONFLICT DO NOTHING; RETURN NEW; END $$;
CREATE TRIGGER trg_sync_story_to_gallery AFTER INSERT ON public.stories FOR EACH ROW EXECUTE FUNCTION public.sync_story_to_gallery();
CREATE FUNCTION public.sync_attachment_to_gallery() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN IF NEW.type IN ('image','video','gif') THEN
INSERT INTO gallery_items (storage_path, type, uploaded_by, source_message_id, storage_bucket, trip_id)
SELECT NEW.storage_path, NEW.type, m.sender_id::uuid, NEW.message_id, 'chat-media', m.trip_id FROM messages m WHERE m.id = NEW.message_id
ON CONFLICT DO NOTHING; END IF; RETURN NEW; END $$;
CREATE TRIGGER trg_sync_attachment_to_gallery AFTER INSERT ON public.attachments FOR EACH ROW EXECUTE FUNCTION public.sync_attachment_to_gallery();

-- Users: a=owner, b=other member, c=non-member, d=banned member, x=admin.
INSERT INTO public.trips VALUES ('00000000-0000-0000-0000-0000000000a1','active'),('00000000-0000-0000-0000-0000000000a2','archived');
INSERT INTO public.profiles VALUES ('00000000-0000-0000-0000-00000000000a',true,false),('00000000-0000-0000-0000-00000000000b',true,false),
 ('00000000-0000-0000-0000-00000000000c',true,false),('00000000-0000-0000-0000-00000000000d',true,true),('00000000-0000-0000-0000-00000000000f',true,false);
INSERT INTO public.admins VALUES ('00000000-0000-0000-0000-00000000000f');
INSERT INTO public.trip_members VALUES
 ('00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-00000000000a'),('00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-00000000000b'),
 ('00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-00000000000d'),('00000000-0000-0000-0000-0000000000a2','00000000-0000-0000-0000-00000000000a');
-- Historical rows (auto-copied by legacy triggers, like the 14 in production).
INSERT INTO public.stories VALUES ('10000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-00000000000a','a/old.jpg','image','00000000-0000-0000-0000-0000000000a1');
INSERT INTO public.messages VALUES ('20000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-00000000000a','00000000-0000-0000-0000-0000000000a1',NULL);
INSERT INTO public.attachments (id,message_id,type,storage_path) VALUES ('30000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','image','a/old-att.jpg');
