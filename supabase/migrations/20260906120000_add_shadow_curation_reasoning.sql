-- Add reasoning capture to shadow_curation_comparisons (Daniel, 2026-09-06):
-- the pilot's first real run (Sun 2026-09-06) surfaced 2 disagreements out
-- of 11 sources, and there was no way to actually evaluate WHY the shadow
-- model diverged — only its status/tags, never its curationReasoning text.
-- Storing both sides' reasoning (not just the shadow's) lets a future
-- review compare them side by side instead of re-deriving Haiku's from
-- memory or the `events` table (which only has it for approved,
-- non-deduped candidates — rejected/empty cases leave no trace at all, as
-- happened with chilecultura.gob.cl this run). Nullable/empty-string safe:
-- a candidate list can be empty (real_status/shadow_status 'empty') or the
-- shadow call can error out entirely, in which case there's nothing to
-- join.
alter table shadow_curation_comparisons
  add column real_reasoning text not null default '',
  add column shadow_reasoning text not null default '';
