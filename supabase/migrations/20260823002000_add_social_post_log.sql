-- Instagram social-distribution pipeline (docs/roadmap.md, Fase 4): the
-- "no te la pierdas" (closing-soon) and "destacada" (curated) carousel
-- types must never repeat the same expo within the same calendar week —
-- only "inauguraciones" repeats deliberately (it's meant to work as a
-- recurring reminder). This table is the de-dup log those two types'
-- selection queries check against: "which events has this post type
-- already featured this week." No row is ever written for
-- 'inauguracion' — repeats are intentional there, so there's nothing to
-- exclude.
--
-- Also doubles as the "how long since this event last appeared as a
-- destacada" signal across weeks (not just the current one), which the
-- destacada selection uses to rotate through eligible expos instead of
-- resurfacing the same handful every week.
create table social_post_log (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events(id) on delete cascade,
  post_type text not null
    check (post_type in ('no_te_la_pierdas', 'destacada')),
  -- Monday of the Santiago-timezone week this post covered — same "fixed
  -- Monday-Sunday week" convention as apps/web/src/lib/date.ts's
  -- weekBoundsInSantiago and the newsletter's own weekBoundsInSantiago.
  week_start date not null,
  posted_at timestamptz not null default now()
);

create index social_post_log_week_type_idx on social_post_log (week_start, post_type);
-- Powers "how long since this event was last featured as a destacada"
-- lookups, which scan by event_id + post_type across all weeks.
create index social_post_log_event_type_idx on social_post_log (event_id, post_type);

-- Internal bookkeeping, same posture as discovery_run_summaries/
-- rejected_candidates/api_usage_log: RLS on, no public policy, explicit
-- service_role grant.
alter table social_post_log enable row level security;
grant all on social_post_log to service_role;
