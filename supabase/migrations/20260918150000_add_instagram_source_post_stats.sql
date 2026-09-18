-- Engagement of the SOURCE posts the Instagram pipeline fetches (Daniel,
-- 2026-09-18). Apify's dataset already carries likes, comments, media
-- type and hashtags for every post we pay for, and until now all of it
-- was dropped after parsing. Kept per fetched post — curated or not, so a
-- rejected post's traction is visible too — and joined to events /
-- rejected_candidates on source_url when needed. What it's for: an
-- editorial signal (which openings already have traction before we
-- publish them, which formats the busiest venues use) and the raw
-- material for the weekly review; nothing in curation reads it. Upserted
-- on post_url so a post fetched twice keeps its latest counts. Not the
-- same thing as instagram_posts (OUR account's carousels and their
-- reach); this is everyone else's posts.
create table instagram_source_post_stats (
  post_url text primary key,
  -- The registered account the post was attributed to (author or
  -- co-author; null when none matched and the post was skipped).
  source_account text,
  owner_username text not null,
  owner_full_name text,
  posted_at timestamptz,
  likes_count integer,
  comments_count integer,
  -- Image | Video | Sidecar (carousel), as the actor reports it.
  media_type text,
  hashtags text[] not null default '{}',
  fetched_at timestamptz not null default now()
);

create index instagram_source_post_stats_source_account_idx on instagram_source_post_stats (source_account);
create index instagram_source_post_stats_posted_at_idx on instagram_source_post_stats (posted_at);

-- Internal bookkeeping, same posture as instagram_collab_edges: RLS on,
-- no public policy, explicit service_role grant.
alter table instagram_source_post_stats enable row level security;
grant all on instagram_source_post_stats to service_role;
