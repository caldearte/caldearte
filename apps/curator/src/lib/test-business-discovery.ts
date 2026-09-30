// One-off read-only test, 2026-09-30 — NOT part of any pipeline.
// Checks whether the Graph API's `business_discovery` field can read a
// DIFFERENT public Business/Creator account's recent media (caption,
// timestamp, media_type, like/comment counts) without going through
// Apify's Instagram scraper — would be free (within normal Graph API
// usage) instead of ~$0.35-0.45/day. Tests 3 real registered accounts:
// a large gallery, a small municipal account, and one known to be
// heavy-volume, to see if coverage/limits differ by account size.
const GRAPH_API_BASE = "https://graph.instagram.com/v21.0";

const TEST_ACCOUNTS = ["galeriamacchina", "centroculturalquillota", "museosaustral"];

async function checkBusinessDiscovery(targetUsername: string, igBusinessAccountId: string, accessToken: string) {
  const url = new URL(`${GRAPH_API_BASE}/${igBusinessAccountId}`);
  url.searchParams.set(
    "fields",
    `business_discovery.username(${targetUsername}){username,media_count,followers_count,media.limit(5){caption,timestamp,media_type,like_count,comments_count,permalink}}`,
  );
  url.searchParams.set("access_token", accessToken);
  const res = await fetch(url);
  const body = await res.json();
  console.log(`[test-business-discovery] ${targetUsername}: ok=${res.ok}`, JSON.stringify(body, null, 2));
}

async function main() {
  const accessToken = process.env.INSTAGRAM_ACCESS_TOKEN;
  const igBusinessAccountId = process.env.INSTAGRAM_BUSINESS_ACCOUNT_ID;
  if (!accessToken) throw new Error("INSTAGRAM_ACCESS_TOKEN must be set.");
  if (!igBusinessAccountId) throw new Error("INSTAGRAM_BUSINESS_ACCOUNT_ID must be set.");

  for (const username of TEST_ACCOUNTS) {
    await checkBusinessDiscovery(username, igBusinessAccountId, accessToken);
  }
}

main().catch((err) => {
  console.error(`[test-business-discovery] failed: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
