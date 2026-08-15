// One-time backfill for the pipeline-attribution columns added by
// supabase/migrations/20260815030000_add_pipeline_attribution.sql —
// classifies historical events/rejected_candidates rows (inserted before
// event-discovery/run.ts started stamping `pipeline` itself) by matching
// their source_url's domain against the hardcoded source lists, and seeds
// out_of_scope_signals (20260815040000_add_out_of_scope_signals.sql) from
// whatever rejected_candidates rows are still alive in its ~90-day window.
//
// NOT a recurring job — run exactly once, by hand, right after both
// migrations and the app-code changes that stamp `pipeline` going forward
// are deployed:
//
//   node --env-file=../../.env --import tsx scripts/backfill-analytics-attribution.ts
//
// Not wired into any package.json script that CI/cron would ever call, and
// does not touch supabase/migrations/ — same "run it yourself, watch the
// output" posture as poc-tavily-discover.ts/query-variant-test.ts.
//
// Does NOT backfill source_account (20260815050000_add_source_account.sql,
// added the same day) — that field only ever existed once
// lib/instagram-item.ts started setting it, so there's no historical value
// to recover for rows inserted before that; those rows' source_account
// stays null, same honest "genuinely unknown" posture as
// classifyByDomain's "unknown_legacy" case below.
import { getSupabaseClient } from "../src/lib/supabase-client.js";
import { KNOWN_SOURCES, knownSourceDomain } from "../src/lib/known-sources.js";
import { classifyOutOfScope } from "../src/lib/out-of-scope-classifier.js";
import type { Pipeline } from "../src/lib/pipeline.js";

// MAVI's own real event detail pages live under uc.cl's central agenda
// (www.uc.cl/agenda/actividad/...), NOT mavi.uc.cl itself — see
// lib/mavi-headless.ts's own MAVI_LISTING_URL/detailUrl construction.
// Distinct from artes.uchile.cl/uchile.cl (both real, separate
// KNOWN_SOURCES entries) — checked, no collision.
const MAVI_DETAIL_DOMAIN = "www.uc.cl";

const KNOWN_SOURCE_DOMAINS = new Set(KNOWN_SOURCES.map((s) => knownSourceDomain(s.url)));

// "unknown_legacy" (not "comuna_search"): historical Google Alerts article
// URLs are genuinely indistinguishable from comuna/Tavily search result
// URLs after the fact — guessing either would silently overstate that
// pipeline's historical share. See the migration's own doc comment.
//
// Real gap caught while testing this script (2026-08-15): an earlier
// version tried to confirm an instagram.com sourceUrl belonged to a
// currently-tracked account by matching the URL's path against
// INSTAGRAM_ACCOUNTS' usernames — but a post's real permalink shape is
// always `instagram.com/p/<shortcode>/`, never
// `instagram.com/<username>/...`, so the username never appears in the
// URL at all and that check could never match anything. Instagram is the
// only instagram.com-hosted pipeline this codebase has ever had, so any
// instagram.com sourceUrl is classified as "instagram" outright, no
// per-account confirmation needed or possible.
function classifyByDomain(sourceUrl: string | null): Pipeline | "unknown_legacy" {
  if (!sourceUrl) return "unknown_legacy";
  let hostname: string;
  try {
    hostname = new URL(sourceUrl).hostname;
  } catch {
    return "unknown_legacy";
  }
  if (hostname === MAVI_DETAIL_DOMAIN) return "headless";
  if (hostname === "www.instagram.com" || hostname === "instagram.com") return "instagram";
  if (KNOWN_SOURCE_DOMAINS.has(hostname)) return "bright_source";
  return "unknown_legacy";
}

async function backfillEvents(): Promise<Record<string, number>> {
  const client = getSupabaseClient();
  const counts: Record<string, number> = {};

  const { data: rows, error } = await client.from("events").select("id, source_url").is("pipeline", null);
  if (error) throw new Error(`Failed to load events with pipeline is null: ${error.message}`);

  for (const row of rows ?? []) {
    const pipeline = classifyByDomain(row.source_url);
    counts[pipeline] = (counts[pipeline] ?? 0) + 1;
    // events.pipeline's own CHECK constraint only allows the 5 real
    // pipeline values (unlike out_of_scope_signals, which also allows
    // 'unknown_legacy') — a genuinely unclassifiable row is left null,
    // which is already valid and meaningful (attribution truly unknown),
    // not written as an invalid enum value.
    if (pipeline === "unknown_legacy") continue;
    const { error: updateError } = await client.from("events").update({ pipeline }).eq("id", row.id);
    if (updateError) {
      console.error(`[backfill] failed to update events.id=${row.id}: ${updateError.message}`);
    }
  }

  return counts;
}

