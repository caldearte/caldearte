-- Shadow-mode model comparison pilot (Daniel, 2026-09-04): a free
-- OpenRouter model (default minimax/minimax-m3:free, see
-- apps/curator/src/lib/model-comparison.ts) runs in parallel with the
-- real Haiku curation call on the exact same input, purely to measure how
-- often it would agree — Haiku's own result is the only one that ever
-- gets inserted into `events`. Previously only logged to GitHub Actions
-- console output (console.log, tagged [event-discovery][shadow-mode]),
-- which isn't queryable from the admin panel — this table is that same
-- data, persisted so /admin can show aggregate metrics instead of someone
-- reading raw workflow logs by hand. Pilot-phase table: if the experiment
-- concludes the shadow model isn't worth adopting, this table (and the
-- code that writes to it) can simply be dropped.
create table shadow_curation_comparisons (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  -- Which real pipeline this comparison ran alongside — matches the
  -- `pipeline` values already used in api_usage_log/discovery_run_summaries
  -- for the two paths currently wired (see model-comparison.ts).
  pipeline text not null
    check (pipeline in ('bright_source', 'instagram')),
  -- Human-readable label for the specific source/batch this comparison
  -- covers (a bright source's URL, or a fixed instagram-batch label) —
  -- free text, not a foreign key, since a shadow comparison intentionally
  -- has no other relationship to the rest of the schema.
  label text not null,
  -- The OpenRouter model id compared against Haiku this run (configurable
  -- via SHADOW_MODEL_ID) — kept per-row rather than assumed constant, so
  -- switching models mid-pilot doesn't corrupt historical comparisons.
  model text not null,
  real_status text not null
    check (real_status in ('approved', 'rejected', 'empty')),
  shadow_status text not null
    check (shadow_status in ('approved', 'rejected', 'empty', 'error')),
  agree boolean not null,
  real_tags text[] not null default '{}',
  shadow_tags text[] not null default '{}',
  -- Populated only when the shadow call itself failed (rate limit,
  -- malformed JSON, network error) — shadow_status is 'error' in that
  -- case. Failure is itself a real pilot signal (reliability of the free
  -- model), not something to discard.
  error text
);

create index shadow_curation_comparisons_created_at_idx on shadow_curation_comparisons (created_at);
create index shadow_curation_comparisons_pipeline_idx on shadow_curation_comparisons (pipeline);

-- Internal bookkeeping, same posture as discovery_run_summaries/
-- rejected_candidates/api_usage_log: RLS on, no public policy, explicit
-- service_role grant.
alter table shadow_curation_comparisons enable row level security;
grant all on shadow_curation_comparisons to service_role;
