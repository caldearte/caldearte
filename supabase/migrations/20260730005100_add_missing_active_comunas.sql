-- Real drift found 2026-07-30 while building coordinate-based geo matching:
-- these 10 comunas exist in PRODUCTION (status='active', with real admin
-- región metadata already set) but were never captured by any committed
-- migration — they must have been inserted directly at some point in this
-- project's history. A fresh `supabase db reset` silently ends up with
-- only 336 of the real 346 comunas, missing exactly these 10 — including
-- La Reina, the comuna motivating this whole feature. Restores
-- migration/production parity; `where not exists` makes it a no-op
-- against an environment (like production) that already has them.
insert into regions (name, country, language, status, population, admin_region_name, admin_region_order, admin_region_numeral)
select v.name, 'Chile', 'es', 'active', v.population, v.admin_region_name, v.admin_region_order, v.admin_region_numeral
from (values
  ('Independencia', 100281, 'Región Metropolitana de Santiago', 7, 'RM'),
  ('La Reina', 92787, 'Región Metropolitana de Santiago', 7, 'RM'),
  ('Ñuñoa', 208237, 'Región Metropolitana de Santiago', 7, 'RM'),
  ('Providencia', 142079, 'Región Metropolitana de Santiago', 7, 'RM'),
  ('Recoleta', 157260, 'Región Metropolitana de Santiago', 7, 'RM'),
  ('Frutillar', null, 'Región de Los Lagos', 14, 'X'),
  ('La Florida', null, 'Región Metropolitana de Santiago', 7, 'RM'),
  ('Maipú', null, 'Región Metropolitana de Santiago', 7, 'RM'),
  ('Puente Alto', null, 'Región Metropolitana de Santiago', 7, 'RM'),
  ('Renca', null, 'Región Metropolitana de Santiago', 7, 'RM')
) as v(name, population, admin_region_name, admin_region_order, admin_region_numeral)
where not exists (select 1 from regions r where r.name = v.name);
