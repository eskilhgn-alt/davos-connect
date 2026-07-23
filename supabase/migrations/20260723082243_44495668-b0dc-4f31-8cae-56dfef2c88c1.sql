-- Retire the Roomies/checklist verticals and move Faktasjekker writes behind
-- the authenticated Edge Function. Historical migrations remain untouched.

drop table if exists public.roomie_rooms cascade;
drop table if exists public.roomie_draws cascade;
drop table if exists public.checklist_items cascade;

alter table public.faktasjekker_threads
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists status text not null default 'draft',
  add column if not exists visibility text not null default 'private',
  add column if not exists model text,
  add column if not exists completed_at timestamptz,
  add column if not exists last_error text;

alter table public.faktasjekker_messages
  add column if not exists request_id uuid,
  add column if not exists status text not null default 'completed',
  add column if not exists verdict text,
  add column if not exists confidence smallint,
  add column if not exists sources jsonb not null default '[]'::jsonb,
  add column if not exists model text,
  add column if not exists response_id text,
  add column if not exists error_code text,
  add column if not exists completed_at timestamptz;

update public.faktasjekker_threads
set
  status = 'completed',
  visibility = 'group',
  completed_at = coalesce(completed_at, created_at),
  updated_at = coalesce(updated_at, created_at)
where status = 'draft';

update public.faktasjekker_messages
set
  status = 'completed',
  completed_at = coalesce(completed_at, created_at)
where role = 'assistant' and status = 'completed';

alter table public.faktasjekker_threads
  drop constraint if exists faktasjekker_threads_status_check,
  drop constraint if exists faktasjekker_threads_visibility_check;

alter table public.faktasjekker_threads
  add constraint faktasjekker_threads_status_check
    check (status in ('draft', 'processing', 'completed', 'failed')),
  add constraint faktasjekker_threads_visibility_check
    check (visibility in ('private', 'group'));

alter table public.faktasjekker_messages
  drop constraint if exists faktasjekker_messages_status_check,
  drop constraint if exists faktasjekker_messages_verdict_check,
  drop constraint if exists faktasjekker_messages_confidence_check;

alter table public.faktasjekker_messages
  add constraint faktasjekker_messages_status_check
    check (status in ('processing', 'completed', 'failed')),
  add constraint faktasjekker_messages_verdict_check
    check (
      verdict is null
      or verdict in (
        'sant',
        'hovedsakelig_sant',
        'misvisende',
        'hovedsakelig_feil',
        'feil',
        'ikke_verifiserbart'
      )
    ),
  add constraint faktasjekker_messages_confidence_check
    check (confidence is null or confidence between 0 and 100);

create unique index if not exists idx_faktasjekker_request_id
  on public.faktasjekker_messages (request_id)
  where request_id is not null;

create index if not exists idx_faktasjekker_threads_owner_updated
  on public.faktasjekker_threads (user_id, updated_at desc);

drop policy if exists "Authenticated can read all threads" on public.faktasjekker_threads;
drop policy if exists "Users can create own threads" on public.faktasjekker_threads;
drop policy if exists "Users can delete own threads" on public.faktasjekker_threads;
drop policy if exists "Authenticated can read all messages" on public.faktasjekker_messages;
drop policy if exists "Users can insert messages into own threads" on public.faktasjekker_messages;
drop policy if exists "Users can update messages in own threads" on public.faktasjekker_messages;

create policy "Owners and group can read fact check threads"
  on public.faktasjekker_threads
  for select
  to authenticated
  using (
    (select auth.uid()) = user_id
    or (visibility = 'group' and status = 'completed')
  );

create policy "Owners can delete fact check threads"
  on public.faktasjekker_threads
  for delete
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "Owners and group can read fact check messages"
  on public.faktasjekker_messages
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.faktasjekker_threads thread
      where thread.id = faktasjekker_messages.thread_id
        and (
          thread.user_id = (select auth.uid())
          or (thread.visibility = 'group' and thread.status = 'completed')
        )
    )
  );

create table if not exists public.faktasjekker_rate_limits (
  user_id uuid not null,
  window_type text not null check (window_type in ('minute', 'day')),
  window_start timestamptz not null,
  request_count integer not null default 0 check (request_count >= 0),
  updated_at timestamptz not null default now(),
  primary key (user_id, window_type, window_start)
);

