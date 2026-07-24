
-- =====================================================================
-- SECURITY JOB 1: Membership status + hardened profile/RLS/Storage
-- =====================================================================

-- 1. Membership status enum + columns ---------------------------------
DO $$ BEGIN
  CREATE TYPE public.membership_status_type AS ENUM ('pending','approved','banned');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS membership_status public.membership_status_type NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS approved_at timestamptz,
  ADD COLUMN IF NOT EXISTS approved_by uuid;

-- Backfill existing users. Active + not banned → approved.
UPDATE public.profiles
   SET membership_status = CASE
         WHEN is_banned THEN 'banned'::public.membership_status_type
         WHEN is_active THEN 'approved'::public.membership_status_type
         ELSE 'pending'::public.membership_status_type
       END,
       approved_at = COALESCE(approved_at,
         CASE WHEN is_active AND NOT is_banned THEN created_at END)
 WHERE membership_status = 'pending';

-- 2. Approval check function ------------------------------------------
CREATE OR REPLACE FUNCTION public.is_approved_member(_uid uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = _uid
      AND membership_status = 'approved'
      AND is_active = true
      AND NOT is_banned
  )
$$;
REVOKE ALL ON FUNCTION public.is_approved_member(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_approved_member(uuid) TO authenticated, service_role;

-- 3. Prevent self-escalation on profiles ------------------------------
CREATE OR REPLACE FUNCTION public.enforce_profile_self_update()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  -- Admins and service_role bypass this trigger via other means.
  IF auth.uid() IS NOT NULL AND public.is_admin(auth.uid()) THEN
    RETURN NEW;
  END IF;
  -- Force-revert admin/sensitive columns to their previous values
  NEW.id                             := OLD.id;
  NEW.email                          := OLD.email;
  NEW.email_verified                 := OLD.email_verified;
  NEW.email_verification_token       := OLD.email_verification_token;
  NEW.email_verification_expires_at  := OLD.email_verification_expires_at;
  NEW.is_active                      := OLD.is_active;
  NEW.is_banned                      := OLD.is_banned;
  NEW.banned_at                      := OLD.banned_at;
  NEW.ban_reason                     := OLD.ban_reason;
  NEW.membership_status              := OLD.membership_status;
  NEW.approved_at                    := OLD.approved_at;
  NEW.approved_by                    := OLD.approved_by;
  NEW.created_at                     := OLD.created_at;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_enforce_profile_self_update ON public.profiles;
CREATE TRIGGER trg_enforce_profile_self_update
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.enforce_profile_self_update();

-- 4. Column-level GRANT on profiles: hide verification token ----------
REVOKE SELECT ON public.profiles FROM authenticated, anon;
GRANT SELECT (
  id, email, full_name, nickname, avatar_url, is_active, is_banned,
  banned_at, ban_reason, email_verified, email_verification_expires_at,
  membership_status, approved_at, approved_by, created_at, updated_at
) ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;

-- 5. Safe members view ------------------------------------------------
DROP VIEW IF EXISTS public.members_safe;
CREATE VIEW public.members_safe
WITH (security_invoker = on) AS
  SELECT id, full_name, nickname, avatar_url, membership_status
  FROM public.profiles
  WHERE membership_status = 'approved' AND is_active = true AND NOT is_banned;
GRANT SELECT ON public.members_safe TO authenticated;

-- 6. Handle new user: default to pending ------------------------------
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, email_verified, membership_status)
  VALUES (NEW.id, NEW.email, false, 'pending');
  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'user')
  ON CONFLICT (user_id, role) DO NOTHING;
  RETURN NEW;
END $$;

