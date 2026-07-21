-- Private, one-time email verification state and server-only notification
-- idempotency. No existing users, messages, tokens or media are removed.

begin;

create table if not exists public.email_verification_tokens (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null,
  last_sent_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

alter table public.email_verification_tokens enable row level security;
revoke all on public.email_verification_tokens from anon, authenticated;

create table if not exists public.notification_dispatches (
  dedupe_key text primary key,
  kind text not null,
  source_id uuid,
  event_type text not null,
  claimed_at timestamptz not null default now(),
  sent_at timestamptz,
  last_error text
);

alter table public.notification_dispatches enable row level security;
revoke all on public.notification_dispatches from anon, authenticated;
create index if not exists notification_dispatches_claimed_at_idx
  on public.notification_dispatches (claimed_at desc);

create or replace function public.consume_email_verification_token(p_token_hash text)
returns table(status text, verified_user_id uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  token_row public.email_verification_tokens%rowtype;
begin
  select * into token_row
  from public.email_verification_tokens
  where token_hash = p_token_hash
  for update;

  if not found then
    return query select 'invalid'::text, null::uuid;
    return;
  end if;

  if token_row.expires_at <= now() then
    delete from public.email_verification_tokens where user_id = token_row.user_id;
    return query select 'expired'::text, token_row.user_id;
    return;
  end if;

  update public.profiles
  set email_verified = true,
      email_verification_token = null,
      email_verification_expires_at = null,
      updated_at = now()
  where id = token_row.user_id;

  delete from public.email_verification_tokens where user_id = token_row.user_id;
  return query select 'verified'::text, token_row.user_id;
end;
$$;

revoke all on function public.consume_email_verification_token(text) from public, anon, authenticated;
grant execute on function public.consume_email_verification_token(text) to service_role;

-- Read receipts contain group activity and should never be anonymous-readable.
drop policy if exists "Authenticated users can view reads" on public.chat_reads;
create policy "Trip members can view reads"
on public.chat_reads for select
to authenticated
using (true);

-- The app has one provisioned group thread. Clients never create threads.
drop policy if exists "Authenticated can create threads" on public.threads;

-- Clear any legacy plaintext token state. There are no active legacy tokens at
-- migration time; keeping the columns null preserves older generated clients.
update public.profiles
set email_verification_token = null,
    email_verification_expires_at = null
where email_verification_token is not null
   or email_verification_expires_at is not null;

commit;
