-- Cross-source curation conflict escalation. Found via a real 2026-07-30
-- manual audit: the same real exhibition ("Existen otros mundos, pero
-- están en este") was simultaneously approved (one source's vague
-- description) and correctly rejected under the Religion axis (a
-- different source's more detailed one) — Haiku applied the axis
-- correctly whenever it saw the disqualifying text, but nothing in the
-- pipeline ever compares a new candidate against an EXISTING decision on
-- what's likely the same real event from a different source_url. This
-- migration adds the schema for that comparison and for holding a
-- detected conflict until a human (the site owner) picks a side via a
-- one-time-token email link.

-- rejected_candidates never carried a location/date signal before now —
-- deliberately, to avoid reopening the null-location crash class from
-- 2026-07-22 (see that table's own migration comment). These are added
-- the same defensive way: nullable, best-effort, only populated when the
-- candidate actually has them. Needed here specifically so a rejected
-- candidate can be matched by region + anchor date against a later
-- approved event describing the same real thing (or vice versa).
alter table rejected_candidates
  add column location text null,
  add column region_id uuid null references regions(id),
  add column anchor_date date null;

-- One row per detected conflict. Denormalized (both sides' title/source/
-- reasoning are snapshotted as plain text) so the email content and the
-- eventual accept/reject decision never depend on the referenced
-- events/rejected_candidates row still existing or being unchanged by
-- the time a human clicks a link, possibly days later.
create table curation_escalations (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  resolved_at timestamptz null,
  resolution text null check (resolution in ('accepted', 'rejected')),

  -- The side that already existed before this run made its decision.
  existing_kind text not null check (existing_kind in ('approved_event', 'rejected_candidate')),
  existing_event_id uuid null references events(id),
  existing_rejected_id uuid null references rejected_candidates(id),
  existing_title text not null,
  existing_source_url text not null,
  existing_reasoning text not null,

  -- The new candidate this run just curated, whose decision conflicts
  -- with the existing one above.
  new_title text not null,
  new_source_url text not null,
  new_status text not null check (new_status in ('approved', 'rejected')),
  new_reasoning text not null,
  -- Full insertable field set for the new candidate — used only if the
  -- resolution is "accepted" and new_status is "approved" (the Edge
  -- Function inserts this payload into `events` as-is). JSONB rather
  -- than a wide column set: this row's whole purpose is to survive until
  -- a human acts on it, not to be queried/filtered on by these fields.
  new_candidate_payload jsonb not null,

  -- Opaque random tokens (not signed/HMAC — looked up by exact value,
  -- same trust model as everything else that already lives behind
  -- service_role-only RLS in this schema), one per action so a stale or
  -- reused link can't apply the other action and can't be replayed after
  -- resolution (see the Edge Function, which requires resolved_at is null).
  accept_token text not null unique,
  reject_token text not null unique
);

-- Partial index: the Edge Function's own lookup is always
-- "unresolved rows matching this token", and the run's own logging/dedup
-- only ever cares about unresolved rows too — resolved rows are just an
-- audit trail from here on.
create index curation_escalations_unresolved_idx on curation_escalations (created_at) where resolved_at is null;

-- Same posture as rejected_candidates/raw_search_results/detected_sources/
-- system_config/api_usage_log: RLS on, no public policy, explicit
-- service_role grant (PostgREST's service_role gets no implicit access —
-- see docs/data-model.md). The Edge Function that resolves these rows
-- runs with the service_role key, never the anon key.
alter table curation_escalations enable row level security;
grant all on curation_escalations to service_role;