alter table public.faktasjekker_rate_limits enable row level security;
revoke all on public.faktasjekker_rate_limits from anon, authenticated;

create or replace function public.consume_faktasjekker_quota(p_user_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  minute_start timestamptz := date_trunc('minute', now());
  day_start timestamptz := date_trunc('day', now());
  minute_count integer;
  day_count integer;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text, 0));

  select coalesce(request_count, 0)
    into minute_count
    from public.faktasjekker_rate_limits
   where user_id = p_user_id
     and window_type = 'minute'
     and window_start = minute_start;

  select coalesce(request_count, 0)
    into day_count
    from public.faktasjekker_rate_limits
   where user_id = p_user_id
     and window_type = 'day'
     and window_start = day_start;

  if coalesce(minute_count, 0) >= 4 or coalesce(day_count, 0) >= 25 then
    return false;
  end if;

  insert into public.faktasjekker_rate_limits
    (user_id, window_type, window_start, request_count)
  values
    (p_user_id, 'minute', minute_start, 1),
    (p_user_id, 'day', day_start, 1)
  on conflict (user_id, window_type, window_start)
  do update set
    request_count = faktasjekker_rate_limits.request_count + 1,
    updated_at = now();

  delete from public.faktasjekker_rate_limits
  where updated_at < now() - interval '8 days';

  return true;
end;
$$;

revoke all on function public.consume_faktasjekker_quota(uuid) from public, anon, authenticated;
grant execute on function public.consume_faktasjekker_quota(uuid) to service_role;

create or replace function public.start_faktasjekk(
  p_user_id uuid,
  p_thread_id uuid,
  p_claim text,
  p_request_id uuid
)
returns table (
  thread_id uuid,
  user_message_id uuid,
  assistant_message_id uuid,
  created_at timestamptz,
  existing boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  selected_thread public.faktasjekker_threads%rowtype;
  user_message public.faktasjekker_messages%rowtype;
  assistant_message public.faktasjekker_messages%rowtype;
begin
  if p_user_id is null or p_request_id is null then
    raise exception 'invalid_request';
  end if;

  if length(trim(p_claim)) < 3 or length(p_claim) > 4000 then
    raise exception 'invalid_claim';
  end if;

  select message.*
    into assistant_message
    from public.faktasjekker_messages message
   where message.request_id = p_request_id;

  if found then
    select thread.*
      into selected_thread
      from public.faktasjekker_threads thread
     where thread.id = assistant_message.thread_id
       and thread.user_id = p_user_id;

    if not found then
      raise exception 'thread_not_found';
    end if;

    return query
    select
      selected_thread.id,
      null::uuid,
      assistant_message.id,
      assistant_message.created_at,
      true;
    return;
  end if;

  if p_thread_id is null then
    insert into public.faktasjekker_threads
      (user_id, title, status, visibility)
    values
      (p_user_id, left(trim(p_claim), 80), 'draft', 'private')
    returning * into selected_thread;
  else
    select thread.*
      into selected_thread
      from public.faktasjekker_threads thread
     where thread.id = p_thread_id
       and thread.user_id = p_user_id;

    if not found then
      raise exception 'thread_not_found';
    end if;
  end if;

  insert into public.faktasjekker_messages
    (thread_id, role, content, status, completed_at)
  values
    (selected_thread.id, 'user', trim(p_claim), 'completed', now())
  returning * into user_message;

  insert into public.faktasjekker_messages
    (thread_id, role, content, request_id, status, model)
  values
    (selected_thread.id, 'assistant', '', p_request_id, 'processing', 'gpt-5.6-sol')
  returning * into assistant_message;

  update public.faktasjekker_threads
     set status = 'processing',
         model = 'gpt-5.6-sol',
         last_error = null,
         updated_at = now()
   where id = selected_thread.id;

  return query
  select
    selected_thread.id,
    user_message.id,
    assistant_message.id,
    assistant_message.created_at,
    false;
end;
$$;

revoke all on function public.start_faktasjekk(uuid, uuid, text, uuid) from public, anon, authenticated;
grant execute on function public.start_faktasjekk(uuid, uuid, text, uuid) to service_role;