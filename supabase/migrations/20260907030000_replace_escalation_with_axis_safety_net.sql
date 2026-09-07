-- Replaces the cross-source curation ESCALATION flow (added
-- 20260730150000) with a deterministic axis safety net in code. See
-- docs/curation-policy.md's "Cross-source axis safety net" section.
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

-- The escalation table itself. All 15 rows are unresolved (resolved_at is
-- null on every one), so nothing is being discarded except the record
-- that the conflicts occurred — which is summarized, with the full
-- breakdown and the reasoning for this change, in
-- docs/curation-policy.md.
--
-- Dropped rather than left orphaned, matching how the retired `venues`
-- table was handled (see docs/roadmap.md): removed from code and schema,
-- not merely deprecated.
drop table if exists curation_escalations;
