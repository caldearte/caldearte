// Admin analytics dashboard — read-only, same trust boundary as
// admin-remove-event/admin-toggle-sensitive (see those files' own
// comments): reached only from apps/web's /admin server component, which
// verifies the caller's real Auth.js Google session + ADMIN_EMAIL match
// BEFORE ever calling here, then calls this function directly (no
// intermediate api/admin/* route needed — a server component has no
// browser boundary to cross, so the shared x-admin-secret never reaches
// the client). Deployed with --no-verify-jwt, same posture as every other
// admin Edge Function in this repo.
//
// Computes and returns all 3 dashboard sections in one JSON payload:
// (1) event metrics by week, (2) pipeline/source comparison, (3)
// out-of-scope signal trends. Aggregation happens here (server-side,
// service-role), not in the browser — apps/web never sees raw rows.
import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ADMIN_ACTIONS_SECRET = Deno.env.get("ADMIN_ACTIONS_SECRET")!;

const PIPELINES = ["comuna_search", "bright_source", "instagram", "google_alerts", "headless"] as const;
type PipelineValue = (typeof PIPELINES)[number];

const DEFAULT_WEEKS = 12;
const MS_PER_WEEK = 7 * 24 * 60 * 60 * 1000;

function jsonResponse(body: unknown, httpStatus = 200): Response {
  return new Response(JSON.stringify(body), { status: httpStatus, headers: { "content-type": "application/json" } });
}

// Monday-anchored ISO week label ("2026-08-10"), same bucketing every
// other week-based view in this codebase already uses (the newsletter's
// own week range) — not a plain Sunday-start week.
function isoWeekStart(date: Date): string {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = d.getUTCDay();
  const diffToMonday = day === 0 ? -6 : 1 - day;
  d.setUTCDate(d.getUTCDate() + diffToMonday);
  return d.toISOString().slice(0, 10);
}

function monthLabel(date: Date): string {
  return date.toISOString().slice(0, 7); // "2026-08"
}

