-- Make round creation atomic, idempotent and server-authoritative.
-- Existing rows keep their previous NOK interpretation; new Val Thorens
-- rounds explicitly send ACTIVE_TRIP.currency (EUR).

alter table public.rounds
  add column if not exists client_id uuid,
  add column if not exists currency text not null default 'NOK',
  add column if not exists push_claimed_at timestamptz,
  add column if not exists push_sent_at timestamptz;

create unique index if not exists rounds_buyer_client_uidx
  on public.rounds (buyer_id, client_id)
  where client_id is not null;

alter table public.debt_settlements
  add column if not exists currency text not null default 'NOK',
  add column if not exists client_id uuid;

create unique index if not exists debt_settlements_creator_client_uidx
  on public.debt_settlements (created_by, client_id)
  where client_id is not null;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'rounds_total_cost_positive') then
    alter table public.rounds add constraint rounds_total_cost_positive check (total_cost > 0);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'rounds_currency_iso') then
    alter table public.rounds add constraint rounds_currency_iso check (currency ~ '^[A-Z]{3}$');
  end if;
  if not exists (select 1 from pg_constraint where conname = 'debt_settlements_positive') then
    alter table public.debt_settlements add constraint debt_settlements_positive check (amount > 0);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'debt_settlements_distinct_users') then
    alter table public.debt_settlements add constraint debt_settlements_distinct_users check (from_user_id <> to_user_id);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'debt_settlements_currency_iso') then
    alter table public.debt_settlements add constraint debt_settlements_currency_iso check (currency ~ '^[A-Z]{3}$');
  end if;
end $$;

create or replace function public.create_round_with_participants(
  p_client_id uuid,
  p_drink_type text,
  p_total_cost numeric,
  p_participant_ids uuid[],
  p_note text default null,
  p_drink_quantities jsonb default '{}'::jsonb,
  p_receipt_path text default null,
  p_is_treated boolean default false,
  p_currency text default 'EUR'
)
returns public.rounds
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_participants uuid[];
  v_round public.rounds;
  v_count integer;
  v_quantity_total numeric;
begin
  if v_uid is null then raise exception 'Not authenticated'; end if;
  if p_client_id is null then raise exception 'client_id is required'; end if;
  if p_total_cost is null or p_total_cost <= 0 or p_total_cost > 1000000 then
    raise exception 'Invalid total cost';
  end if;
  if p_drink_type not in ('beer', 'drink', 'food', 'grocery', 'mixed') then
    raise exception 'Invalid purchase type';
  end if;
  if p_currency is null or upper(p_currency) !~ '^[A-Z]{3}$' then
    raise exception 'Invalid currency';
  end if;
  if p_note is not null and length(p_note) > 500 then raise exception 'Note too long'; end if;
  if jsonb_typeof(coalesce(p_drink_quantities, '{}'::jsonb)) <> 'object' then
    raise exception 'Invalid quantities';
  end if;
  if exists (
    select 1 from jsonb_each(coalesce(p_drink_quantities, '{}'::jsonb)) q
    where jsonb_typeof(q.value) <> 'number' or (q.value #>> '{}')::numeric < 0
  ) then raise exception 'Invalid quantities'; end if;
  select coalesce(sum((q.value #>> '{}')::numeric), 0)
    into v_quantity_total
    from jsonb_each(coalesce(p_drink_quantities, '{}'::jsonb)) q;
  if v_quantity_total <= 0 or v_quantity_total > 1000 then raise exception 'Invalid quantity total'; end if;
  if p_receipt_path is not null and p_receipt_path not like v_uid::text || '/%' then
    raise exception 'Receipt path must be owned by caller';
  end if;

  select array_agg(distinct x) into v_participants
  from unnest(coalesce(p_participant_ids, array[]::uuid[])) x;
  v_count := coalesce(cardinality(v_participants), 0);
  if v_count < 1 or v_count > 50 then raise exception 'Invalid participants'; end if;
  if (select count(*) from public.profiles p where p.id = any(v_participants) and p.is_active) <> v_count then
    raise exception 'All participants must be active members';
  end if;
  if not exists (select 1 from public.profiles p where p.id = v_uid and p.is_active) then
    raise exception 'Caller is not an active member';
  end if;

  insert into public.rounds (
    buyer_id, drink_type, total_cost, cost_per_person, note,
    drink_quantities, receipt_image_url, receipt_uploaded_by,
    is_treated, client_id, currency
  ) values (
    v_uid::text, p_drink_type, p_total_cost,
    round(p_total_cost / v_count, 2), nullif(trim(p_note), ''),
    coalesce(p_drink_quantities, '{}'::jsonb), p_receipt_path,
    case when p_receipt_path is null then null else v_uid end,
    coalesce(p_is_treated, false), p_client_id, upper(p_currency)
  )
  on conflict (buyer_id, client_id) where client_id is not null do nothing
  returning * into v_round;

  if v_round.id is null then
    select * into v_round from public.rounds
      where buyer_id = v_uid::text and client_id = p_client_id;
    return v_round;
  end if;

  insert into public.round_participants (round_id, user_id)
  select v_round.id, x::text from unnest(v_participants) x;

  return v_round;
end;
$$;

revoke all on function public.create_round_with_participants(uuid,text,numeric,uuid[],text,jsonb,text,boolean,text) from public, anon;
grant execute on function public.create_round_with_participants(uuid,text,numeric,uuid[],text,jsonb,text,boolean,text) to authenticated;

drop policy if exists "Authenticated users can create rounds" on public.rounds;
drop policy if exists "Authenticated users can create round participants" on public.round_participants;

drop policy if exists "Users can create settlements" on public.debt_settlements;
create policy "Parties can create own settlements"
  on public.debt_settlements for insert to authenticated
  with check (
    auth.uid() = created_by
    and (auth.uid() = from_user_id or auth.uid() = to_user_id)
    and from_user_id <> to_user_id
    and amount > 0
  );

