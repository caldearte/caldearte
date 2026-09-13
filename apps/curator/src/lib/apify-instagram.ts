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
  // The username whose profile the actor was asked to scrape, parsed from
  // the item's `inputUrl` (a real output field, confirmed against the
  // actor's own documented output 2026-09-13). Distinct from
  // ownerUsername on purpose: a collaborative post ("colab", 2+ accounts
  // as co-authors) shows up on every co-author's profile, but the actor
  // reports only the primary author as ownerUsername — so a cultural
  // center's own event, co-posted with its municipality, came back as
  // owned by the municipality. Real production loss, 2026-09-13: 196 of
  // 645 fetched posts (30%) were dropped as "unexpected owner" for
  // exactly this reason — paid Apify results thrown away, and the
  // registered account's own announcements never curated. null when the
  // item carries no parseable inputUrl (older fixtures, malformed rows).
  inputUsername: string | null;
}

// "https://www.instagram.com/casaculturalyanulaque/" → "casaculturalyanulaque".
// Lowercased so it matches the registry the same way run.ts already
// matches ownerUsername (case-insensitive second attempt); anything that
// isn't a plain profile URL (a /p/ post URL, an empty string) yields null
// rather than a bogus username.
export function usernameFromProfileUrl(inputUrl: unknown): string | null {
  if (typeof inputUrl !== "string") return null;
  const match = /^https?:\/\/(?:www\.)?instagram\.com\/([A-Za-z0-9._]+)\/?(?:[?#].*)?$/.exec(inputUrl.trim());
  if (!match) return null;
  const username = match[1].toLowerCase();
  // Reserved path segments that are never a profile.
  if (["p", "reel", "reels", "explore", "stories", "accounts"].includes(username)) return null;
  return username;
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
      inputUsername: usernameFromProfileUrl(item.inputUrl),
    }))
    .filter((post) => post.url !== "");
}

// Never throws — a broken actor/account or an Apify outage must not take
// down the whole instagram-discovery run, same defensive posture as
// lib/mavi-headless.ts's fetchMaviActivities. `errorMessage` is returned
// (not thrown) so the caller can still record fetch state / send its
// summary normally, but real callers must check it — real production
// case, 2026-08-30: Apify's own account-level "Monthly usage hard limit
// exceeded" error was previously swallowed into a silent `[]`,
// indistinguishable from a genuinely quiet day across every account —
// nobody could tell from the run summary or the daily digest that
// Instagram had actually been blocked, not just quiet.
export interface FetchInstagramPostsResult {
  posts: ApifyInstagramPost[];
  errorMessage: string | null;
}

export async function fetchInstagramPosts(usernames: string[], onlyPostsNewerThan: string): Promise<FetchInstagramPostsResult> {
  if (usernames.length === 0) return { posts: [], errorMessage: null };

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
    return { posts: parseApifyInstagramPosts(items), errorMessage: null };
  } catch (err) {
    const message = (err as Error).message;
    console.error(`[instagram-discovery] failed to fetch Instagram posts via Apify: ${message}`);
    return { posts: [], errorMessage: message };
  }
}
