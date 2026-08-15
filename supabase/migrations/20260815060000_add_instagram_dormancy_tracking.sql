-- Extends the adaptive Instagram fetch cadence (lib/instagram-fetch-state.ts,
-- 2026-08-13) with a dormancy path, per Daniel's explicit request
-- (2026-08-15): once an account's cadence has climbed to the existing
-- 28-day ("monthly") cap and stayed there with zero new posts for 3
-- consecutive cycles, drop it to a 182-day ("semestral") cadence; after 2
-- consecutive semesters still with nothing, mark it inactive so it's
-- never fetched again automatically (an Apify fetch costs real money —
-- a truly dormant account shouldn't keep getting checked forever).
-- consecutive_zero_yield_at_cap only ever counts empty cycles WHILE
-- already at the monthly or semestral cadence (reset to 0 the moment any
-- new post is found, or when a tier transition happens) — see
-- nextFetchState's own doc comment for the exact state machine.
alter table bright_source_fetch_state
  add column consecutive_zero_yield_at_cap integer not null default 0,
  add column is_inactive boolean not null default false;

create index bright_source_fetch_state_is_inactive_idx on bright_source_fetch_state (is_inactive);
