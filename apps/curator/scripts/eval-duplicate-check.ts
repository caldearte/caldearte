// Measures lib/duplicate-check.ts against real cases before it can drop
// anything in production (2026-11-19).
//
// The sample is a local JSON file (gitignored .scratch/, built from
// production with a read-only query): `positive` cases are rows an admin
// removed as a duplicate, paired with the row that was kept — the later
// of the two is the candidate, the earlier one is the expected answer;
// `negative` cases are recent approved rows nobody removed, each checked
// against what was live in its comuna (or from its account) when it
// arrived. Each case is one call with one candidate, the same shape as a
// production group of one.
//
// Run: pnpm --filter @caldearte/curator eval-duplicate-check
//   DEDUP_SAMPLE_FILE   default ../../.scratch/dedup-eval/sample.json
//   DEDUP_RESULTS_FILE  default ../../.scratch/dedup-eval/results.json
// No writes to Supabase. Every run spends real Anthropic credit (cents).
import { readFileSync, writeFileSync } from "node:fs";
import Anthropic from "@anthropic-ai/sdk";
import type { MessagesClient } from "../src/event-discovery/discover.js";
import { checkDuplicates, DUPLICATE_CHECK_MODEL, type DuplicateCheckExisting, type DuplicateCheckEvent } from "../src/lib/duplicate-check.js";
import { estimateCostUsd } from "../src/lib/pricing.js";

interface Row {
  id: string;
  title: string;
  place_name: string | null;
  freeform_location: string | null;
  source_account: string | null;
  run_start_date: string | null;
  run_end_date: string | null;
  opening_datetime: string | null;
  description: string | null;
  removed_reason?: string | null;
}

interface Case {
  kind: "positive" | "negative";
  expected_id: string | null;
  candidate: Row;
  pool: Row[];
}

function toEvent(r: Row): DuplicateCheckEvent {
  return {
    title: r.title,
    placeName: r.place_name,
    location: r.freeform_location,
    sourceAccount: r.source_account,
    runStartDate: r.run_start_date,
    runEndDate: r.run_end_date,
    openingDatetime: r.opening_datetime,
    description: r.description,
  };
}

function toExisting(r: Row): DuplicateCheckExisting {
  return { id: r.id, ...toEvent(r) };
}

async function main(): Promise<void> {
  const sampleFile = process.env.DEDUP_SAMPLE_FILE ?? "../../.scratch/dedup-eval/sample.json";
  const resultsFile = process.env.DEDUP_RESULTS_FILE ?? "../../.scratch/dedup-eval/results.json";
  const all = JSON.parse(readFileSync(sampleFile, "utf8")) as Case[];
  const positives = all.filter((c) => c.kind === "positive" && c.pool.some((p) => p.id === c.expected_id));
  // A kept row is also a recent unremoved row: as a negative it would be
  // "wrong" for finding the very duplicate it was kept over.
  const positiveIds = new Set(all.filter((c) => c.kind === "positive").flatMap((c) => [c.candidate.id, c.expected_id]));
  const negatives = all.filter((c) => c.kind === "negative" && c.pool.length > 0 && !positiveIds.has(c.candidate.id));
  const cases = [...positives, ...negatives];

  const client = new Anthropic() as unknown as MessagesClient;
  let input = 0;
  let output = 0;
  const results: Array<Record<string, unknown>> = [];
  const queue = [...cases];
  async function worker(): Promise<void> {
    for (let next = queue.shift(); next; next = queue.shift()) {
      const c = next;
      const { matches, decisions, usage } = await checkDuplicates(client, [
        { candidates: [{ ref: c.candidate.id, event: toEvent(c.candidate) }], existing: c.pool.map(toExisting) },
      ]);
      input += usage.inputTokens;
      output += usage.outputTokens;
      const match = matches.get(c.candidate.id);
      const got = match?.existingId ?? null;
      const gotRow = got ? c.pool.find((p) => p.id === got) : undefined;
      // Matching a row that was itself removed as a duplicate later is right
      // for a negative (the "legitimate" row really had a twin live) and
      // still drops a positive for the right reason.
      const gotRemovedDuplicate = /duplic/i.test(gotRow?.removed_reason ?? "");
      const ok = c.kind === "positive" ? got !== null : got === null || gotRemovedDuplicate;
      results.push({
        kind: c.kind,
        ok,
        exact: got === c.expected_id,
        got_removed_duplicate: gotRemovedDuplicate,
        candidate: c.candidate.title,
        account: c.candidate.source_account,
        expected: c.expected_id ? c.pool.find((p) => p.id === c.expected_id)?.title : null,
        got: got ? c.pool.find((p) => p.id === got)?.title : null,
        got_id: got,
        reason: decisions[0]?.reason ?? null,
        raw: decisions[0] ? `${decisions[0].existingId ? c.pool.find((p) => p.id === decisions[0].existingId)?.title : "null"} (${decisions[0].confident ? "alta" : "media"})` : "no answer",
        pool: c.pool.length,
      });
    }
  }
  await Promise.all(Array.from({ length: 6 }, worker));

  const tp = results.filter((r) => r.kind === "positive" && r.ok).length;
  const wrongPick = results.filter((r) => r.kind === "positive" && r.ok && !r.exact).length;
  const fp = results.filter((r) => r.kind === "negative" && !r.ok).length;
  const twins = results.filter((r) => r.kind === "negative" && r.got_removed_duplicate).length;
  writeFileSync(resultsFile, JSON.stringify(results, null, 2));
  console.log(`positives: ${tp}/${positives.length} dropped (${wrongPick} via a different row of the same show)`);
  console.log(`negatives: ${fp}/${negatives.length} wrongly flagged (+${twins} matched a row later removed as its duplicate)`);
  console.log(`cost: $${estimateCostUsd(DUPLICATE_CHECK_MODEL, { inputTokens: input, outputTokens: output }).toFixed(4)} (${input} in / ${output} out)`);
  for (const r of results.filter((x) => !x.ok)) {
    console.log(`  ✗ ${r.kind}: "${r.candidate}" [${r.account ?? "-"}] → got "${r.got ?? "null"}" expected "${r.expected ?? "null"}" [raw: ${r.raw}] — ${r.reason ?? ""}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
