-- events_public (20260717050000_restrict_public_columns_via_views.sql)
-- already filters to curation_status = 'approved'; this adds the same
-- exclusion for admin-removed rows (removed_at, added in
-- 20260805060000_add_events_removed_at.sql) so "Quitar" actually takes
-- effect on the public site — every read in apps/web/src/lib/events.ts
-- already goes through this view, no application-code change needed.

create or replace view events_public as
select
  id, title, artist, description, freeform_location, place_name,
  region_id, image_url, opening_datetime, run_start_date, run_end_date,
  sensitivity_tags, source_url, opening_time_confirmed
from events
where curation_status = 'approved' and removed_at is null;
