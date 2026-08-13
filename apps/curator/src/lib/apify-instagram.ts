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
// `skipPinnedPosts: true` + `onlyPostsNewerThan` together are the cost
// control: only the newest few posts, never a pinned post (usually old,
// already seen), never further back than the caller decides is needed.
//
// `onlyPostsNewerThan` is passed in by the caller, not computed here —
// instagram-fetch-state.ts's accountCutoffDate derives it from each
// account's own real last-fetch date (Daniel's explicit request,
// 2026-08-13: "el onlyPostsNewerThan debe traer la fecha de la última vez
// que se consultó esa fuente"), not a fixed rolling window. When several
// due accounts have different cutoffs (adaptive cadence means they will),
// the caller passes the OLDEST one — a single Apify call stays cheaper
// than one call per account, and any extra older posts a fresher-cadence
// account's cutoff didn't strictly need get filtered out anyway by the
// existing pre-curation dedup (already-seen sourceUrls).
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
export async function fetchInstagramPosts(usernames: string[], onlyPostsNewerThan: string): Promise<ApifyInstagramPost[]> {
  if (usernames.length === 0) return [];

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
