-- Public venue pages, /espacios/[slug] (Daniel, 2026-10-02). The artist/venue
-- catalog (20260928120000) is private by design — RLS on, no public
-- policy, the web app reads none of it — because its outreach columns
-- (follows_caldearte_at, newsletter_subscribed_at, notes, and everything in
-- outreach_contacts) are not something to expose. A venue page needs only
-- the public half: a name, where it is, its Instagram handle, and its
-- events. Same column-restricted-view pattern as events_public /
-- regions_public (20260717050000): anon never gets a grant on the base
-- table, only on a view that bakes in the filter and the column list.
--
-- Two additive changes, nothing existing changes meaning, no data moves:
--
--   1. `events_public` gains `venue_id`, appended at the END of the select
--      list (CREATE OR REPLACE VIEW can only append a column, never insert
--      one ahead of an existing one — 42P16, same constraint as
--      20260905120000). It is the join key a venue page needs to list "this
--      venue's events"; matching on place_name text would re-open the
--      name-variant problem the catalog exists to solve. The definition
--      below was checked against the live production view
--      (pg_get_viewdef, 2026-10-02) — identical to 20260905120000's, so
--      this replaces nothing but the one added column. Existing grants on
--      the view survive CREATE OR REPLACE.
--
--   2. `venues_public`: id, name, region_id, comuna, instagram_handle —
--      and only venues with at least one live event (approved, not
--      removed), so an empty or fully-removed venue 404s instead of
--      rendering a blank page. Deliberately NOT exposed: name_key
--      (internal identity), created_at, follows_caldearte_at,
--      newsletter_subscribed_at, notes.
--
-- Reversible: drop view venues_public; recreate events_public without
-- venue_id (the previous definition is in 20260905120000).

create or replace view events_public as
select
  id, title, artist, description, freeform_location, place_name,
  region_id, image_url, opening_datetime, run_start_date, run_end_date,
  case
    when admin_sensitive_marked_at is not null then sensitivity_tags || array['marcado_admin']
    else sensitivity_tags
  end as sensitivity_tags,
  source_url, opening_time_confirmed, event_type, address,
  venue_id
from events
where curation_status = 'approved' and removed_at is null;

create view venues_public as
select v.id, v.name, v.region_id, v.comuna, v.instagram_handle
from venues v
where exists (
  select 1
  from events e
  where e.venue_id = v.id
    and e.curation_status = 'approved'
    and e.removed_at is null
);

-- Default privileges revoke everything from anon/authenticated on new
-- relations (20260731170000), so this grant is the only thing that makes
-- the view readable.
grant select on venues_public to anon, authenticated;
