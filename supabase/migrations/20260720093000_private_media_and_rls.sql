-- Keep trip media private and close the broadest client-write RLS gaps.
-- Existing rows and storage objects are preserved.

begin;

-- Avatars are intentionally public profile media. Everything shared inside
-- the trip app requires an authenticated session and a short-lived signed URL.
update storage.buckets
set public = true,
    file_size_limit = 10485760,
    allowed_mime_types = array[
      'image/jpeg', 'image/png', 'image/webp', 'image/gif',
      'image/heic', 'image/heif'
    ]::text[]
where id = 'avatars';

update storage.buckets
set public = false,
    file_size_limit = 20971520,
    allowed_mime_types = array[
      'image/jpeg', 'image/png', 'image/webp', 'image/gif',
      'image/heic', 'image/heif',
      'video/mp4', 'video/webm', 'video/quicktime',
      'application/pdf', 'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/zip', 'application/x-zip-compressed',
      'text/plain', 'text/csv', 'application/octet-stream'
    ]::text[]
where id = 'chat-media';

update storage.buckets
set public = false,
    file_size_limit = 104857600,
    allowed_mime_types = array[
      'image/jpeg', 'image/png', 'image/webp', 'image/gif',
      'image/heic', 'image/heif',
      'video/mp4', 'video/webm', 'video/quicktime'
    ]::text[]
where id = 'stories';

update storage.buckets
set public = false,
    file_size_limit = 10485760,
    allowed_mime_types = array[
      'image/jpeg', 'image/png', 'image/webp',
      'image/heic', 'image/heif'
    ]::text[]
where id = 'round-receipts';

drop policy if exists "Anyone can view stories media" on storage.objects;
drop policy if exists "Authenticated can upload chat media" on storage.objects;
drop policy if exists "Authenticated can upload stories" on storage.objects;
drop policy if exists "Authenticated users can upload receipts" on storage.objects;
drop policy if exists "Authenticated users can upload to chat-media" on storage.objects;
drop policy if exists "Authenticated users can view chat-media" on storage.objects;
drop policy if exists "Public can read chat media" on storage.objects;
drop policy if exists "Receipts are publicly readable" on storage.objects;
drop policy if exists "Users can delete own stories media" on storage.objects;
drop policy if exists "Users can delete own uploads" on storage.objects;

create policy "Trip members can read private media"
on storage.objects for select
to authenticated
using (bucket_id in ('chat-media', 'stories', 'round-receipts'));

create policy "Trip members can upload own private media"
on storage.objects for insert
to authenticated
with check (
  bucket_id in ('chat-media', 'stories', 'round-receipts')
  and (storage.foldername(name))[1] = auth.uid()::text
);

create policy "Owners can update private media"
on storage.objects for update
to authenticated
using (
  bucket_id in ('chat-media', 'stories', 'round-receipts')
  and (
    (storage.foldername(name))[1] = auth.uid()::text
    or public.is_admin(auth.uid())
  )
)
with check (
  bucket_id in ('chat-media', 'stories', 'round-receipts')
  and (
    (storage.foldername(name))[1] = auth.uid()::text
    or public.is_admin(auth.uid())
  )
);

create policy "Owners can delete private media"
on storage.objects for delete
to authenticated
using (
  bucket_id in ('chat-media', 'stories', 'round-receipts')
  and (
    (storage.foldername(name))[1] = auth.uid()::text
    or public.is_admin(auth.uid())
  )
);

-- A normalized attachment may only be mirrored by the sender of its message.
drop policy if exists "Authenticated can create attachments" on public.attachments;
drop policy if exists "Authenticated can view attachments" on public.attachments;

create policy "Trip members can view attachments"
on public.attachments for select
to authenticated
using (true);

create policy "Message senders can create attachments"
on public.attachments for insert
to authenticated
with check (
  exists (
    select 1
    from public.messages m
    where m.id = attachments.message_id
      and (m.sender_id = auth.uid()::text or public.is_admin(auth.uid()))
  )
);

-- Legacy push membership rows must never be written on another user's behalf.
drop policy if exists "Authenticated can create members" on public.members;
drop policy if exists "Authenticated can update members" on public.members;

create policy "Users can create own membership"
on public.members for insert
to authenticated
with check (user_id = auth.uid()::text);

create policy "Users can update own membership"
on public.members for update
to authenticated
using (user_id = auth.uid()::text)
with check (user_id = auth.uid()::text);

-- WITH CHECK prevents ownership columns being moved to another user.
drop policy if exists "Users can change vote" on public.poll_votes;
create policy "Users can change vote"
on public.poll_votes for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "Creator can update own polls" on public.polls;
create policy "Creator can update own polls"
on public.polls for update
to authenticated
using (auth.uid() = created_by)
with check (auth.uid() = created_by);

drop policy if exists "Admins can update any poll" on public.polls;
create policy "Admins can update any poll"
on public.polls for update
to authenticated
using (public.is_admin(auth.uid()))
with check (public.is_admin(auth.uid()));

drop policy if exists "Users can update own profile" on public.profiles;
create policy "Users can update own profile"
on public.profiles for update
to authenticated
using (auth.uid() = id)
with check (auth.uid() = id);

drop policy if exists "Admins can update any profile" on public.profiles;
create policy "Admins can update any profile"
on public.profiles for update
to authenticated
using (public.is_admin(auth.uid()))
with check (public.is_admin(auth.uid()));

drop policy if exists "Users can update own tokens" on public.push_tokens;
create policy "Users can update own tokens"
on public.push_tokens for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "Users can update own room" on public.roomie_rooms;
create policy "Users can update own room"
on public.roomie_rooms for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "Users can update own location" on public.user_locations;
create policy "Users can update own location"
on public.user_locations for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "Users can update own speed records" on public.ski_speed_records;
create policy "Users can update own speed records"
on public.ski_speed_records for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "Users can view all speed records" on public.ski_speed_records;
create policy "Trip members can view speed records"
on public.ski_speed_records for select
to authenticated
using (true);

-- Agenda remains collaborative to read, while edits are owned or moderated.
drop policy if exists "Authenticated can update agenda" on public.agenda_events;
create policy "Creators can update agenda"
on public.agenda_events for update
to authenticated
using (auth.uid() = created_by or public.is_admin(auth.uid()))
with check (auth.uid() = created_by or public.is_admin(auth.uid()));

drop policy if exists "Authenticated can delete agenda" on public.agenda_events;
create policy "Creators can delete agenda"
on public.agenda_events for delete
to authenticated
using (auth.uid() = created_by or public.is_admin(auth.uid()));

commit;
