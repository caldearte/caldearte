-- Public artist pages, /artistas/[slug] (Daniel, 2026-10-02), plus the one
-- thing every public page of the catalog needs and venues_public
-- (20261002140000) did not have: a way to take a page down.
--
-- 1. `public_hidden_at` on artists AND venues. The pages carry a note
--    promising to correct or retire a ficha on request (Ley 21.719 applies
--    from December 2026), and the catalog also holds rows that are not
--    really artists ("Exposición Regional 2026", a batucada). Setting the
--    column hides the page and its sitemap entry; nothing is deleted, the
--    row keeps feeding the private catalog (outreach, dedup) and clearing
--    the column brings the page back. Deliberately a timestamp, not a
--    boolean: it records when. venues_public is replaced below to honour it
--    (same columns in the same order, so CREATE OR REPLACE is allowed).
--
-- 2. `artists_public`: id, name, instagram_handle — only artists with at
--    least one live event (approved, not removed) and not hidden. The
--    handle is exposed ONLY when its source is 'event' (the curated post
--    itself @-mentioned the artist) or 'manual'. A 'collab' handle comes
--    from a name-matching heuristic over a post's co-authors
--    (instagram_handle_source's own doc comment in 20260928120000): good
--    enough for Daniel's outreach shortlist, not good enough to publish a
--    profile link under a person's name — a wrong match would attribute
--    someone else's Instagram to them (19 of 63 handles are 'collab' at
--    2026-10-02). Never exposed: name_key, created_at, follows_caldearte_at,
--    newsletter_subscribed_at, notes, instagram_handle_source.
--
-- 3. `event_artists_public`: (event_id, artist_id) for live events and
--    visible artists — the join the page needs, so an artist's shows come
--    from the catalog's links, not from matching the free-text
--    events.artist (38 of those are lists of several names).
--
-- Additive except for the venues_public replacement. Reversible: drop the
-- two new views and the two columns, and recreate venues_public as in
-- 20261002140000.

alter table artists add column public_hidden_at timestamptz;
alter table venues add column public_hidden_at timestamptz;

create or replace view venues_public as
select v.id, v.name, v.region_id, v.comuna, v.instagram_handle
from venues v
where v.public_hidden_at is null
  and exists (
    select 1
    from events e
    where e.venue_id = v.id
      and e.curation_status = 'approved'
      and e.removed_at is null
  );

create view artists_public as
select
  a.id,
  a.name,
  case when a.instagram_handle_source in ('event', 'manual') then a.instagram_handle end as instagram_handle
from artists a
where a.public_hidden_at is null
  and exists (
    select 1
    from event_artists ea
    join events e on e.id = ea.event_id
    where ea.artist_id = a.id
      and e.curation_status = 'approved'
      and e.removed_at is null
  );

create view event_artists_public as
select ea.event_id, ea.artist_id
from event_artists ea
join events e on e.id = ea.event_id
  and e.curation_status = 'approved'
  and e.removed_at is null
join artists a on a.id = ea.artist_id
  and a.public_hidden_at is null;

-- Default privileges revoke everything from anon/authenticated on new
-- relations (20260731170000); venues_public keeps its existing grant.
grant select on artists_public, event_artists_public to anon, authenticated;
