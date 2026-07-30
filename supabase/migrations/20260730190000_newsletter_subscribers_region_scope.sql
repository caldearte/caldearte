-- Newsletter subscription scope: comuna -> macro-región (Región
-- Metropolitana, Valparaíso, etc.). Product decision: picking one of 16
-- macro-regions in the entry modal is a lighter ask than picking one of
-- 346 comunas, and a subscriber who cares about "art near me" broadly
-- still gets useful coverage at the región level. Chile's macro-regions
-- aren't a separate table — they're the `regions.admin_region_name` text
-- column already on every comuna row (see docs/data-model.md) — so this
-- stores that name directly rather than adding a new table for 16 rows.
alter table newsletter_subscribers add column admin_region_name text;

-- Backfill the one real row (city_id -> its comuna's admin_region_name)
-- before dropping city_id — no real subscriber base yet to worry about
-- losing precision on, but nothing is silently discarded either.
update newsletter_subscribers ns
set admin_region_name = r.admin_region_name
from regions r
where ns.city_id = r.id;

alter table newsletter_subscribers alter column admin_region_name set not null;
alter table newsletter_subscribers drop column city_id;
