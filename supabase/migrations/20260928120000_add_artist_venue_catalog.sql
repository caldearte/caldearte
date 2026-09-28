-- Our own registry of artists and venues (Daniel, 2026-09-28). Until now
-- both only existed as free text on each event — `events.artist` (225
-- distinct strings on 417 live events, 38 of them lists of several
-- names) and `events.place_name` (244 distinct strings, with variants of
-- the same place) — so "what has this artist shown, where and when" had
-- no answer, and the weekly outreach routine had no memory of who had
-- already been written to. Three pieces:
--
--   1. `artists` / `venues`: one row per real artist / place, keyed on a
--      normalized name, built and kept up to date by the curator's
--      catalog sync (apps/curator/src/lib/catalog.ts), which sweeps every
--      event whose `catalog_synced_at` is null at the end of each
--      discovery run. Nothing here is typed by hand except the outreach
--      columns and merges.
--   2. `event_artists` + `events.venue_id`: the links, so an artist's
--      history is a join, not a text search (view `artist_history`).
--   3. `outreach_contacts` + the `follows_caldearte_at` /
--      `newsletter_subscribed_at` columns: Daniel's manual outreach
--      (5-10 DMs a day, never automated) recorded per artist/venue, so the
--      Monday routine can say "already written to on 09-22".
--
-- Additive only: no existing column changes meaning, no data is deleted
-- or transformed. `events` gains two nullable columns. Reversible by
-- dropping the new objects.
--
-- Private by design: artists' handles are public on Instagram, but the
-- outreach state (who was contacted, who replied) is not something to
-- expose. RLS on, no public policy, explicit service_role grant — the same
-- posture as instagram_collab_edges. The web app does not read any of it.

create table artists (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  -- The name as first seen on an event (accents and case preserved).
  name text not null,
  -- Lowercased, accent-stripped, punctuation-collapsed `name` — the
  -- identity used by the sync to find an existing row.
  name_key text not null unique,
  -- Lowercased Instagram username, without "@". Filled from the event's
  -- own `artist_instagram_handle` or from the post's co-authors
  -- (instagram_collab_edges) when the handle matches the name; editable.
  instagram_handle text,
  -- Where `instagram_handle` came from: 'event' (the curated post
  -- @-mentioned the artist), 'collab' (a co-author of the source post
  -- whose username contains every word of the name), 'manual'.
  instagram_handle_source text
    check (instagram_handle_source in ('event', 'collab', 'manual')),
  -- Outreach state (step 2). Manual, set when Daniel confirms it.
  follows_caldearte_at timestamptz,
  newsletter_subscribed_at timestamptz,
  notes text
);

-- One artist per handle: a handle identifies the person better than a
-- spelling of their name does ("José Soto" / "José Luis Soto").
create unique index artists_instagram_handle_key on artists (instagram_handle)
  where instagram_handle is not null;

create table venues (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  -- The place name as first seen on an event.
  name text not null,
  -- Normalized `name` plus region, so two "Casa de la Cultura" in
  -- different regions stay apart: `<normalized name>|<region_id>`.
  name_key text not null unique,
  region_id uuid references regions (id),
  -- The event's freeform_location the first time the venue was seen
  -- (usually the comuna).
  comuna text,
  -- Lowercased Instagram username when the venue is one of our
  -- registered Instagram sources (instagram-accounts.ts fixedLocation) or
  -- was set by hand.
  instagram_handle text,
  follows_caldearte_at timestamptz,
  newsletter_subscribed_at timestamptz,
  notes text
);

create table event_artists (
  event_id uuid not null references events (id) on delete cascade,
  artist_id uuid not null references artists (id) on delete cascade,
  primary key (event_id, artist_id)
);

create index event_artists_artist_id_idx on event_artists (artist_id);

alter table events add column venue_id uuid references venues (id) on delete set null;
-- Null = not yet processed by the catalog sync. The curator resets it to
-- null when it replaces an event in place (different artist/place text),
-- so the sweep picks the new version up.
alter table events add column catalog_synced_at timestamptz;

create index events_venue_id_idx on events (venue_id);
create index events_catalog_unsynced_idx on events (created_at) where catalog_synced_at is null;

-- One row per message Daniel sends (or comment, or conversation at an
-- opening). Written on his word — through Claude or the SQL editor — never
-- by a pipeline.
create table outreach_contacts (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  contacted_at timestamptz not null default now(),
  artist_id uuid references artists (id) on delete cascade,
  venue_id uuid references venues (id) on delete cascade,
  -- The event the message was about, if any ("tu inauguración está en
  -- Caldearte"). Kept when the event is later pruned.
  event_id uuid references events (id) on delete set null,
  channel text not null default 'dm'
    check (channel in ('dm', 'comment', 'email', 'in_person', 'other')),
  replied_at timestamptz,
  note text,
  check (artist_id is not null or venue_id is not null)
);

create index outreach_contacts_artist_id_idx on outreach_contacts (artist_id);
create index outreach_contacts_venue_id_idx on outreach_contacts (venue_id);

-- "What has this artist shown, where and when" — one row per (artist,
-- event), removed events excluded. security_invoker so the base tables'
-- RLS applies to whoever queries it; anon/authenticated get nothing.
create view artist_history with (security_invoker = true) as
select
  a.id as artist_id,
  a.name as artist,
  a.instagram_handle,
  e.id as event_id,
  e.title,
  coalesce(v.name, e.place_name) as venue,
  e.freeform_location as comuna,
  e.opening_datetime,
  e.opening_time_confirmed,
  e.run_start_date,
  e.run_end_date,
  e.source_url,
  'https://www.caldearte.com/eventos/' || e.id as caldearte_url
from artists a
join event_artists ea on ea.artist_id = a.id
join events e on e.id = ea.event_id
left join venues v on v.id = e.venue_id
where e.removed_at is null;

alter table artists enable row level security;
alter table venues enable row level security;
alter table event_artists enable row level security;
alter table outreach_contacts enable row level security;
grant all on artists, venues, event_artists, outreach_contacts to service_role;
grant select on artist_history to service_role;
revoke all on artist_history from anon, authenticated;
