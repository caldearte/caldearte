-- Real bug found 2026-08-29, auditing a live Instagram bright-source run:
-- a "visita guiada junto al artista" post got its own date written into
-- opening_datetime, indistinguishable from the exhibition's actual
-- inauguración — the calendar showed it as if the show opened that day.
-- Root cause: events never had a concept of "type" — only opening_datetime
-- (a single dated instance) vs run_start_date/run_end_date (a range), so
-- ANY confirmed dated instance (a real opening, a guided tour, a talk)
-- collapsed onto the same field. Daniel's editorial decision: 3 explicit
-- categories, ordered by how much interaction with the work they involve
-- (see docs/curation-policy.md for the full definitions):
--   1. inauguracion  — the opening party: artist, audience, and work together.
--   2. visita_guiada — a mediated instance, people experiencing the show together.
--   3. exposicion    — the viewer alone with the work (today's plain run range).
-- Workshops stay excluded entirely regardless of this — not modeled here.
--
-- Reuses the existing date columns rather than adding new ones:
-- opening_datetime/opening_time_confirmed now mean "date/time of THIS
-- specific instance" for both inauguracion and visita_guiada (both are
-- single dated instances); run_start_date/run_end_date is unchanged for
-- exposicion.
alter table events
  add column event_type text not null default 'exposicion'
  constraint events_event_type_check check (event_type in ('inauguracion', 'visita_guiada', 'exposicion'));

-- Backfill preserves exactly today's visual behavior: everything that
-- already shows as an "inauguración" (has opening_datetime) keeps
-- showing that way. Nothing retroactively becomes visita_guiada — there's
-- no reliable signal to tell the two apart in historical data without
-- re-reading every original source text.
update events set event_type = 'inauguracion' where opening_datetime is not null;

-- events_public (last touched 20260806070000 for the admin-sensitive
-- fold) gains event_type so the frontend can split into 3 sections.
-- event_type appended at the END of the select list, not inserted among
-- the existing columns — CREATE OR REPLACE VIEW refuses to reorder or
-- insert a column ahead of an existing one (42P16), only append after.
create or replace view events_public as
select
  id, title, artist, description, freeform_location, place_name,
  region_id, image_url, opening_datetime, run_start_date, run_end_date,
  case
    when admin_sensitive_marked_at is not null then sensitivity_tags || array['marcado_admin']
    else sensitivity_tags
  end as sensitivity_tags,
  source_url, opening_time_confirmed, event_type
from events
where curation_status = 'approved' and removed_at is null;
