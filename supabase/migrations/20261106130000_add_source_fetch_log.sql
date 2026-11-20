-- Which sources were really read, and when (Daniel, 2026-11-06). The source
-- lists grew through 2026 (Instagram: 130 accounts added in August, 28 in
-- September, 15 in October), so a rise in exhibitions per month can't be told
-- apart from a rise in our own capture. bright_source_fetch_state keeps only
-- the latest fetch per source, and the lists in code say when a source was
-- added, not whether it was read or whether a run failed. This keeps the daily
-- history, so the research repo can count active sources per month and region.
-- Nothing in curation reads it.
--
-- One row per source per day. `location` is the source's fixedLocation when it
-- has one; an aggregator with no single place leaves it null. A failed fetch
-- writes no row, on purpose: that is what "not read that day" means here.
--
-- Additive: one new table. Reverting is `drop table source_fetch_log`.
create table source_fetch_log (
  pipeline text not null,
  -- Instagram username, source url, or a fixed label. Never the Google Alerts
  -- feed url: that one embeds an account-linked id and is treated as a secret.
  source_key text not null,
  fetched_on date not null,
  location text,
  items_count integer not null,
  primary key (pipeline, source_key, fetched_on)
);

create index source_fetch_log_fetched_on_idx on source_fetch_log (fetched_on);

-- Internal bookkeeping, same posture as instagram_collab_edges: RLS on, no
-- public policy, explicit service_role grant.
alter table source_fetch_log enable row level security;
grant all on source_fetch_log to service_role;
