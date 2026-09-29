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

async function checkFollows(label: string, mediaId: string, accessToken: string) {
  const url = new URL(`${GRAPH_API_BASE}/${mediaId}/insights`);
  url.searchParams.set("metric", "follows");
  url.searchParams.set("access_token", accessToken);
  const res = await fetch(url);
  const body = await res.json();
  console.log(`[test-follows] ${label} (${mediaId}): ok=${res.ok}`, JSON.stringify(body));
}

async function main() {
  const accessToken = process.env.INSTAGRAM_ACCESS_TOKEN;
  if (!accessToken) throw new Error("INSTAGRAM_ACCESS_TOKEN must be set.");
  await checkFollows("REEL", REEL_MEDIA_ID, accessToken);
  await checkFollows("CAROUSEL (FEED)", CAROUSEL_MEDIA_ID, accessToken);
}

main().catch((err) => {
  console.error(`[test-follows] failed: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
