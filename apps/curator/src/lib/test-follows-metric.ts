// One-off read-only test, 2026-09-29 — NOT part of any pipeline.
// Checks whether the Graph API's `follows` media-insights metric
// (https://developers.facebook.com/docs/instagram-platform/reference/instagram-media/insights/)
// actually works for a REEL, since Meta's own docs table only lists
// FEED/STORY as supported product types for that metric, not REELS —
// if true, that's a real gap for automating the monthly IG growth
// analysis (docs/roadmap.md Phase 4).
//
// A fresh (never-hit) FEED carousel id already confirmed reach+follows
// both work there — see git history for that run's output — which ruled
// out a token/app-wide issue and pinned the earlier failures on
// per-object throttling from repeated hits on the same 2 ids below.
// Still open: a REEL, tested clean (never hit by this script before).
// Reels aren't in the `instagram_posts` table (posted manually, outside
// the pipeline), so this fetches the account's recent media and picks
// the newest REEL/VIDEO not in the already-hit id list.
const GRAPH_API_BASE = "https://graph.instagram.com/v21.0";

const REEL_MEDIA_ID = "3995041147952472670"; // reel entrevista Bernardo Oyarzún — already throttled by repeated hits
const CAROUSEL_MEDIA_ID = "3994117324928772920"; // carrusel MAC — already throttled by repeated hits
const FRESH_CAROUSEL_MEDIA_ID = "18019870526872115"; // agenda 2026-09-28 — confirmed clean in a prior run, kept here only as a sanity check

async function checkMetric(label: string, metric: string, mediaId: string, accessToken: string) {
  const url = new URL(`${GRAPH_API_BASE}/${mediaId}/insights`);
  url.searchParams.set("metric", metric);
  url.searchParams.set("access_token", accessToken);
  const res = await fetch(url);
  const body = await res.json();
  console.log(`[test-follows] ${label} metric=${metric} (${mediaId}): ok=${res.ok}`, JSON.stringify(body));
}

async function findFreshReelId(igBusinessAccountId: string, accessToken: string): Promise<string | null> {
  const url = new URL(`${GRAPH_API_BASE}/${igBusinessAccountId}/media`);
  url.searchParams.set("fields", "id,media_type,media_product_type,timestamp");
  url.searchParams.set("limit", "50");
  url.searchParams.set("access_token", accessToken);
  const res = await fetch(url);
  const body = await res.json();
  if (!res.ok) {
    console.error(`[test-follows] media list fetch failed: ${JSON.stringify(body)}`);
    return null;
  }
  const alreadyHit = new Set([REEL_MEDIA_ID, CAROUSEL_MEDIA_ID, FRESH_CAROUSEL_MEDIA_ID]);
  const media = (body.data ?? []) as { id: string; media_type: string; media_product_type?: string; timestamp: string }[];
  const reel = media.find((m) => m.media_product_type === "REELS" && !alreadyHit.has(m.id));
  return reel?.id ?? null;
}

async function main() {
  const accessToken = process.env.INSTAGRAM_ACCESS_TOKEN;
  const igBusinessAccountId = process.env.INSTAGRAM_BUSINESS_ACCOUNT_ID;
  if (!accessToken) throw new Error("INSTAGRAM_ACCESS_TOKEN must be set.");
  if (!igBusinessAccountId) throw new Error("INSTAGRAM_BUSINESS_ACCOUNT_ID must be set.");

  const freshReelId = await findFreshReelId(igBusinessAccountId, accessToken);
  if (freshReelId) {
    await checkMetric("FRESH REEL", "reach", freshReelId, accessToken);
    await checkMetric("FRESH REEL", "follows", freshReelId, accessToken);
  } else {
    console.log("[test-follows] no fresh, never-hit REEL found in the last 50 media items");
  }

  // Sanity check on the already-confirmed-clean carousel id.
  await checkMetric("FRESH CAROUSEL (FEED)", "follows", FRESH_CAROUSEL_MEDIA_ID, accessToken);
}

main().catch((err) => {
  console.error(`[test-follows] failed: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