Deno.serve(async (req) => {
  if (req.headers.get("x-admin-secret") !== ADMIN_ACTIONS_SECRET) {
    return jsonResponse({ error: "unauthorized" }, 401);
  }

  const url = new URL(req.url);
  const weeksParam = Number(url.searchParams.get("weeks"));
  const weeks = Number.isFinite(weeksParam) && weeksParam > 0 ? weeksParam : DEFAULT_WEEKS;
  const since = new Date(Date.now() - weeks * MS_PER_WEEK);
  const sinceIso = since.toISOString();

  const client = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  // ---- Section 1: event metrics by week ----------------------------
  // Bucketed by the EVENT's own date (opening_datetime, falling back to
  // run_start_date), same semantics the public calendar itself uses —
  // "when is this happening", not "when did we discover it". Only real,
  // currently-visible events: approved, not soft-removed.
  const { data: eventRows, error: eventsError } = await client
    .from("events")
    .select("opening_datetime, run_start_date, run_end_date")
    .eq("curation_status", "approved")
    .is("removed_at", null)
    .or(`opening_datetime.gte.${sinceIso},run_start_date.gte.${since.toISOString().slice(0, 10)}`);
  if (eventsError) {
    console.error("admin-analytics: events query failed", eventsError);
    return jsonResponse({ error: "query_failed" }, 500);
  }

  const eventsByWeek = new Map<string, { inauguraciones: number; expos: number }>();
  for (const row of eventRows ?? []) {
    const anchor = row.opening_datetime ?? row.run_start_date;
    if (!anchor) continue;
    const week = isoWeekStart(new Date(anchor));
    const bucket = eventsByWeek.get(week) ?? { inauguraciones: 0, expos: 0 };
    // Same inauguración/exposición split apps/web/src/lib/events.ts's
    // splitInauguracionesYExpos uses: inauguración = has openingDatetime,
    // ongoing exhibition = has a real run_start_date+run_end_date pair.
    if (row.opening_datetime) bucket.inauguraciones += 1;
    else if (row.run_start_date && row.run_end_date) bucket.expos += 1;
    eventsByWeek.set(week, bucket);
  }
  const eventMetrics = [...eventsByWeek.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([week, counts]) => ({ week, ...counts }));

  // ---- Section 2: pipeline/source comparison ------------------------
  const [eventsByPipelineRes, rejectedByPipelineRes, usageByPipelineRes, fetchStateRes, regionCoverageRes] = await Promise.all([
    client.from("events").select("pipeline").eq("curation_status", "approved").is("removed_at", null).gte("created_at", sinceIso),
    client.from("rejected_candidates").select("pipeline").gte("created_at", sinceIso),
    client.from("api_usage_log").select("pipeline, estimated_cost_usd").gte("created_at", sinceIso),
    client.from("bright_source_fetch_state").select("url, last_fetched_at, interval_days"),
    client.from("events").select("region_id, regions(name)").eq("curation_status", "approved").is("removed_at", null).gte("created_at", sinceIso),
  ]);
  for (const [label, res] of [
    ["events by pipeline", eventsByPipelineRes],
    ["rejected by pipeline", rejectedByPipelineRes],
    ["usage by pipeline", usageByPipelineRes],
    ["fetch state", fetchStateRes],
    ["region coverage", regionCoverageRes],
  ] as const) {
    if (res.error) {
      console.error(`admin-analytics: ${label} query failed`, res.error);
      return jsonResponse({ error: "query_failed" }, 500);
    }
  }

  const acceptedByPipeline = new Map<string, number>();
  for (const row of eventsByPipelineRes.data ?? []) {
    const key = row.pipeline ?? "unattributed";
    acceptedByPipeline.set(key, (acceptedByPipeline.get(key) ?? 0) + 1);
  }
  const rejectedByPipeline = new Map<string, number>();
  for (const row of rejectedByPipelineRes.data ?? []) {
    const key = row.pipeline ?? "unattributed";
    rejectedByPipeline.set(key, (rejectedByPipeline.get(key) ?? 0) + 1);
  }
  const costByPipeline = new Map<string, number>();
  for (const row of usageByPipelineRes.data ?? []) {
    const key = row.pipeline ?? "unattributed";
    costByPipeline.set(key, (costByPipeline.get(key) ?? 0) + Number(row.estimated_cost_usd ?? 0));
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
      // comment; surfaced to the UI as an approximation, not a precise
      // per-event figure.
      avgCostUsdPerEvent: accepted > 0 ? cost / accepted : null,
      totalCostUsd: cost,
      approvalRate: accepted + rejected > 0 ? accepted / (accepted + rejected) : null,
    };
  });

  // Dead-source alert: a plain threshold, first pass, not tuned against
  // real data yet — see docs' own "measure before building infra" note
  // on this exact check. Possibly-dead when EITHER (a) its adaptive
  // cadence has climbed to Instagram's 28-day cap, OR (b) it's been
  // fetched at all (last_fetched_at present) but nothing — accepted OR
  // rejected — has been attributed to it in the trailing window.
  //
  // Two DIFFERENT yield signals, matched by pipeline shape:
  // - Instagram: bright_source_fetch_state.url is the account's own
  //   PROFILE url (instagram.com/<username>/) — unlike a post's own
  //   permalink (instagram.com/p/<shortcode>/, which never embeds the
  //   username), the username IS recoverable from this url. Matched
  //   against source_account (populated by lib/instagram-item.ts,
  //   see EventCandidate.sourceAccount's own doc comment for the real
  //   gap this closes — found and fixed 2026-08-15, the same day this
  //   dashboard was first built and briefly shipped with a domain-only
  //   check that couldn't tell individual accounts apart).
  // - Everything else (web bright sources, one distinct domain each):
  //   matched by hostname, same as before — still correct there, this
  //   gap was Instagram-specific.
  const { data: recentAccounts, error: recentAccountsError } = await client
    .from("events")
    .select("source_account")
    .gte("created_at", sinceIso)
    .not("source_account", "is", null);
  const { data: recentRejectedAccounts, error: recentRejectedAccountsError } = await client
    .from("rejected_candidates")
    .select("source_account")
    .gte("created_at", sinceIso)
    .not("source_account", "is", null);
  const { data: recentSourceUrls, error: recentUrlsError } = await client
    .from("events")
    .select("source_url")
    .gte("created_at", sinceIso)
    .not("source_url", "is", null);
  const { data: recentRejectedUrls, error: recentRejectedUrlsError } = await client
    .from("rejected_candidates")
    .select("source_url")
    .gte("created_at", sinceIso)
    .not("source_url", "is", null);
  if (recentAccountsError || recentRejectedAccountsError || recentUrlsError || recentRejectedUrlsError) {
    console.error(
      "admin-analytics: recent yield query failed",
      recentAccountsError ?? recentRejectedAccountsError ?? recentUrlsError ?? recentRejectedUrlsError,
    );
    return jsonResponse({ error: "query_failed" }, 500);
  }
  const recentSourceAccounts = new Set<string>();
  for (const row of [...(recentAccounts ?? []), ...(recentRejectedAccounts ?? [])]) {
    if (row.source_account) recentSourceAccounts.add(row.source_account as string);
  }
  const sourceUrlDomains = new Set<string>();
  for (const row of [...(recentSourceUrls ?? []), ...(recentRejectedUrls ?? [])]) {
    try {
      sourceUrlDomains.add(new URL(row.source_url as string).hostname);
    } catch {
      // unparseable — ignore, not this check's concern
    }
  }

  const deadSourceAlerts = (fetchStateRes.data ?? [])
    .map((row) => {
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
      const hasRecentYield = instagramUsername
        ? recentSourceAccounts.has(instagramUsername)
        : hostname !== null && sourceUrlDomains.has(hostname);
      const atAdaptiveCap = (row.interval_days ?? 0) >= 28;
      const possiblyDead = !hasRecentYield && (atAdaptiveCap || row.last_fetched_at !== null);
      return { url: row.url, lastFetchedAt: row.last_fetched_at, intervalDays: row.interval_days, possiblyDead };
    })
    .filter((row) => row.possiblyDead);

  // Región coverage: count of approved events per región over the window.
  const coverageByRegion = new Map<string, { regionName: string; count: number }>();
  for (const row of regionCoverageRes.data ?? []) {
    if (!row.region_id) continue;
    const regionName = (row as unknown as { regions: { name: string } | null }).regions?.name ?? "Desconocida";
    const existing = coverageByRegion.get(row.region_id) ?? { regionName, count: 0 };
    existing.count += 1;
    coverageByRegion.set(row.region_id, existing);
  }
  const regionCoverage = [...coverageByRegion.values()].sort((a, b) => b.count - a.count);

  // ---- Section 3: out-of-scope signal trends -------------------------
  const { data: signalRows, error: signalsError } = await client
    .from("out_of_scope_signals")
    .select("created_at, category")
    .gte("created_at", sinceIso);
  if (signalsError) {
    console.error("admin-analytics: out_of_scope_signals query failed", signalsError);
    return jsonResponse({ error: "query_failed" }, 500);
  }
  const signalsByMonth = new Map<string, Record<string, number>>();
  for (const row of signalRows ?? []) {
    const month = monthLabel(new Date(row.created_at));
    const bucket = signalsByMonth.get(month) ?? {};
    bucket[row.category] = (bucket[row.category] ?? 0) + 1;
    signalsByMonth.set(month, bucket);
  }
  const outOfScopeTrends = [...signalsByMonth.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, categories]) => ({ month, categories }));

  return jsonResponse({
    weeks,
    generatedAt: new Date().toISOString(),
    eventMetrics,
    pipelineComparison,
    deadSourceAlerts,
    regionCoverage,
    outOfScopeTrends,
  });
});