async function backfillRejectedCandidates(): Promise<{ counts: Record<string, number>; classified: Array<{ id: string; sourceUrl: string | null; title: string; reason: string; regionId: string | null; anchorDate: string | null; pipeline: Pipeline | "unknown_legacy" }> }> {
  const client = getSupabaseClient();
  const counts: Record<string, number> = {};
  const classified: Array<{ id: string; sourceUrl: string | null; title: string; reason: string; regionId: string | null; anchorDate: string | null; pipeline: Pipeline | "unknown_legacy" }> = [];

  const { data: rows, error } = await client
    .from("rejected_candidates")
    .select("id, source_url, title, reason, region_id, anchor_date")
    .is("pipeline", null);
  if (error) throw new Error(`Failed to load rejected_candidates with pipeline is null: ${error.message}`);

  for (const row of rows ?? []) {
    const pipeline = classifyByDomain(row.source_url);
    counts[pipeline] = (counts[pipeline] ?? 0) + 1;
    // Same constraint gap as backfillEvents above — only write when it's
    // one of the 5 real pipeline values.
    if (pipeline !== "unknown_legacy") {
      const { error: updateError } = await client.from("rejected_candidates").update({ pipeline }).eq("id", row.id);
      if (updateError) {
        console.error(`[backfill] failed to update rejected_candidates.id=${row.id}: ${updateError.message}`);
      }
    }
    // Still classified for step 3's out_of_scope_signals seeding below —
    // that table's own pipeline enum DOES allow 'unknown_legacy', so an
    // otherwise-unattributable rejection's out-of-scope signal isn't lost.
    classified.push({
      id: row.id,
      sourceUrl: row.source_url,
      title: row.title,
      reason: row.reason,
      regionId: row.region_id,
      anchorDate: row.anchor_date,
      pipeline,
    });
  }

  return { counts, classified };
}

// Step 3 — the one-time chance to recover out-of-scope signal from
// whatever rejected_candidates rows are still alive (only ~90 days'
// worth survive by the time this runs; anything older is already
// pruned). Guarded: refuses to run if out_of_scope_signals already has
// any rows, since re-running this after Phase 3's ongoing capture has
// started would silently double-count and skew the very trend data the
// table exists to produce. Cheap check, no new table/marker needed.
async function seedOutOfScopeSignals(
  classifiedRejections: Array<{ sourceUrl: string | null; title: string; reason: string; regionId: string | null; anchorDate: string | null; pipeline: Pipeline | "unknown_legacy" }>,
): Promise<{ counts: Record<string, number>; skipped: boolean }> {
  const client = getSupabaseClient();

  const { count, error: countError } = await client.from("out_of_scope_signals").select("id", { count: "exact", head: true });
  if (countError) throw new Error(`Failed to count out_of_scope_signals: ${countError.message}`);
  if ((count ?? 0) > 0) {
    console.log(`[backfill] out_of_scope_signals already has ${count} row(s) — refusing to seed again. Run this script's step 3 only ONCE, immediately after Phase 3 deploys and before its first scheduled pipeline run.`);
    return { counts: {}, skipped: true };
  }

  const counts: Record<string, number> = {};
  for (const rejection of classifiedRejections) {
    const category = classifyOutOfScope(rejection.reason);
    if (!category) continue;
    counts[category] = (counts[category] ?? 0) + 1;
    const { error } = await client.from("out_of_scope_signals").insert({
      pipeline: rejection.pipeline,
      category,
      source_url: rejection.sourceUrl,
      title: rejection.title,
      reason: rejection.reason,
      region_id: rejection.regionId,
      anchor_date: rejection.anchorDate,
    });
    if (error) {
      console.error(`[backfill] failed to seed out_of_scope_signals for "${rejection.title}": ${error.message}`);
    }
  }

  return { counts, skipped: false };
}

async function main() {
  console.log("[backfill] step 1: classifying historical events...");
  const eventCounts = await backfillEvents();
  console.log("[backfill] events by pipeline:", eventCounts);

  console.log("[backfill] step 2: classifying historical rejected_candidates...");
  const { counts: rejectedCounts, classified } = await backfillRejectedCandidates();
  console.log("[backfill] rejected_candidates by pipeline:", rejectedCounts);

  console.log("[backfill] step 3: seeding out_of_scope_signals from surviving rejected_candidates...");
  const { counts: signalCounts, skipped } = await seedOutOfScopeSignals(classified);
  if (!skipped) {
    console.log("[backfill] out_of_scope_signals seeded by category:", signalCounts);
  }

  console.log("[backfill] done.");
}

main().catch((err) => {
  console.error("[backfill] fatal error:", err);
  process.exitCode = 1;
});
