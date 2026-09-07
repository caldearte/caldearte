-- Replaces the cross-source curation ESCALATION flow (added
-- 20260730150000) with a deterministic axis safety net in code. See
-- docs/curation-policy.md's "Cross-source axis safety net" section.
--
-- Schema-wise this migration is ADDITIVE ONLY: it adds one nullable
-- column and drops nothing. The `curation_escalations` table stays,
-- orphaned on purpose — see the note at the bottom.
--
-- Why: in the 5 weeks it was live (2026-08-01 to 2026-09-06) the flow
-- fired 15 times and not one escalation was ever resolved — the de-facto
-- behaviour was always "keep the existing decision". Reviewing all 15
-- showed that was the right outcome almost every time, because 14 of them
-- were not editorial disagreements at all: they were the same event
-- described with different metadata completeness in two sources, where a
-- CODE filter (date completeness, grounding, location whitelist) had
-- forced one side to `rejected` while Haiku judged both in scope. Only 1
-- ("Existen otros mundos, pero están en este") was a genuine axis
-- disagreement, and there the default was right only by luck of crawl
-- order. The safety net now enforces that case deterministically — if
-- either side rejected on one of the five axes, the event stays out —
-- with no human step and no holding.

-- Which of the 5 exclusion axes drove a rejection, when one did. Reported
-- by Haiku itself (see packages/curation-policy's REJECTION_AXIS_POLICY)
-- rather than parsed out of the free-text `reason`: as of 2026-09-06,
-- about a fifth of the rejection reasons that mention an axis word do so
-- only to RULE IT OUT ("Temática ecológica sin contenido religioso,
-- violento o pseudocientífico"), so any regex over that prose would
-- wrongly exclude real events.
--
-- Nullable with no default and no backfill: existing rows read as null,
-- which the safety net treats as "no axis" and therefore takes no action
-- on — the same plain "keep the existing decision" behaviour that has
-- been in effect all along. Those rows age out via the existing 90-day
-- prune, so the gap closes on its own.
alter table rejected_candidates
  add column rejection_axis text null
    check (rejection_axis is null or rejection_axis in
      ('religion', 'guerra_violencia', 'ultraderecha', 'pseudociencia', 'agresion_explicita'));

-- The `curation_escalations` table itself is deliberately LEFT IN PLACE,
-- orphaned: no code reads or writes it any more (the Edge Function,
-- the email builders and the insert are all removed in this same change),
-- but its 15 rows stay as the historical record of what the escalation
-- flow actually produced. Daniel's call, 2026-09-07 — the rows are the
-- evidence behind the decision to remove the flow, and keeping them costs
-- nothing at this scale.
--
-- Note this differs from how the retired `venues` table was handled (see
-- docs/roadmap.md), which was dropped from code AND schema. The
-- difference is that `venues` was empty of anything worth keeping,
-- whereas these rows are a record of real curation conflicts.
--
-- RLS on the table is service-role-only and unchanged, so an orphaned
-- table is inert rather than a surface. If it's ever dropped, that should
-- be its own migration, reviewed on its own terms.
