-- 1. Settlements: attach to a trip by default and backfill existing rows.
ALTER TABLE public.debt_settlements ALTER COLUMN trip_id SET DEFAULT public.active_trip_id();
UPDATE public.debt_settlements SET trip_id = public.active_trip_id() WHERE trip_id IS NULL;

-- 2. Poll creation with explicit trip scope.
DROP FUNCTION IF EXISTS public.create_poll_with_options(text, text[], boolean, boolean, boolean, timestamptz, integer);

CREATE OR REPLACE FUNCTION public.create_poll_with_options(
  p_question text,
  p_options text[],
  p_require_all boolean DEFAULT false,
  p_send_push_on_create boolean DEFAULT true,
  p_send_push_on_resolved boolean DEFAULT true,
  p_deadline_at timestamptz DEFAULT NULL,
  p_min_votes integer DEFAULT NULL,
  p_trip_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
declare
  v_uid uuid := auth.uid();
  v_poll_id uuid;
  v_trip uuid := coalesce(p_trip_id, public.active_trip_id());
  v_status text;
  v_option_count integer := coalesce(array_length(p_options, 1), 0);
  v_active_users integer;
begin
  if v_uid is null then
    raise exception 'Du må være logget inn' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.profiles
    where id = v_uid and is_active and not coalesce(is_banned, false)
  ) then
    raise exception 'Kontoen har ikke tilgang' using errcode = '42501';
  end if;
  if v_trip is null then
    raise exception 'Ingen tur valgt';
  end if;
  if not public.is_approved_trip_member(v_trip, v_uid) then
    raise exception 'Du er ikke medlem av denne turen' using errcode = '42501';
  end if;
  select status into v_status from public.trips where id = v_trip;
  if v_status is distinct from 'active' then
    raise exception 'Turen er arkivert – kan ikke opprette avstemming' using errcode = '42501';
  end if;
  p_question := btrim(coalesce(p_question, ''));
  if char_length(p_question) < 3 or char_length(p_question) > 240 then
    raise exception 'Spørsmålet må være mellom 3 og 240 tegn';
  end if;
  if v_option_count < 2 or v_option_count > 10 then
    raise exception 'En avstemming må ha mellom 2 og 10 alternativer';
  end if;
  if exists (
    select 1 from unnest(p_options) option_label
    where char_length(btrim(coalesce(option_label, ''))) < 1
       or char_length(btrim(option_label)) > 100
  ) then
    raise exception 'Alternativene må være mellom 1 og 100 tegn';
  end if;
  if (select count(distinct lower(btrim(option_label))) from unnest(p_options) option_label) <> v_option_count then
    raise exception 'Alternativene må være unike';
  end if;
  if (select count(*) from public.polls
       where created_by = v_uid and trip_id = v_trip
         and created_at > now() - interval '10 minutes') >= 2 then
    raise exception 'Du kan maks opprette 2 avstemminger per 10 minutter';
  end if;
  if p_deadline_at is not null and p_deadline_at <= now() then
    raise exception 'Tidsfristen må være i fremtiden';
  end if;
  select count(*) into v_active_users
  from public.profiles
  where is_active and not coalesce(is_banned, false);
  if p_min_votes is not null and (p_min_votes < 1 or p_min_votes > v_active_users) then
    raise exception 'Ugyldig minstekrav til antall stemmer';
  end if;
  insert into public.polls (
    created_by, question, require_all, send_push_on_create,
    send_push_on_resolved, deadline_at, min_votes, trip_id
  ) values (
    v_uid, p_question, p_require_all, p_send_push_on_create,
    p_send_push_on_resolved, p_deadline_at, p_min_votes, v_trip
  ) returning id into v_poll_id;
  insert into public.poll_options (poll_id, label, sort_order)
  select v_poll_id, btrim(option_label), option_order::integer - 1
  from unnest(p_options) with ordinality as options(option_label, option_order);
  return v_poll_id;
end;
$$;

GRANT EXECUTE ON FUNCTION public.create_poll_with_options(text, text[], boolean, boolean, boolean, timestamptz, integer, uuid) TO authenticated;

-- 3. Round creation with explicit trip scope.
DROP FUNCTION IF EXISTS public.create_round_with_participants(uuid, text, numeric, uuid[], text, jsonb, text, boolean, text);

CREATE OR REPLACE FUNCTION public.create_round_with_participants(
  p_client_id uuid,
  p_drink_type text,
  p_total_cost numeric,
  p_participant_ids uuid[],
  p_note text DEFAULT NULL,
  p_drink_quantities jsonb DEFAULT '{}'::jsonb,
  p_receipt_path text DEFAULT NULL,
  p_is_treated boolean DEFAULT false,
  p_currency text DEFAULT 'EUR',
  p_trip_id uuid DEFAULT NULL
)
RETURNS public.rounds
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
declare
  v_uid uuid := auth.uid();
  v_participants uuid[];
  v_round public.rounds;
  v_count integer;
  v_quantity_total numeric;
  v_trip uuid := coalesce(p_trip_id, public.active_trip_id());
  v_status text;
begin
  if v_uid is null then raise exception 'Not authenticated'; end if;
  if p_client_id is null then raise exception 'client_id is required'; end if;
  if v_trip is null then raise exception 'Ingen tur valgt'; end if;
  if not public.is_approved_trip_member(v_trip, v_uid) then
    raise exception 'Du er ikke medlem av denne turen' using errcode = '42501';
  end if;
  select status into v_status from public.trips where id = v_trip;
  if v_status is distinct from 'active' then
    raise exception 'Turen er arkivert – kan ikke registrere utlegg' using errcode = '42501';
  end if;
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
    is_treated, client_id, currency, trip_id
  ) values (
    v_uid::text, p_drink_type, p_total_cost,
    round(p_total_cost / v_count, 2), nullif(trim(p_note), ''),
    coalesce(p_drink_quantities, '{}'::jsonb), p_receipt_path,
    case when p_receipt_path is null then null else v_uid end,
    coalesce(p_is_treated, false), p_client_id, upper(p_currency), v_trip
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

GRANT EXECUTE ON FUNCTION public.create_round_with_participants(uuid, text, numeric, uuid[], text, jsonb, text, boolean, text, uuid) TO authenticated;