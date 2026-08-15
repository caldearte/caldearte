// Admin analytics dashboard — read-only, same trust boundary as
// admin-remove-event/admin-toggle-sensitive (see those files' own
// comments): reached only from apps/web's /admin server component, which
// verifies the caller's real Auth.js Google session + ADMIN_EMAIL match
// BEFORE ever calling here, then calls this function directly (no
// intermediate api/admin/* route needed — a server component has no
// browser boundary to cross, so the shared x-admin-secret never reaches
// the client). MUST be deployed with --no-verify-jwt, same posture as
// every other admin Edge Function in this repo — the one time this was
// forgotten (2026-08-15), every request 401'd at Supabase's own gateway
// before ever reaching this file's own secret check.
//
// Ships lightweight ROW-LEVEL data (not pre-aggregated by week/month/
// year) so apps/web's single granularity toggle can bucket every chart
// client-side (see apps/web/src/lib/adminAnalyticsBucketing.ts) without
// this function maintaining a separate query per granularity. A few
// hundred rows at this project's real size — trivial to ship whole.
import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ADMIN_ACTIONS_SECRET = Deno.env.get("ADMIN_ACTIONS_SECRET")!;

const PIPELINES = ["comuna_search", "bright_source", "instagram", "google_alerts", "headless"] as const;

function jsonResponse(body: unknown, httpStatus = 200): Response {
  return new Response(JSON.stringify(body), { status: httpStatus, headers: { "content-type": "application/json" } });
}

