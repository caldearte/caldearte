-- Real gap found 2026-08-17, auditing a week of rejections: the only way
-- to see per-run "cobertura" (how many sources were due vs. configured,
-- how many items got skipped before curation, the full outcome funnel —
-- inserted/replaced/duplicate_skipped/escalated/expired/insert_failed,
-- not just approved/rejected) was digging through ephemeral GitHub
-- Actions logs by hand. That data was ALREADY being computed every run
-- (apps/curator/src/lib/notify.ts's RunSummary/HeadlessRunSummary/
-- InstagramRunSummary/GoogleAlertsRunSummary, see EventGroup/
-- CandidateSummary's own `outcome` field) — it just only ever fed a
-- summary email whose Resend half was never wired up
-- (RESEND_API_KEY not set), so the object was built and then discarded.
--
-- This table persists a compact projection of that same object every
-- run, regardless of whether the email actually sends — the full
-- original summary stays in `raw_summary` (jsonb) for anything a future
-- admin UI wants that isn't promoted to its own column yet, same
-- "ship raw, aggregate later" posture events/out_of_scope_signals
-- already use. NOT pruned — small, one row per curator run
-- (weekly/daily cadence per entrypoint, never high-volume).
create table discovery_run_summaries (
  id uuid primary key default gen_random_uuid(),
  entrypoint text not null
    check (entrypoint in ('event_discovery', 'headless', 'instagram', 'google_alerts')),
  started_at timestamptz not null,
  candidates_total integer not null default 0,
  approved_by_curation integer not null default 0,
  rejected_by_curation integer not null default 0,
  -- Real per-candidate outcome funnel (run.ts's own InsertOutcome type) —
  -- distinct from approved/rejected (Haiku's own verdict): an approved
  -- candidate can still end up "duplicate_skipped"/"escalated"/"expired"/
  -- "insert_failed" instead of actually landing on the site.
  inserted_count integer not null default 0,
  replaced_count integer not null default 0,
  duplicate_skipped_count integer not null default 0,
  escalated_count integer not null default 0,
  expired_count integer not null default 0,
  insert_failed_count integer not null default 0,
  cost_usd numeric not null default 0,
  raw_summary jsonb not null,
  created_at timestamptz not null default now()
);

create index discovery_run_summaries_started_at_idx on discovery_run_summaries (started_at desc);
create index discovery_run_summaries_entrypoint_idx on discovery_run_summaries (entrypoint);

-- Internal bookkeeping, same posture as rejected_candidates/api_usage_log/
-- out_of_scope_signals: RLS on, no public policy, explicit service_role grant.
alter table discovery_run_summaries enable row level security;
grant all on discovery_run_summaries to service_role;