-- 7. Admin approval RPC + updated ban RPC -----------------------------
CREATE OR REPLACE FUNCTION public.rpc_admin_approve_member(p_user_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL OR NOT public.is_admin(v_uid) THEN
    RAISE EXCEPTION 'Not admin';
  END IF;
  UPDATE public.profiles
     SET membership_status = 'approved',
         is_active = true,
         is_banned = false,
         banned_at = NULL,
         ban_reason = NULL,
         approved_at = COALESCE(approved_at, now()),
         approved_by = v_uid,
         updated_at = now()
   WHERE id = p_user_id;
  INSERT INTO public.admin_audit_log (admin_id, action, target_user_id, details)
  VALUES (v_uid, 'approve_member', p_user_id, jsonb_build_object('approved_at', now()));
  RETURN jsonb_build_object('approved', true, 'user_id', p_user_id);
END $$;
REVOKE ALL ON FUNCTION public.rpc_admin_approve_member(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_admin_approve_member(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.rpc_admin_set_ban(p_user_id uuid, p_banned boolean, p_reason text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_uid uuid := auth.uid();
BEGIN
  IF NOT public.is_admin(v_uid) THEN RAISE EXCEPTION 'Not admin'; END IF;
  UPDATE public.profiles
     SET is_banned = p_banned,
         banned_at = CASE WHEN p_banned THEN now() ELSE NULL END,
         ban_reason = CASE WHEN p_banned THEN p_reason ELSE NULL END,
         membership_status = CASE
           WHEN p_banned THEN 'banned'::public.membership_status_type
           ELSE 'approved'::public.membership_status_type
         END,
         approved_at = CASE
           WHEN NOT p_banned THEN COALESCE(approved_at, now())
           ELSE approved_at
         END,
         updated_at = now()
   WHERE id = p_user_id;
  INSERT INTO public.admin_audit_log (admin_id, action, target_user_id, details)
  VALUES (v_uid, CASE WHEN p_banned THEN 'ban_member' ELSE 'unban_member' END,
          p_user_id, jsonb_build_object('reason', p_reason));
  RETURN jsonb_build_object('banned', p_banned, 'user_id', p_user_id);
END $$;

-- 8. Recreate policies to require approved membership ----------------

-- profiles: keep own+admin-only pattern; SELECT still row-permissive
--   (column GRANT hides token). Own UPDATE gated by trigger.
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
CREATE POLICY "Users can update own profile" ON public.profiles
  FOR UPDATE TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- Helper macro-like block: replace SELECT policies on core tables to gate on membership.

-- messages
DROP POLICY IF EXISTS "Authenticated can read messages" ON public.messages;
CREATE POLICY "Approved members can read messages" ON public.messages
  FOR SELECT TO authenticated USING (public.is_approved_member(auth.uid()));
DROP POLICY IF EXISTS "Sender must be self on insert" ON public.messages;
CREATE POLICY "Approved members can send messages" ON public.messages
  FOR INSERT TO authenticated
  WITH CHECK (public.is_approved_member(auth.uid()) AND sender_id = (auth.uid())::text);

-- message_reactions
DROP POLICY IF EXISTS "Auth can view reactions" ON public.message_reactions;
CREATE POLICY "Approved members can view reactions" ON public.message_reactions
  FOR SELECT TO authenticated USING (public.is_approved_member(auth.uid()));
DROP POLICY IF EXISTS "Users insert own reactions" ON public.message_reactions;
CREATE POLICY "Approved members insert own reactions" ON public.message_reactions
  FOR INSERT TO authenticated
  WITH CHECK (public.is_approved_member(auth.uid()) AND auth.uid() = user_id);

-- attachments
DROP POLICY IF EXISTS "Trip members can view attachments" ON public.attachments;
CREATE POLICY "Approved members can view attachments" ON public.attachments
  FOR SELECT TO authenticated USING (public.is_approved_member(auth.uid()));

-- chat_reads
DROP POLICY IF EXISTS "Trip members can view reads" ON public.chat_reads;
CREATE POLICY "Approved members can view reads" ON public.chat_reads
  FOR SELECT TO authenticated USING (public.is_approved_member(auth.uid()));
DROP POLICY IF EXISTS "Users can mark messages as read" ON public.chat_reads;
CREATE POLICY "Approved members mark as read" ON public.chat_reads
  FOR INSERT TO authenticated
  WITH CHECK (public.is_approved_member(auth.uid()) AND auth.uid() = user_id);

-- stories
DROP POLICY IF EXISTS "Authenticated can view stories" ON public.stories;
CREATE POLICY "Approved members view stories" ON public.stories
  FOR SELECT TO authenticated USING (public.is_approved_member(auth.uid()));
DROP POLICY IF EXISTS "Users can insert own stories" ON public.stories;
CREATE POLICY "Approved members insert own stories" ON public.stories
  FOR INSERT TO authenticated
  WITH CHECK (public.is_approved_member(auth.uid()) AND auth.uid() = user_id);

-- story_likes / story_views
DROP POLICY IF EXISTS "Authenticated can view likes" ON public.story_likes;
CREATE POLICY "Approved members view story likes" ON public.story_likes
  FOR SELECT TO authenticated USING (public.is_approved_member(auth.uid()));
DROP POLICY IF EXISTS "Users insert own likes" ON public.story_likes;
CREATE POLICY "Approved members insert story likes" ON public.story_likes
  FOR INSERT TO authenticated
  WITH CHECK (public.is_approved_member(auth.uid()) AND auth.uid() = user_id);
DROP POLICY IF EXISTS "Authenticated can view views" ON public.story_views;
CREATE POLICY "Approved members view story views" ON public.story_views
  FOR SELECT TO authenticated USING (public.is_approved_member(auth.uid()));
DROP POLICY IF EXISTS "Users insert own views" ON public.story_views;
CREATE POLICY "Approved members insert story views" ON public.story_views
  FOR INSERT TO authenticated
  WITH CHECK (public.is_approved_member(auth.uid()) AND auth.uid() = user_id);

-- gallery_items / gallery_comments / gallery_likes
DROP POLICY IF EXISTS "Authenticated can view gallery" ON public.gallery_items;
CREATE POLICY "Approved members view gallery" ON public.gallery_items
  FOR SELECT TO authenticated USING (public.is_approved_member(auth.uid()));
DROP POLICY IF EXISTS "Users can create own gallery items" ON public.gallery_items;
CREATE POLICY "Approved members create gallery items" ON public.gallery_items
  FOR INSERT TO authenticated
  WITH CHECK (public.is_approved_member(auth.uid()) AND auth.uid() = uploaded_by);

DROP POLICY IF EXISTS "auth read comments" ON public.gallery_comments;
CREATE POLICY "Approved members read gallery comments" ON public.gallery_comments
  FOR SELECT TO authenticated USING (public.is_approved_member(auth.uid()));
DROP POLICY IF EXISTS "own insert comments" ON public.gallery_comments;
CREATE POLICY "Approved members insert gallery comments" ON public.gallery_comments
  FOR INSERT TO authenticated
  WITH CHECK (public.is_approved_member(auth.uid()) AND auth.uid() = user_id);

DROP POLICY IF EXISTS "auth read likes" ON public.gallery_likes;
CREATE POLICY "Approved members read gallery likes" ON public.gallery_likes
  FOR SELECT TO authenticated USING (public.is_approved_member(auth.uid()));
DROP POLICY IF EXISTS "own insert likes" ON public.gallery_likes;
CREATE POLICY "Approved members insert gallery likes" ON public.gallery_likes
  FOR INSERT TO authenticated
  WITH CHECK (public.is_approved_member(auth.uid()) AND auth.uid() = user_id);

-- agenda_events
DROP POLICY IF EXISTS "Authenticated can view agenda" ON public.agenda_events;
CREATE POLICY "Approved members view agenda" ON public.agenda_events
  FOR SELECT TO authenticated USING (public.is_approved_member(auth.uid()));
DROP POLICY IF EXISTS "Authenticated can create agenda" ON public.agenda_events;
CREATE POLICY "Approved members create agenda" ON public.agenda_events
  FOR INSERT TO authenticated
  WITH CHECK (public.is_approved_member(auth.uid()) AND auth.uid() = created_by);

-- polls
DROP POLICY IF EXISTS "Authenticated can view polls" ON public.polls;
CREATE POLICY "Approved members view polls" ON public.polls
  FOR SELECT TO authenticated USING (public.is_approved_member(auth.uid()));
DROP POLICY IF EXISTS "Authenticated can create polls" ON public.polls;
CREATE POLICY "Approved members create polls" ON public.polls
  FOR INSERT TO authenticated
  WITH CHECK (public.is_approved_member(auth.uid()) AND auth.uid() = created_by);

-- poll_options / poll_votes
DROP POLICY IF EXISTS "Authenticated can view options" ON public.poll_options;
CREATE POLICY "Approved members view poll options" ON public.poll_options
  FOR SELECT TO authenticated USING (public.is_approved_member(auth.uid()));
DROP POLICY IF EXISTS "Authenticated can view votes" ON public.poll_votes;
CREATE POLICY "Approved members view poll votes" ON public.poll_votes
  FOR SELECT TO authenticated USING (public.is_approved_member(auth.uid()));
DROP POLICY IF EXISTS "Users can cast vote" ON public.poll_votes;
CREATE POLICY "Approved members cast vote" ON public.poll_votes
  FOR INSERT TO authenticated
  WITH CHECK (public.is_approved_member(auth.uid()) AND auth.uid() = user_id);

-- rounds / round_participants / debt_settlements
DROP POLICY IF EXISTS "Authenticated users can view rounds" ON public.rounds;
CREATE POLICY "Approved members view rounds" ON public.rounds
  FOR SELECT TO authenticated USING (public.is_approved_member(auth.uid()));
DROP POLICY IF EXISTS "Authenticated users can view round participants" ON public.round_participants;
CREATE POLICY "Approved members view round participants" ON public.round_participants
  FOR SELECT TO authenticated USING (public.is_approved_member(auth.uid()));
DROP POLICY IF EXISTS "Authenticated can read all settlements" ON public.debt_settlements;
CREATE POLICY "Approved members read settlements" ON public.debt_settlements
  FOR SELECT TO authenticated USING (public.is_approved_member(auth.uid()));
DROP POLICY IF EXISTS "Parties can create own settlements" ON public.debt_settlements;
CREATE POLICY "Approved members create settlements" ON public.debt_settlements
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_approved_member(auth.uid())
    AND auth.uid() = created_by
    AND (auth.uid() = from_user_id OR auth.uid() = to_user_id)
    AND from_user_id <> to_user_id
    AND amount > 0
  );

-- members
DROP POLICY IF EXISTS "Authenticated can read members" ON public.members;
CREATE POLICY "Approved members can read members" ON public.members
  FOR SELECT TO authenticated USING (public.is_approved_member(auth.uid()));

-- user_locations
DROP POLICY IF EXISTS "Authenticated can read all locations" ON public.user_locations;
CREATE POLICY "Approved members read locations" ON public.user_locations
  FOR SELECT TO authenticated USING (public.is_approved_member(auth.uid()));
DROP POLICY IF EXISTS "Users can insert own location" ON public.user_locations;
CREATE POLICY "Approved members insert own location" ON public.user_locations
  FOR INSERT TO authenticated
  WITH CHECK (public.is_approved_member(auth.uid()) AND auth.uid() = user_id);

-- profiles: keep readable for authenticated (needed by app), but limited by column GRANT.
-- Still gate SELECT to approved members (pending users cannot enumerate roster).
DROP POLICY IF EXISTS "Authenticated can view all profiles" ON public.profiles;
CREATE POLICY "Approved members view profiles" ON public.profiles
  FOR SELECT TO authenticated
  USING (
    id = auth.uid()
    OR public.is_admin(auth.uid())
    OR public.is_approved_member(auth.uid())
  );

-- 9. Storage: gate private buckets to approved members ---------------
DROP POLICY IF EXISTS "Trip members can read private media" ON storage.objects;
CREATE POLICY "Approved members can read private media" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = ANY (ARRAY['chat-media','stories','round-receipts'])
    AND public.is_approved_member(auth.uid())
  );

DROP POLICY IF EXISTS "Trip members can upload own private media" ON storage.objects;
CREATE POLICY "Approved members upload own private media" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = ANY (ARRAY['chat-media','stories','round-receipts'])
    AND public.is_approved_member(auth.uid())
    AND (storage.foldername(name))[1] = (auth.uid())::text
  );

-- =====================================================================
-- Verification (executed at migration time)
-- =====================================================================
DO $verify$
DECLARE
  v_approved int;
  v_pending int;
BEGIN
  SELECT count(*) INTO v_approved FROM public.profiles WHERE membership_status='approved';
  SELECT count(*) INTO v_pending  FROM public.profiles WHERE membership_status='pending';
  RAISE NOTICE 'Backfill: % approved, % pending', v_approved, v_pending;
END $verify$;