Deno.serve(async (req) => {
  if (req.headers.get("x-admin-secret") !== ADMIN_ACTIONS_SECRET) {
    return jsonResponse({ error: "unauthorized" }, 401);
  }

  const client = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  // Región name map: `regions` rows are individual comunas (346 of
  // them), NOT the real Chilean región — admin_region_name is (see
  // apps/web/src/lib/regionNames.ts). Fetched once, small (346 rows),
  // turned into an id -> admin_region_name lookup for every join below.
  const { data: regionRows, error: regionsError } = await client
    .from("regions")
    .select("id, admin_region_name");
  if (regionsError) {
    console.error("admin-analytics: regions query failed", regionsError);
    return jsonResponse({ error: "query_failed" }, 500);
  }
  const adminRegionNameById = new Map<string, string | null>();
  for (const row of regionRows ?? []) {
    adminRegionNameById.set(row.id, row.admin_region_name);
  }

  // ---- events (all-time, approved, not soft-removed) -----------------
  const [eventsRes, signalsRes, rejectedRes, usageRes, fetchStateRes] = await Promise.all([
    client
      .from("events")
      .select("opening_datetime, run_start_date, run_end_date, region_id, pipeline")
      .eq("curation_status", "approved")
      .is("removed_at", null),
    client.from("out_of_scope_signals").select("created_at, category, pipeline, region_id"),
    client.from("rejected_candidates").select("pipeline, source_url, source_account"),
    client.from("api_usage_log").select("pipeline, estimated_cost_usd"),
    client.from("bright_source_fetch_state").select("url, last_fetched_at, interval_days"),
  ]);
  for (const [label, res] of [
    ["events", eventsRes],
    ["out_of_scope_signals", signalsRes],
    ["rejected_candidates", rejectedRes],
    ["api_usage_log", usageRes],
    ["bright_source_fetch_state", fetchStateRes],
  ] as const) {
    if (res.error) {
      console.error(`admin-analytics: ${label} query failed`, res.error);
      return jsonResponse({ error: "query_failed" }, 500);
    }
  }

  const events = (eventsRes.data ?? []).map((row) => ({
    openingDate: row.opening_datetime ? String(row.opening_datetime).slice(0, 10) : null,
    runStart: row.run_start_date,
    runEnd: row.run_end_date,
    adminRegionName: row.region_id ? adminRegionNameById.get(row.region_id) ?? null : null,
    pipeline: row.pipeline,
  }));

  const outOfScopeSignals = (signalsRes.data ?? []).map((row) => ({
    createdAt: row.created_at,
    category: row.category,
    pipeline: row.pipeline,
    adminRegionName: row.region_id ? adminRegionNameById.get(row.region_id) ?? null : null,
  }));

  // ---- pipeline comparison table (all-time) ---------------------------
  const acceptedByPipeline = new Map<string, number>();
  for (const row of events) {
    if (!row.pipeline) continue;
    acceptedByPipeline.set(row.pipeline, (acceptedByPipeline.get(row.pipeline) ?? 0) + 1);
  }
  const rejectedByPipeline = new Map<string, number>();
  for (const row of rejectedRes.data ?? []) {
    if (!row.pipeline) continue;
    rejectedByPipeline.set(row.pipeline, (rejectedByPipeline.get(row.pipeline) ?? 0) + 1);
  }
  const costByPipeline = new Map<string, number>();
  for (const row of usageRes.data ?? []) {
    if (!row.pipeline) continue;
    costByPipeline.set(row.pipeline, (costByPipeline.get(row.pipeline) ?? 0) + Number(row.estimated_cost_usd ?? 0));
  }
  const pipelineComparison = PIPELINES.map((pipeline) => {
    const accepted = acceptedByPipeline.get(pipeline) ?? 0;
    const rejected = rejectedByPipeline.get(pipeline) ?? 0;
    const cost = costByPipeline.get(pipeline) ?? 0;
    return {
      pipeline,
      accepted,
      rejected,
      // Approximation, not 1:1 — a single Claude call typically curates
      // several candidates at once. See usage-tracking.ts's own doc
      // comment; surfaced to the UI as an approximation.
      avgCostUsdPerEvent: accepted > 0 ? cost / accepted : null,
      totalCostUsd: cost,
      approvalRate: accepted + rejected > 0 ? accepted / (accepted + rejected) : null,
    };
  });

  // ---- per-source tables (bright sources / Instagram accounts) -------
  // Same yield-matching logic the old single dead-source-alert list used
  // (see git history), generalized into two full ranked lists instead of
  // one filtered-down list, and no longer windowed — all-time.
  //
  // Two DIFFERENT yield signals, matched by pipeline shape:
  // - Instagram: bright_source_fetch_state.url is the account's own
  //   PROFILE url (instagram.com/<username>/) — unlike a post's own
  //   permalink, the username IS recoverable from this url. Matched
  //   against source_account.
  // - Everything else (web bright sources, one distinct domain each):
  //   matched by hostname.
  const acceptedAccounts = new Map<string, number>();
  const rejectedAccounts = new Map<string, number>();
  const acceptedDomains = new Map<string, number>();
  const rejectedDomains = new Map<string, number>();

  function hostnameOf(url: string | null): string | null {
    if (!url) return null;
    try {
      return new URL(url).hostname;
    } catch {
      return null;
    }
  }

  // events/rejected_candidates were already fetched above with a
  // minimal select (kept lean for the payload's `events` array) — fetch
  // source_url/source_account separately here rather than widening that.
  const [eventsSourceRes, rejectedSourceRes] = await Promise.all([
    client.from("events").select("source_url, source_account").eq("curation_status", "approved").is("removed_at", null),
    client.from("rejected_candidates").select("source_url, source_account"),
  ]);
  if (eventsSourceRes.error || rejectedSourceRes.error) {
    console.error("admin-analytics: source attribution query failed", eventsSourceRes.error ?? rejectedSourceRes.error);
    return jsonResponse({ error: "query_failed" }, 500);
  }
  for (const row of eventsSourceRes.data ?? []) {
    if (row.source_account) acceptedAccounts.set(row.source_account, (acceptedAccounts.get(row.source_account) ?? 0) + 1);
    const hostname = hostnameOf(row.source_url);
    if (hostname) acceptedDomains.set(hostname, (acceptedDomains.get(hostname) ?? 0) + 1);
  }
  for (const row of rejectedSourceRes.data ?? []) {
    if (row.source_account) rejectedAccounts.set(row.source_account, (rejectedAccounts.get(row.source_account) ?? 0) + 1);
    const hostname = hostnameOf(row.source_url);
    if (hostname) rejectedDomains.set(hostname, (rejectedDomains.get(hostname) ?? 0) + 1);
  }

  const brightSources: Array<{
    url: string;
    lastFetchedAt: string | null;
    intervalDays: number | null;
    accepted: number;
    rejected: number;
    possiblyDead: boolean;
  }> = [];
  const instagramSources: Array<{
    username: string;
    lastFetchedAt: string | null;
    intervalDays: number | null;
    accepted: number;
    rejected: number;
    possiblyDead: boolean;
  }> = [];

  for (const row of fetchStateRes.data ?? []) {
    let hostname: string | null = null;
    let instagramUsername: string | null = null;
    try {
      const parsed = new URL(row.url);
      hostname = parsed.hostname;
      if (hostname === "www.instagram.com" || hostname === "instagram.com") {
        instagramUsername = parsed.pathname.split("/").filter(Boolean)[0] ?? null;
      }
    } catch {
      hostname = null;
    }

    // Possibly-dead threshold: a plain first-pass heuristic, not tuned
    // against real data yet (see docs' own "measure before building
    // infra" note). Flagged when EITHER its adaptive cadence has climbed
    // to Instagram's 28-day cap, OR it's been fetched at all but nothing
    // — accepted OR rejected — has ever been attributed to it.
    const atAdaptiveCap = (row.interval_days ?? 0) >= 28;

    if (instagramUsername) {
      const accepted = acceptedAccounts.get(instagramUsername) ?? 0;
      const rejected = rejectedAccounts.get(instagramUsername) ?? 0;
      const hasYield = accepted > 0 || rejected > 0;
      instagramSources.push({
        username: instagramUsername,
        lastFetchedAt: row.last_fetched_at,
        intervalDays: row.interval_days,
        accepted,
        rejected,
        possiblyDead: !hasYield && (atAdaptiveCap || row.last_fetched_at !== null),
      });
    } else if (hostname) {
      const accepted = acceptedDomains.get(hostname) ?? 0;
      const rejected = rejectedDomains.get(hostname) ?? 0;
      const hasYield = accepted > 0 || rejected > 0;
      brightSources.push({
        url: row.url,
        lastFetchedAt: row.last_fetched_at,
        intervalDays: row.interval_days,
        accepted,
        rejected,
        possiblyDead: !hasYield && (atAdaptiveCap || row.last_fetched_at !== null),
      });
    }
  }

  // Best-performing first, possibly-dead trailing at the bottom.
  const bySourceRank = (a: { possiblyDead: boolean; accepted: number }, b: { possiblyDead: boolean; accepted: number }) => {
    if (a.possiblyDead !== b.possiblyDead) return a.possiblyDead ? 1 : -1;
    return b.accepted - a.accepted;
  };
  brightSources.sort(bySourceRank);
  instagramSources.sort(bySourceRank);

  return jsonResponse({
    generatedAt: new Date().toISOString(),
    events,
    outOfScopeSignals,
    pipelineComparison,
    brightSources,
    instagramSources,
  });
});
