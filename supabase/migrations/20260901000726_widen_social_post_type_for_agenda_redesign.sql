-- Automated Instagram carousel redesign (2026-08-31, Camila's "bitácora"
-- request — see apps/curator/src/social-publish/selection.ts's own doc
-- comment): "no_te_la_pierdas" and "destacada" are retired, replaced by a
-- single "agenda" carousel mixing inauguraciones + visitas guiadas.
--
-- Widening, not replacing, both check constraints: real historical rows
-- with the old 3 values already exist in production and are read by the
-- admin analytics dashboard (apps/web/src/components/admin/
-- InstagramPostsTable.tsx, InstagramTypeComparisonTable.tsx) — those rows
-- must keep rendering correctly. Only new rows going forward use 'agenda'.
alter table social_post_log drop constraint social_post_log_post_type_check;
alter table social_post_log add constraint social_post_log_post_type_check
  check (post_type in ('no_te_la_pierdas', 'destacada', 'agenda'));

alter table instagram_posts drop constraint instagram_posts_post_type_check;
alter table instagram_posts add constraint instagram_posts_post_type_check
  check (post_type in ('inauguracion', 'no_te_la_pierdas', 'destacada', 'agenda'));
