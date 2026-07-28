-- Records a bright-source candidate Haiku rejected, keyed by its sourceUrl
-- (always non-null for bright-source items — see extractors.ts's
-- BrightSourceItem). Purpose: let a future run SKIP re-curating an item
-- it already rejected, instead of re-spending Haiku tokens on the same
-- verdict every single fetch cycle — a real, measured problem once a
-- high-volume mixed-content bright source (chilecultura.gob.cl, ~50
-- items/week nationally, most not visual art) entered the picture.
--
-- Deliberately a NEW, separate table — not a revival of `events`'
-- curation_status = 'rejected'. Rejected candidates used to be inserted
-- into `events` and were removed after a real production crash
-- (2026-07-22): processing a rejected candidate's `location` (routinely
-- null) through code that assumed it was always a string. This table
-- never touches `location` at all — only source_url/title/reason — so it
-- can't reopen that crash class, and it stays clear of `events`' public
-- views/RLS policies, which assume every row there is real approved (or
-- pending_review) content.
--
-- Rolling ~90-day window (apps/curator/src/event-discovery/run.ts prunes
-- older rows on every run, same piggybacked-cadence pattern as
-- raw_search_results) — long enough to skip re-curating a source's
-- typically-static listing for a full exhibition cycle, short enough
-- that an item whose content genuinely changes eventually gets a fresh
-- look instead of being excluded forever.
create table rejected_candidates (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  source_url text not null unique,
  title text not null,
  reason text not null
);

create index rejected_candidates_created_at_idx on rejected_candidates (created_at);

-- Internal bookkeeping, same posture as raw_search_results/detected_sources/
-- system_config/api_usage_log: RLS on, no public policy, explicit
-- service_role grant (PostgREST's service_role gets no implicit access —
-- see docs/data-model.md).
alter table rejected_candidates enable row level security;
grant all on rejected_candidates to service_role;
