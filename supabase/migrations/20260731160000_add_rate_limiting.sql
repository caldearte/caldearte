-- Security audit finding (2026-07-31, A1): /api/contact and
-- /api/newsletter/subscribe had no rate limiting at all — anyone could
-- call either an unlimited number of times. The worst case:
-- /api/newsletter/subscribe sends a real "confirm your subscription"
-- email to WHATEVER address is in the request body, so an attacker could
-- use Caldearte as a relay to email-bomb arbitrary third parties, on top
-- of burning Resend send quota/reputation. No new external service
-- (Upstash etc) — implemented directly against Postgres, consistent with
-- staying on free tiers until there's a real reason not to.
--
-- Fixed-window counter, not a true sliding window — simpler, and good
-- enough for abuse prevention (not billing-grade precision). One row per
-- (bucket_key, window_start); check_rate_limit atomically increments and
-- reports whether the caller is still under the limit.
create table rate_limit_counters (
  bucket_key text not null,
  window_start timestamptz not null,
  count integer not null default 1,
  primary key (bucket_key, window_start)
);

alter table rate_limit_counters enable row level security;
-- No grant to anon/authenticated on the table itself — only reachable
-- through the SECURITY DEFINER function below, same pattern as
-- prune_expired_events (20260718050000).
grant all on rate_limit_counters to service_role;

create or replace function check_rate_limit(p_bucket_key text, p_max_count integer, p_window_seconds integer)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_window_start timestamptz;
  v_count integer;
begin
  v_window_start := to_timestamp(floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds);

  insert into rate_limit_counters (bucket_key, window_start, count)
  values (p_bucket_key, v_window_start, 1)
  on conflict (bucket_key, window_start)
  do update set count = rate_limit_counters.count + 1
  returning count into v_count;

  -- Opportunistic cleanup instead of a separate cron — this table only
  -- matters for a rolling ~1 day, and staying small keeps every lookup
  -- fast. 1% chance per call is cheap and self-balancing with traffic
  -- volume (busier = cleans up more often).
  if random() < 0.01 then
    delete from rate_limit_counters where window_start < now() - interval '1 day';
  end if;

  return v_count <= p_max_count;
end;
$$;

revoke all on function check_rate_limit(text, integer, integer) from public;
grant execute on function check_rate_limit(text, integer, integer) to anon, authenticated;
