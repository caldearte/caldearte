import { getSupabaseClient } from "./supabase-client.js";
import type { CandidateOutcome, EventGroup } from "./notify.js";

export type DiscoveryEntrypoint = "event_discovery" | "headless" | "instagram" | "google_alerts";

interface RunSummaryCandidatesLike {
  total: number;
  approvedByCuration: number;
  rejectedByCuration: number;
}

interface RunSummaryCostLike {
  totalUsd: number;
}

// Real gap found 2026-08-17, auditing a week of rejections: the only way
// to see per-run "cobertura" — how many candidates got each real outcome
// (inserted/replaced/duplicate_skipped/escalated/expired/insert_failed,
// not just Haiku's approved/rejected verdict) — was digging through
// ephemeral GitHub Actions logs by hand. Every entrypoint already builds
// this exact data every run (notify.ts's RunSummary and friends), it
// just fed a summary email whose Resend half was never wired up. This
// persists a compact projection of the same object regardless of
// whether the email actually sends — best-effort, same defensive
// posture as every other ancillary write in this codebase (a failure
// here must never break the actual discovery run).
export async function recordRunSummary(
  entrypoint: DiscoveryEntrypoint,
  startedAt: Date,
  candidates: RunSummaryCandidatesLike,
  eventGroups: EventGroup[],
  cost: RunSummaryCostLike,
  // Free-form extra fields folded into raw_summary alongside the usual
  // ones — today just instagram-discovery/run.ts's apifyError (real gap
  // found 2026-08-30: an Apify-side failure like the monthly usage limit
  // was silently indistinguishable from a genuinely quiet run everywhere
  // downstream, including the daily digest).
  extra?: Record<string, unknown>,
): Promise<void> {
  const outcomeCounts: Record<CandidateOutcome, number> = {
    inserted: 0,
    replaced: 0,
    duplicate_skipped: 0,
    escalated: 0,
    expired: 0,
    insert_failed: 0,
  };
  for (const group of eventGroups) {
    for (const candidate of group.candidates) {
      if (candidate.outcome) outcomeCounts[candidate.outcome] += 1;
    }
  }

  const client = getSupabaseClient();
  const { error } = await client.from("discovery_run_summaries").insert({
    entrypoint,
    started_at: startedAt.toISOString(),
    candidates_total: candidates.total,
    approved_by_curation: candidates.approvedByCuration,
    rejected_by_curation: candidates.rejectedByCuration,
    inserted_count: outcomeCounts.inserted,
    replaced_count: outcomeCounts.replaced,
    duplicate_skipped_count: outcomeCounts.duplicate_skipped,
    escalated_count: outcomeCounts.escalated,
    expired_count: outcomeCounts.expired,
    insert_failed_count: outcomeCounts.insert_failed,
    cost_usd: cost.totalUsd,
    raw_summary: { startedAt: startedAt.toISOString(), candidates, eventGroups, cost, ...extra },
  });
  if (error) {
    console.error(`[run-summary-store] failed to record run summary for "${entrypoint}": ${error.message}`);
  }
}
