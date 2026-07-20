-- Keep historical game data for audit/recovery, but remove the retired shot,
-- token and points modules from the client-facing Data API.

begin;

revoke all on table public.shot_events from public, anon, authenticated;
revoke all on table public.shot_event_log from public, anon, authenticated;
revoke all on table public.shot_tokens from public, anon, authenticated;
revoke all on table public.token_ledger from public, anon, authenticated;
revoke all on table public.user_frikort from public, anon, authenticated;
revoke all on table public.points_ledger from public, anon, authenticated;
revoke all on table public.user_points from public, anon, authenticated;
revoke all on table public.user_streaks from public, anon, authenticated;
revoke all on table public.admin_corrections from public, anon, authenticated;

do $$
declare
  retired_function record;
begin
  for retired_function in
    select p.oid::regprocedure as signature
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and (
        p.proname like 'rpc_%shot%'
        or p.proname like 'rpc_%token%'
        or p.proname like 'rpc_%frikort%'
        or p.proname like 'rpc_%streak%'
        or p.proname in ('rpc_award_points', 'rpc_get_leaderboard', 'rpc_admin_correct')
      )
  loop
    execute format(
      'revoke all on function %s from public, anon, authenticated',
      retired_function.signature
    );
  end loop;
end;
$$;

commit;
