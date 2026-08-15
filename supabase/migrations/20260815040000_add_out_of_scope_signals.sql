-- Accumulates real signal on rejections that are out-of-scope BY EVENT
-- TYPE (convocatorias, talleres, charlas, conciertos, ferias, etc.) —
-- deliberately NOT a reuse of rejected_candidates (90-day rolling prune,
-- built for a cost-dedup purpose, not analytics — see that table's own
-- migration comment) and NOT pruned: the whole point is accumulating
-- months of evidence for a future, deliberate decision on whether to
-- expand scope (see docs' "Expand to convocatorias/talleres, future"
-- note), not a guess. Deliberately NOT unique on source_url (unlike
-- rejected_candidates) — the same recurring source posting the same kind
-- of out-of-scope content repeatedly over months is itself part of the
-- signal, not noise to collapse away.
--
-- Populated by a deterministic keyword/pattern classifier
-- (apps/curator/src/lib/out-of-scope-classifier.ts) run over Haiku's
-- existing curationReasoning text, NOT a new Haiku-emitted structured
-- field — see that file's own doc comment for why (recall/precision
-- tradeoff, "measure before building infra"). A rejection only lands
-- here when the classifier positively recognizes an out-of-scope-by-type
-- signature; ordinary in-scope rejections (missing date info, duplicate,
-- already expired, ungrounded) are deliberately NOT recorded — recall is
-- intentionally partial, precision is prioritized, since this table's
-- entire value is being trustworthy evidence, not an exhaustive census.
create table out_of_scope_signals (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  pipeline text not null
    check (pipeline in ('comuna_search', 'bright_source', 'instagram', 'google_alerts', 'headless', 'unknown_legacy')),
  category text not null
    check (category in ('convocatoria', 'taller_o_charla', 'otro_evento_no_arte_visual')),
  source_url text,
  title text not null,
  reason text not null,
  region_id uuid references regions (id) on delete set null,
  anchor_date date
);

create index out_of_scope_signals_created_at_idx on out_of_scope_signals (created_at);
create index out_of_scope_signals_category_idx on out_of_scope_signals (category);
create index out_of_scope_signals_pipeline_idx on out_of_scope_signals (pipeline);

-- Internal bookkeeping, same posture as rejected_candidates/api_usage_log:
-- RLS on, no public policy, explicit service_role grant.
alter table out_of_scope_signals enable row level security;
grant all on out_of_scope_signals to service_role;
