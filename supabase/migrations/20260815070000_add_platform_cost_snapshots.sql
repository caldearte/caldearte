-- Real historical cost tracking for platforms that don't have their own
-- per-call ledger in this DB the way Anthropic does (api_usage_log).
-- Apify is the first: no per-call cost data reaches us, only a running
-- monthly usage total via their own API (GET /v2/users/me/usage/monthly,
-- confirmed 2026-08-15) — this table stores a DAILY SNAPSHOT of that,
-- populated by a new daily cron (apps/curator/src/apify-usage-snapshot),
-- not a per-call record. `platform` deliberately CHECK-constrained to
-- just 'apify' for now — same extend-later posture as `pipeline`'s own
-- CHECK constraint on events/rejected_candidates (widen with a one-line
-- migration when a second platform's usage API gets wired in, e.g.
-- Tavily or Resend, rather than guessing the full set up front).
create table platform_cost_snapshots (
  id uuid primary key default gen_random_uuid(),
  platform text not null check (platform in ('apify')),
  usage_date date not null,
  amount_usd numeric not null,
  raw jsonb,
  recorded_at timestamptz not null default now(),
  unique (platform, usage_date)
);

create index platform_cost_snapshots_usage_date_idx on platform_cost_snapshots (usage_date);

alter table platform_cost_snapshots enable row level security;
grant all on platform_cost_snapshots to service_role;
