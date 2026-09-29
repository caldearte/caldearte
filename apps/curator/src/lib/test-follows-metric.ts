// One-off read-only test, 2026-09-29 — NOT part of any pipeline.
// Checks whether the Graph API's `follows` media-insights metric
// (https://developers.facebook.com/docs/instagram-platform/reference/instagram-media/insights/)
// actually works for a REEL, since Meta's own docs table only lists
// FEED/STORY as supported product types for that metric, not REELS —
// if true, that's a real gap for automating the monthly IG growth
// analysis (docs/roadmap.md Phase 4). Tests one reel and one carousel
// (FEED) media id, side by side, for comparison.
const GRAPH_API_BASE = "https://graph.instagram.com/v21.0";

const REEL_MEDIA_ID = "3995041147952472670"; // reel entrevista Bernardo Oyarzún — 7 seguidores in the UI
const CAROUSEL_MEDIA_ID = "3994117324928772920"; // carrusel MAC — 1 seguidor in the UI
const FRESH_CAROUSEL_MEDIA_ID = "18019870526872115"; // agenda 2026-09-28, never hit by this script before — isolates object-level throttling from the other two ids

async function checkMetric(label: string, metric: string, mediaId: string, accessToken: string) {
  const url = new URL(`${GRAPH_API_BASE}/${mediaId}/insights`);
  url.searchParams.set("metric", metric);
  url.searchParams.set("access_token", accessToken);
  const res = await fetch(url);
  const body = await res.json();
  console.log(`[test-follows] ${label} metric=${metric} (${mediaId}): ok=${res.ok}`, JSON.stringify(body));
}

async function main() {
  const accessToken = process.env.INSTAGRAM_ACCESS_TOKEN;
  if (!accessToken) throw new Error("INSTAGRAM_ACCESS_TOKEN must be set.");
  // Fresh id first — never hit by this script before, isolates whether
  // the previous two runs' failures (including on the `reach` control)
  // were per-object throttling on REEL_MEDIA_ID/CAROUSEL_MEDIA_ID
  // specifically, rather than a token/app-wide issue.
  await checkMetric("FRESH CAROUSEL (FEED)", "reach", FRESH_CAROUSEL_MEDIA_ID, accessToken);
  await checkMetric("FRESH CAROUSEL (FEED)", "follows", FRESH_CAROUSEL_MEDIA_ID, accessToken);
  // Original pair, for comparison against this run's fresh-id result.
  await checkMetric("REEL", "reach", REEL_MEDIA_ID, accessToken);
  await checkMetric("CAROUSEL (FEED)", "reach", CAROUSEL_MEDIA_ID, accessToken);
  await checkMetric("REEL", "follows", REEL_MEDIA_ID, accessToken);
  await checkMetric("CAROUSEL (FEED)", "follows", CAROUSEL_MEDIA_ID, accessToken);
}

main().catch((err) => {
  console.error(`[test-follows] failed: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
