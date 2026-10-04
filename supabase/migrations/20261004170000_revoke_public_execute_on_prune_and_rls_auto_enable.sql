-- Close an unauthenticated delete path found 2026-10-04 by Supabase's
-- security advisor (lint 0028, anon_security_definer_function_executable).
--
-- prune_expired_events(cutoff_date) is SECURITY DEFINER and, like every
-- function created in `public`, was executable by PUBLIC — so also by the
-- `anon` role, whose key ships in every browser bundle by design. Anyone
-- could POST /rest/v1/rpc/prune_expired_events with a far-future cutoff and
-- delete every non-approved row in `events` (approved rows are excluded by
-- the function itself since 20260719060000). Its only real caller is Event
-- Discovery's weekly run (apps/curator/src/event-discovery/run.ts), which
-- uses the service-role key, so it keeps working. Edge logs for the last 24h
-- show only that legitimate call (2026-10-04 12:15 UTC, secret key, from
-- GitHub Actions).
--
-- rls_auto_enable() returns event_trigger, so Postgres refuses to run it
-- outside an event trigger and calling it through the API does nothing.
-- Revoked anyway so the advisor stays clean and it can't become callable by
-- accident if it is ever rewritten. It was created on the hosted project,
-- not by any migration here, so a fresh local database doesn't have it —
-- hence the existence check.
--
-- Not changed: check_rate_limit(...) stays executable by anon on purpose —
-- the public API routes call it with the anon key (see
-- apps/web/src/lib/rate-limit.ts). Pure privilege change: no data is read,
-- moved or deleted; reverting is a GRANT EXECUTE ... TO anon, authenticated.

revoke execute on function public.prune_expired_events(date) from public, anon, authenticated;
grant execute on function public.prune_expired_events(date) to service_role;

do $$
begin
  if to_regprocedure('public.rls_auto_enable()') is not null then
    revoke execute on function public.rls_auto_enable() from public, anon, authenticated;
  end if;
end
$$;
