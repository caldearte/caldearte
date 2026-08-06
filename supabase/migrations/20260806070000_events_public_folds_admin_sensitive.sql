-- events_public (20260717050000_restrict_public_columns_via_views.sql,
-- last touched 20260805070000 for removed_at) gains the admin-sensitive
-- fold described in 20260806060000_add_admin_sensitive_marked_at.sql —
-- every existing reader of sensitivity_tags (CardImage's blur,
-- filterFamilyMode's exclusion, CityThumbnails' blur) already just
-- checks array length/membership generically, so adding one more
-- synthetic entry here needs zero application-code changes to actually
-- take effect. admin_sensitive_marked_at itself is intentionally NOT
-- exposed as its own column here — the frontend's admin toggle button
-- reads current state from the same synthetic 'marcado_admin' tag it's
-- toggling, no separate field needed.

create or replace view events_public as
select
  id, title, artist, description, freeform_location, place_name,
  region_id, image_url, opening_datetime, run_start_date, run_end_date,
  case
    when admin_sensitive_marked_at is not null then sensitivity_tags || array['marcado_admin']
    else sensitivity_tags
  end as sensitivity_tags,
  source_url, opening_time_confirmed
from events
where curation_status = 'approved' and removed_at is null;
