import { test } from "node:test";
import assert from "node:assert/strict";
import type { CandidateSummary, EventGroup } from "./notify.js";

// Integration test against local Supabase — same posture as
// event-discovery/run.test.ts. Run `supabase start`, then export
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY before running this suite.
const hasLocalSupabase = Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);

function candidate(outcome: CandidateSummary["outcome"]): CandidateSummary {
  return {
    title: "__test__",
    status: "approved",
    location: "Santiago",
    placeName: null,
    runStartDate: null,
    runEndDate: null,
    curationReasoning: "ok",
    sourceUrl: "https://x.cl/__test__/run-summary-store",
    outcome,
  };
}

test(
  "recordRunSummary: persists candidates/cost totals and the real per-candidate outcome funnel, not just approved/rejected",
  { skip: !hasLocalSupabase && "SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY not set" },
  async () => {
    const { recordRunSummary } = await import("./run-summary-store.js");
    const { getSupabaseClient } = await import("./supabase-client.js");
    const client = getSupabaseClient();

    const startedAt = new Date(2026, 7, 17, 6, 30);
    const eventGroups: EventGroup[] = [
      {
        label: "https://x.cl/__test__/agenda",
        candidates: [candidate("inserted"), candidate("expired"), candidate("expired"), candidate("duplicate_skipped")],
      },
    ];

    await recordRunSummary(
      "event_discovery",
      startedAt,
      { total: 4, approvedByCuration: 4, rejectedByCuration: 0 },
      eventGroups,
      { totalUsd: 1.23 },
    );

    const { data } = await client
      .from("discovery_run_summaries")
      .select("*")
      .eq("entrypoint", "event_discovery")
      .eq("started_at", startedAt.toISOString())
      .order("created_at", { ascending: false })
      .limit(1);

    assert.equal(data?.length, 1);
    const row = data![0];
    assert.equal(row.candidates_total, 4);
    assert.equal(row.approved_by_curation, 4);
    assert.equal(row.inserted_count, 1);
    assert.equal(row.expired_count, 2, "real outcome funnel, not just approved/rejected — 2 approved candidates still expired before insertion");
    assert.equal(row.duplicate_skipped_count, 1);
    assert.equal(row.replaced_count, 0);
    assert.equal(Number(row.cost_usd), 1.23);
    assert.ok(row.raw_summary, "full original summary kept for anything not promoted to its own column yet");

    await client.from("discovery_run_summaries").delete().eq("started_at", startedAt.toISOString());
  },
);
