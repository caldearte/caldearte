-- Security audit finding (2026-07-31): newsletter_subscribers' anon
-- INSERT policy is `with check (true)` — no format/length validation at
-- the DB level. apps/web's /api/newsletter/subscribe route does validate
-- with a regex before inserting, but since the anon key is public by
-- design, anyone can bypass that route entirely and POST straight to
-- Supabase's REST endpoint with arbitrary garbage. This adds the missing
-- DB-level guarantees so the constraint holds regardless of which client
-- wrote the row.
--
-- admin_region_name is checked against the 16 real
-- regions.admin_region_name values rather than a foreign key — these
-- are a fixed, rarely-changing set of Chilean macro-regions (see
-- docs/data-model.md), not a separate table, so a plain CHECK list is
-- simpler than a trigger-based cross-table lookup. If a 17th región is
-- ever added, this list needs updating alongside it.
alter table newsletter_subscribers
  add constraint newsletter_subscribers_email_format check (
    email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' and length(email) <= 320
  );

alter table newsletter_subscribers
  add constraint newsletter_subscribers_admin_region_name_valid check (
    admin_region_name in (
      'Arica y Parinacota',
      'Tarapacá',
      'Antofagasta',
      'Atacama',
      'Coquimbo',
      'Valparaíso',
      'Región Metropolitana de Santiago',
      'Región del Libertador Gral. Bernardo O''Higgins',
      'Región del Maule',
      'Región de Ñuble',
      'Región del Biobío',
      'Región de la Araucanía',
      'Región de Los Ríos',
      'Región de Los Lagos',
      'Región Aisén del Gral. Carlos Ibáñez del Campo',
      'Región de Magallanes y de la Antártica Chilena'
    )
  );
