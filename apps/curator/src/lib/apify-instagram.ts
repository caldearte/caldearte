// Fetches recent posts from a list of public Instagram accounts via
// Apify's `apify/instagram-post-scraper` actor — Instagram itself blocks
// anonymous/headless fetch of profile pages (confirmed repeatedly, see
// page-fetch.ts's doc comment: a plain fetch shows bio + ~1 post then a
// login wall), so this is the only viable way to read these accounts at
// all. Apify runs on its own infrastructure — no local browser to launch
// or install, unlike lib/mavi-headless.ts's Playwright approach.
//
// Input schema below is the REAL one, confirmed directly against Apify's
// own actor UI (2026-08-12), not inferred from docs. `resultsLimit: 5` +
// `skipPinnedPosts: true` + a computed `onlyPostsNewerThan` together are
// the cost control: only the newest few posts, never a pinned post
// (usually old, already seen), never further back than this pipeline's
// own run cadence needs.
import { ApifyClient } from "apify-client";

const ACTOR_ID = "apify/instagram-post-scraper";

export interface ApifyInstagramPost {
  url: string;
  caption: string | null;
  timestamp: string;
  displayUrl: string | null;
  ownerUsername: string;
}

const RESULTS_LIMIT_PER_ACCOUNT = 5;
// Margin over the run cadence, so a late/skipped run doesn't lose a post
// that was posted just before the previous cutoff. Must stay >= the
// per-account due-check interval (instagram-discovery/run.ts's
// INSTAGRAM_SOURCE_INTERVAL_MS, 14 days as of 2026-08-13) — otherwise a
// real post posted between the lookback window and the actual last-fetch
// date would never be seen by either run. Confirmed as a real gap the day
// the cadence changed from weekly to every 2 weeks (this constant wasn't
// widened at the same time as the cadence, until now).
const LOOKBACK_DAYS = 15;

// Pure and separately exported so the real output shape can be verified
// against a captured sample without hitting the real API — same pattern
// as lib/mavi-headless.ts's parseMaviActivities.
export function parseApifyInstagramPosts(items: unknown[]): ApifyInstagramPost[] {
  return items
    .filter((item): item is Record<string, unknown> => typeof item === "object" && item !== null)
    .map((item) => ({
      url: typeof item.url === "string" ? item.url : "",
      caption: typeof item.caption === "string" ? item.caption : null,
      timestamp: typeof item.timestamp === "string" ? item.timestamp : "",
      displayUrl: typeof item.displayUrl === "string" ? item.displayUrl : null,
      ownerUsername: typeof item.ownerUsername === "string" ? item.ownerUsername : "",
    }))
    .filter((post) => post.url !== "");
}

// Never throws — a broken actor/account or an Apify outage must not take
// down the whole instagram-discovery run, same defensive posture as
// lib/mavi-headless.ts's fetchMaviActivities.
export async function fetchInstagramPosts(usernames: string[], now: Date): Promise<ApifyInstagramPost[]> {
  if (usernames.length === 0) return [];

  const onlyPostsNewerThan = new Date(now.getTime() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  try {
    const client = new ApifyClient({ token: process.env.APIFY_TOKEN });
    const run = await client.actor(ACTOR_ID).call({
      dataDetailLevel: "basicData",
      username: usernames,
      resultsLimit: RESULTS_LIMIT_PER_ACCOUNT,
      skipPinnedPosts: true,
      onlyPostsNewerThan,
    });
    const { items } = await client.dataset(run.defaultDatasetId).listItems();
    return parseApifyInstagramPosts(items);
  } catch (err) {
    console.error(`[instagram-discovery] failed to fetch Instagram posts via Apify: ${(err as Error).message}`);
    return [];
  }
}
