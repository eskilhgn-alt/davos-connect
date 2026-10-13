-- Isolated test identities only. Mirrors relevant production schema read 14.10.2026.
CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; CREATE ROLE service_role NOLOGIN BYPASSRLS;
CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.uid',true),'')::uuid $$;
GRANT USAGE ON SCHEMA auth,public TO anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION auth.uid() TO anon,authenticated,service_role;
CREATE TYPE public.trip_status AS ENUM('active','archived','draft');
CREATE TYPE public.membership_status_type AS ENUM('pending','approved','banned');
CREATE TABLE public.trips(id uuid PRIMARY KEY,status public.trip_status NOT NULL,timezone text NOT NULL DEFAULT 'Europe/Paris');
CREATE TABLE public.profiles(id uuid PRIMARY KEY,is_active boolean DEFAULT true,is_banned boolean DEFAULT false,
 membership_status public.membership_status_type DEFAULT 'approved',nickname text,full_name text);
CREATE TABLE public.trip_members(trip_id uuid,user_id uuid,PRIMARY KEY(trip_id,user_id));
CREATE TABLE public.notification_dispatches(dedupe_key text PRIMARY KEY,kind text,source_id uuid,event_type text,claimed_at timestamptz DEFAULT now(),sent_at timestamptz,last_error text);
INSERT INTO public.notification_dispatches(dedupe_key,kind,event_type) VALUES('historic-chat','chat','new');
CREATE FUNCTION public.is_approved_member(_uid uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT EXISTS(SELECT 1 FROM public.profiles WHERE id=_uid AND is_active AND NOT is_banned AND membership_status='approved') $$;
CREATE FUNCTION public.is_approved_trip_member(_trip_id uuid,_user_id uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT public.is_approved_member(_user_id) AND EXISTS(SELECT 1 FROM public.trip_members WHERE trip_id=_trip_id AND user_id=_user_id) $$;
CREATE FUNCTION public.is_trip_active(_trip_id uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT EXISTS(SELECT 1 FROM public.trips WHERE id=_trip_id AND status='active') $$;
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
INSERT INTO public.trips VALUES('00000000-0000-0000-0000-0000000000a1','active','Europe/Paris'),('00000000-0000-0000-0000-0000000000a2','archived','Europe/Paris');
INSERT INTO public.profiles(id,nickname) SELECT ('00000000-0000-0000-0000-00000000000'||i)::uuid,'Person '||i FROM generate_series(1,6)i;
UPDATE public.profiles SET is_banned=true WHERE nickname='Person 4';
UPDATE public.profiles SET membership_status='pending' WHERE nickname='Person 5';
UPDATE public.profiles SET is_active=false WHERE nickname='Person 6';
INSERT INTO public.trip_members SELECT '00000000-0000-0000-0000-0000000000a1',id FROM public.profiles;
INSERT INTO public.trip_members VALUES('00000000-0000-0000-0000-0000000000a2','00000000-0000-0000-0000-000000000001');
