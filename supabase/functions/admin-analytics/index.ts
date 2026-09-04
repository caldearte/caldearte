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
  const [eventsRes, signalsRes, rejectedRes, usageRes, fetchStateRes, costSnapshotsRes, pendingEscalationsRes, runSummariesRes, instagramPostsRes, instagramSnapshotsRes, shadowComparisonsRes] = await Promise.all([
    client
      .from("events")
      .select("opening_datetime, run_start_date, run_end_date, region_id, pipeline, event_type")
      .eq("curation_status", "approved")
      .is("removed_at", null),
    client.from("out_of_scope_signals").select("created_at, category, pipeline, region_id"),
    client.from("rejected_candidates").select("pipeline, source_url, source_account"),
    client.from("api_usage_log").select("pipeline, estimated_cost_usd, created_at"),
    client.from("bright_source_fetch_state").select("url, last_fetched_at, interval_days, consecutive_zero_yield_at_cap, is_inactive"),
    client.from("platform_cost_snapshots").select("platform, usage_date, amount_usd"),
    // The email half of the escalation flow (accept/reject tokens) was
    // never wired up (docs/region-discovery.md) — these rows have
    // real cross-source conflicts sitting unreviewed with zero visibility
    // anywhere until now (real gap found 2026-08-17: 7 pending rows found
    // only by querying the table directly during an audit). A bare count
    // is enough for now — no UI to act on them yet, just make it visible
    // that they exist.
    client.from("curation_escalations").select("id", { count: "exact", head: true }).is("resolved_at", null),
    // Real "cobertura" gap found 2026-08-17: the only way to see per-run
    // stats (candidates curated, real outcome funnel — inserted/
    // replaced/duplicate_skipped/escalated/expired/insert_failed, cost)
    // was digging through ephemeral GitHub Actions logs by hand. Every
    // curator entrypoint already computes this every run (notify.ts's
    // RunSummary and friends) — apps/curator/src/lib/run-summary-store.ts
    // now persists it regardless of whether the (never-wired) summary
    // email sends. Last 90 days, most recent first — small table, no
    // pruning needed yet.
    client
      .from("discovery_run_summaries")
      .select(
        "entrypoint, started_at, candidates_total, approved_by_curation, rejected_by_curation, inserted_count, replaced_count, duplicate_skipped_count, escalated_count, expired_count, insert_failed_count, cost_usd",
      )
      .gte("started_at", new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString())
      .order("started_at", { ascending: false }),
    // Instagram engagement (docs/roadmap.md, Fase 4 — added 2026-08-24 to
    // answer a real question: is the deliberate Monday "inauguraciones"
    // repeat worth it, or too soon after Sunday's own post? Row-level,
    // same posture as everything else here — client buckets by
    // granularity. 120 days covers a full quarter of history at this
    // project's real post volume (a handful/week), trivial to ship whole.
    client
      .from("instagram_posts")
      .select("media_id, post_type, week_start, published_at, reach, saved, like_count, comments_count")
      .gte("published_at", new Date(Date.now() - 120 * 24 * 60 * 60 * 1000).toISOString())
      .order("published_at", { ascending: false }),
    client
      .from("instagram_account_snapshots")
      .select("snapshot_date, followers_count, media_count")
      .gte("snapshot_date", new Date(Date.now() - 120 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10))
      .order("snapshot_date", { ascending: false }),
    // Shadow-mode model comparison pilot (Daniel, 2026-09-04) — row-level,
    // last 90 days, same "ship it whole, bucket client-side" posture as
    // everything else here (real volume is a handful of comparisons per
    // cron run, nowhere near enough to need pre-aggregation).
    client
      .from("shadow_curation_comparisons")
      .select("created_at, pipeline, label, model, real_status, shadow_status, agree, real_tags, shadow_tags, error")
      .gte("created_at", new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString())
      .order("created_at", { ascending: false }),
  ]);
  for (const [label, res] of [
    ["events", eventsRes],
    ["out_of_scope_signals", signalsRes],
    ["rejected_candidates", rejectedRes],
    ["api_usage_log", usageRes],
    ["bright_source_fetch_state", fetchStateRes],
    ["platform_cost_snapshots", costSnapshotsRes],
    ["curation_escalations", pendingEscalationsRes],
    ["discovery_run_summaries", runSummariesRes],
    ["instagram_posts", instagramPostsRes],
    ["instagram_account_snapshots", instagramSnapshotsRes],
    ["shadow_curation_comparisons", shadowComparisonsRes],
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
    eventType: row.event_type,
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
    // Which of the 3 non-Instagram bright-source pipelines this row
    // belongs to — added 2026-08-23 for /admin/cadencia (Daniel wanted
    // ALL bright sources there, not just Instagram, identified by
    // category). All 3 share this same table (bright_source_fetch_state
    // has no pipeline column of its own), so the category has to be
    // derived from the row's own `url`: Google Alerts is tracked under a
    // synthetic "google-alerts://..." key (never a real URL, see
    // google-alerts-discovery/run.ts's GOOGLE_ALERTS_SOURCE_KEY), MAVI
    // (headless) always uses its one fixed listing URL, and everything
    // else here is a plain KNOWN_SOURCES web fetch.
    category: "bright_source" | "headless" | "google_alerts";
  }> = [];
  const MAVI_LISTING_URL = "https://mavi.uc.cl/exposiciones-actuales/";
  const instagramSources: Array<{
    username: string;
    lastFetchedAt: string | null;
    intervalDays: number | null;
    accepted: number;
    rejected: number;
    possiblyDead: boolean;
    // Real cadence state (not the possiblyDead heuristic) — added
    // 2026-08-23 for /admin/cadencia. consecutiveZeroYieldAtCap only
    // means anything once intervalDays is at the 28-day cap or the
    // 182-day semestral tier (see instagram-fetch-state.ts).
    isInactive: boolean;
    consecutiveZeroYieldAtCap: number;
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
        isInactive: row.is_inactive ?? false,
        consecutiveZeroYieldAtCap: row.consecutive_zero_yield_at_cap ?? 0,
      });
    } else if (row.url.startsWith("google-alerts://")) {
      // Only one row ever exists for this category (a single tracked
      // feed, see GOOGLE_ALERTS_SOURCE_KEY) and its yield can't be
      // attributed by hostname the way every other bright source's can
      // — each entry points to a different, arbitrary external domain,
      // not one consistent site. acceptedByPipeline/rejectedByPipeline
      // (computed above from events/rejected_candidates' own `pipeline`
      // column) is the correct, already-computed signal for it instead.
      const accepted = acceptedByPipeline.get("google_alerts") ?? 0;
      const rejected = rejectedByPipeline.get("google_alerts") ?? 0;
      brightSources.push({
        url: row.url,
        lastFetchedAt: row.last_fetched_at,
        intervalDays: row.interval_days,
        accepted,
        rejected,
        possiblyDead: false,
        category: "google_alerts",
      });
    } else if (hostname) {
      const category: "bright_source" | "headless" = row.url === MAVI_LISTING_URL ? "headless" : "bright_source";
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
        category,
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

  // ---- cost history (all-time, row-level — client buckets by granularity) ----
  // Anthropic: precise per-call ledger, already in api_usage_log. Apify:
  // no per-call data reaches us, only this daily snapshot table (see
  // apps/curator/src/apify-usage-snapshot's own comment on why).
  const anthropicCostByDay = (usageRes.data ?? []).map((row) => ({
    date: String(row.created_at).slice(0, 10),
    amountUsd: Number(row.estimated_cost_usd ?? 0),
  }));
  const apifyCostByDay = (costSnapshotsRes.data ?? [])
    .filter((row) => row.platform === "apify")
    .map((row) => ({ date: String(row.usage_date), amountUsd: Number(row.amount_usd ?? 0) }));

  const discoveryRunSummaries = (runSummariesRes.data ?? []).map((row) => ({
    entrypoint: row.entrypoint,
    startedAt: row.started_at,
    candidatesTotal: row.candidates_total,
    approvedByCuration: row.approved_by_curation,
    rejectedByCuration: row.rejected_by_curation,
    insertedCount: row.inserted_count,
    replacedCount: row.replaced_count,
    duplicateSkippedCount: row.duplicate_skipped_count,
    escalatedCount: row.escalated_count,
    expiredCount: row.expired_count,
    insertFailedCount: row.insert_failed_count,
    costUsd: Number(row.cost_usd ?? 0),
  }));

  const instagramPosts = (instagramPostsRes.data ?? []).map((row) => ({
    mediaId: row.media_id,
    postType: row.post_type,
    weekStart: row.week_start,
    publishedAt: row.published_at,
    reach: row.reach,
    saved: row.saved,
    likeCount: row.like_count,
    commentsCount: row.comments_count,
  }));

  const instagramAccountSnapshots = (instagramSnapshotsRes.data ?? []).map((row) => ({
    snapshotDate: row.snapshot_date,
    followersCount: row.followers_count,
    mediaCount: row.media_count,
  }));

  const shadowCurationComparisons = (shadowComparisonsRes.data ?? []).map((row) => ({
    createdAt: row.created_at,
    pipeline: row.pipeline,
    label: row.label,
    model: row.model,
    realStatus: row.real_status,
    shadowStatus: row.shadow_status,
    agree: row.agree,
    realTags: row.real_tags,
    shadowTags: row.shadow_tags,
    error: row.error,
  }));

  return jsonResponse({
    generatedAt: new Date().toISOString(),
    events,
    outOfScopeSignals,
    pipelineComparison,
    brightSources,
    instagramSources,
    anthropicCostByDay,
    apifyCostByDay,
    pendingEscalationsCount: pendingEscalationsRes.count ?? 0,
    discoveryRunSummaries,
    instagramPosts,
    instagramAccountSnapshots,
    shadowCurationComparisons,
  });
});
