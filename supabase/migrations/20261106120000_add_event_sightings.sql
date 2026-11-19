-- Every source that reported an event, not only the one that won dedup
-- (Daniel, 2026-11-06). `events` keeps a single source per row, so when
-- Instagram and a website announce the same show the second arrival leaves
-- no durable trace: the coverage estimate of the research repo (capture-
-- recapture, Instagram vs web) has to rebuild that overlap by fuzzy-matching
-- titles out of discovery_run_summaries.raw_summary. This records it at the
-- moment the curator already knows the answer. Nothing in curation reads it.
--
-- One row per event × source_url, first sighting wins. No titles or artist
-- names on purpose: the row only says which public url reported which event.
--
-- Additive: one new table, plus a backfill that only reads `events`. Reverting
-- is `drop table event_sightings`.
create table event_sightings (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events (id) on delete cascade,
  source_url text not null,
  pipeline text,
  source_account text,
  -- inserted: created the event. replaced: overwrote it with a better version.
  -- duplicate_skipped: approved by curation, dropped by insertCandidates.
  -- pre_curation_duplicate: dropped before Haiku (findPreCurationDuplicate).
  -- backfill: the source already on the row when this table was created.
  stage text not null
    check (stage in ('inserted', 'replaced', 'duplicate_skipped', 'pre_curation_duplicate', 'backfill')),
  first_seen_at timestamptz not null default now(),
  unique (event_id, source_url)
);

create index event_sightings_pipeline_idx on event_sightings (pipeline);
create index event_sightings_first_seen_at_idx on event_sightings (first_seen_at);

-- Internal bookkeeping, same posture as instagram_collab_edges: RLS on, no
-- public policy, explicit service_role grant.
alter table event_sightings enable row level security;
grant all on event_sightings to service_role;

-- The source each event carries today. A row replaced before this migration
-- already lost its earlier source; that history can't be recovered from here.
insert into event_sightings (event_id, source_url, pipeline, source_account, stage, first_seen_at)
select id, source_url, pipeline, source_account, 'backfill', created_at
from events
where source_url is not null
on conflict (event_id, source_url) do nothing;
