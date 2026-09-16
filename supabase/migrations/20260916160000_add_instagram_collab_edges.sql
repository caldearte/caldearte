-- The Instagram collab graph as a discovery channel (Daniel, 2026-09-16).
-- Every collaborative post the pipeline fetches names its co-authors
-- (Apify's `coauthorProducers`, the field #538 attributes collab posts
-- with). The handles that are NOT in our registry are the signal: a
-- handle that co-posts with two or three different registered venues
-- over a few weeks is almost certainly a place we don't cover yet (the
-- first two-day sample already yielded cajacrisol_arte and
-- museoregionaldeatacama, both in a comuna with two sources total),
-- while a handle seen once is usually the artist of that show. Apify
-- datasets expire within days, so the graph has to be persisted per run
-- for that recurrence to be visible at all. One row per (post, registered
-- account, unregistered handle) edge — append-only, deduped on the
-- natural key so a re-fetched post never double-counts. Which side was
-- the post's author is kept (`handle_role`) because the two directions
-- read differently: a registered venue co-authoring an unregistered
-- account's post is the stronger hint that the account is an
-- institution. Whether the post became an event is NOT stored here: join
-- `events.source_url` / `rejected_candidates.source_url` on `post_url`
-- when querying. Reviewed by hand, monthly, with the query documented in
-- docs/region-discovery.md; nothing reads this table automatically.
create table instagram_collab_edges (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  post_url text not null,
  -- The post's own publish time as reported by the actor, so recurrence
  -- can be measured over the post dates rather than over run dates.
  posted_at timestamptz,
  -- The registered account (instagram-accounts.ts username) that shares
  -- the post with the handle — the post's author or one of its
  -- co-authors, whichever side is ours.
  registered_account text not null,
  -- The unregistered Instagram username on the other side of the edge,
  -- lowercased. "Unregistered" as of the run that wrote the row: the
  -- registry moves, so filter against the current one when querying.
  handle text not null,
  -- 'author' when the handle wrote the post and the registered account is
  -- a co-author; 'coauthor' when a registered account wrote it and the
  -- handle is listed as co-author.
  handle_role text not null
    check (handle_role in ('author', 'coauthor')),
  unique (post_url, registered_account, handle)
);

create index instagram_collab_edges_handle_idx on instagram_collab_edges (handle);
create index instagram_collab_edges_created_at_idx on instagram_collab_edges (created_at);

-- Internal bookkeeping, same posture as bright_source_fetch_state /
-- shadow_curation_comparisons: RLS on, no public policy, explicit
-- service_role grant.
alter table instagram_collab_edges enable row level security;
grant all on instagram_collab_edges to service_role;
