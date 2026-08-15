-- Explicit pipeline attribution, added retroactively (2026-08-14): every
-- current insert path writes source='discovered' with no distinction
-- between comuna/Tavily search, web bright sources, Instagram, Google
-- Alerts, and MAVI headless — source_url alone can't recover this after
-- the fact for Google Alerts (arbitrary third-party article URLs) or
-- comuna search (same). Nullable so existing rows stay valid until the
-- one-time backfill script runs; NOT a default, so a forgotten call site
-- fails loudly (null) rather than silently misattributing to some
-- default pipeline. Built for a new /admin analytics dashboard (event
-- metrics + per-pipeline comparison) that can't show anything real
-- without this.
alter table events add column pipeline text
  check (pipeline in ('comuna_search', 'bright_source', 'instagram', 'google_alerts', 'headless'));
alter table rejected_candidates add column pipeline text
  check (pipeline in ('comuna_search', 'bright_source', 'instagram', 'google_alerts', 'headless'));
alter table api_usage_log add column pipeline text
  check (pipeline in ('comuna_search', 'bright_source', 'instagram', 'google_alerts', 'headless'));

create index events_pipeline_idx on events (pipeline);
create index rejected_candidates_pipeline_idx on rejected_candidates (pipeline);
create index api_usage_log_pipeline_idx on api_usage_log (pipeline);
