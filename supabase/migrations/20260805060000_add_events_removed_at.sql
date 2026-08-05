-- Admin "Quitar" feature (apps/web's kebab-menu remove action, gated
-- behind Auth.js + ADMIN_EMAIL, see apps/web/src/lib/auth.ts): a soft
-- delete, deliberately separate from `curation_status`. curation_status
-- is pipeline-owned (approved/rejected/pending_review), written once by
-- Event Discovery's curation pass and read by prune_expired_events'
-- retention logic — a manual admin removal must never write to it, to
-- avoid confusing that pipeline-owned lifecycle with a human override
-- made outside of it. removed_at is null for every existing row; nothing
-- is removed until an admin explicitly clicks "Quitar".

alter table events
  add column removed_at timestamptz,
  add column removed_reason text;
