-- Create a poll and all options atomically, with validation and a server-side
-- rate limit. This prevents empty/partial polls after a network interruption.

begin;

create or replace function public.create_poll_with_options(
  p_question text,
  p_options text[],
  p_require_all boolean default false,
  p_send_push_on_create boolean default true,
  p_send_push_on_resolved boolean default true,
  p_deadline_at timestamptz default null,
  p_min_votes integer default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_poll_id uuid;
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

  if (select count(*) from public.polls where created_by = v_uid and created_at > now() - interval '10 minutes') >= 2 then
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
    send_push_on_resolved, deadline_at, min_votes
  ) values (
    v_uid, p_question, p_require_all, p_send_push_on_create,
    p_send_push_on_resolved, p_deadline_at, p_min_votes
  ) returning id into v_poll_id;

  insert into public.poll_options (poll_id, label, sort_order)
  select v_poll_id, btrim(option_label), option_order::integer - 1
  from unnest(p_options) with ordinality as options(option_label, option_order);

  return v_poll_id;
end;
$$;

revoke all on function public.create_poll_with_options(text,text[],boolean,boolean,boolean,timestamptz,integer)
from public, anon, authenticated;
grant execute on function public.create_poll_with_options(text,text[],boolean,boolean,boolean,timestamptz,integer)
to authenticated;

commit;
