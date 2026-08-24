-- Instagram engagement tracking (docs/roadmap.md, Fase 4) — Daniel asked
-- whether the Monday "inauguraciones" repeat (same content as Sunday's,
-- by design — see selection.ts's own doc comment) is worth it, or too
-- soon after Sunday to add real reach. Answering that needs real
-- engagement data over time, which nothing captured before this: the
-- Instagram media id returned by publishInstagramCarousel was only ever
-- logged, never persisted.
--
-- Two tables:
-- - instagram_posts: one row per published carousel, created right after
--   a successful publish (social-publish/run.ts). Engagement columns
--   start null and get filled in later by a separate weekly cron
--   (instagram-insights/run.ts) that reads them back from the real
--   Graph API — publishing and measuring are different API calls at
--   different times, so this can't be one write.
-- - instagram_account_snapshots: a periodic followers_count/media_count
--   reading, same "daily/weekly snapshot" posture as
--   platform_cost_snapshots (no per-event ledger exists for follower
--   growth either, only whatever the account looks like right now).
create table instagram_posts (
  id uuid primary key default gen_random_uuid(),
  media_id text not null unique,
  post_type text not null
    check (post_type in ('inauguracion', 'no_te_la_pierdas', 'destacada')),
  -- Same "fixed Monday-Sunday week" convention as social_post_log.
  week_start date not null,
  published_at timestamptz not null,
  -- Nullable: unpopulated until instagram-insights/run.ts's first pass
  -- over this row, and even then the Graph API can return a subset
  -- depending on media type/API version — never assume all 4 are set.
  reach integer,
  saved integer,
  like_count integer,
  comments_count integer,
  metrics_updated_at timestamptz,
  created_at timestamptz not null default now()
);

create index instagram_posts_published_at_idx on instagram_posts (published_at);
create index instagram_posts_week_type_idx on instagram_posts (week_start, post_type);

alter table instagram_posts enable row level security;
grant all on instagram_posts to service_role;

create table instagram_account_snapshots (
  id uuid primary key default gen_random_uuid(),
  snapshot_date date not null unique,
  followers_count integer not null,
  media_count integer not null,
  created_at timestamptz not null default now()
);

alter table instagram_account_snapshots enable row level security;
grant all on instagram_account_snapshots to service_role;
