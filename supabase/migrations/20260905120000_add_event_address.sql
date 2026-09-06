-- Real incident, 2026-09-05: Daniel physically visited two events using the
-- site's "Cómo llegar" button and was sent to the wrong place both times
-- (Galería Malva / Casa Portugal — a closed door near Barrio Italia that
-- wasn't the right venue at all; LINIA Galería — same pattern). Root cause:
-- events never stored a real street address, only place_name + a
-- comuna-level freeform_location (a deliberate 2026-07-24 decision,
-- docs/region-discovery.md, so an event card only ever shows the short
-- "Venue, Comuna" convention, never a full address). The "Cómo llegar"
-- button (apps/web/src/lib/useEventCardActions.ts) has no choice but to
-- build its Google Maps directions query from that same short string —
-- which silently resolves to the wrong POI whenever Maps doesn't have the
-- exact venue name indexed (a gallery's own sub-brand name, distinct from
-- the building/business Maps actually knows).
--
-- Both real addresses were already known and sitting unused in prose: see
-- apps/curator/src/lib/known-sources.ts's casaportugal.cl note ("Portugal
-- 1431, Santiago de Chile — Metro Ñuble") and
-- apps/curator/src/lib/instagram-accounts.ts's linia_gallery note
-- ("Huérfanos 3044, Santiago"). This column captures that address
-- structurally going forward (fixedLocation.address, or an aggregator's
-- own locationExtractor raw text) so the Maps link can prefer it — the
-- displayed venue text stays exactly "Venue, Comuna" as before, this is
-- never rendered on an event card.
alter table events add column address text;

-- events_public (last touched 20260904050000) gains address, appended at
-- the END of the select list — CREATE OR REPLACE VIEW refuses to reorder
-- or insert a column ahead of an existing one (42P16), only append after.
create or replace view events_public as
select
  id, title, artist, description, freeform_location, place_name,
  region_id, image_url, opening_datetime, run_start_date, run_end_date,
  case
    when admin_sensitive_marked_at is not null then sensitivity_tags || array['marcado_admin']
    else sensitivity_tags
  end as sensitivity_tags,
  source_url, opening_time_confirmed, event_type, address
from events
where curation_status = 'approved' and removed_at is null;
