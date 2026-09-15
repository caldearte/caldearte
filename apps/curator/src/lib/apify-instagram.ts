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
  // the item's `inputUrl`. Checked against two real datasets (2026-09-14
  // and 2026-09-15, 243 items): the actor sets inputUrl ONLY on its
  // placeholder/error items — a real post never carries it — so this is
  // null for every post that reaches curation and exists only as a
  // defensive first attempt should the actor start emitting it.
  inputUsername: string | null;
  // Co-authors of a collaborative post ("colab", 2+ accounts), from the
  // item's `coauthorProducers[].username`, lowercased. A collab post
  // shows up on every co-author's profile but the actor reports only the
  // primary author as ownerUsername — so a cultural center's own event,
  // co-posted with its municipality, comes back owned by the
  // municipality. Real production loss: 196/645 posts (30%) dropped as
  // "unexpected owner" on 2026-09-13, 49 on 09-14, 44 on 09-15 — and on
  // 09-15 every single one of the 44 had a registered account among its
  // coauthorProducers. #518 tried to fix this through inputUrl and never
  // rescued a real post (see above); this field is the one that does.
  coauthorUsernames: string[];
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

// `coauthorProducers` is an array of {id, username, ...} on collab posts
// and absent otherwise; anything that isn't that shape yields [] rather
// than a crash on a malformed row.
export function coauthorUsernamesOf(coauthorProducers: unknown): string[] {
  if (!Array.isArray(coauthorProducers)) return [];
  return coauthorProducers
    .map((c) => (typeof c === "object" && c !== null && typeof (c as { username?: unknown }).username === "string" ? (c as { username: string }).username.trim().toLowerCase() : ""))
    .filter((u) => u.length > 0);
}

// Exported so run.ts can log when an account's raw fetch count hits this
// cap — the one signal we have that Apify's own resultsLimit (not our
// onlyPostsNewerThan filter) may have truncated a burst of posts, since
// a truncated fetch and a genuinely-quiet-past-5-posts account return
// the exact same shape otherwise (see run.ts's own comment on this).
export const RESULTS_LIMIT_PER_ACCOUNT = 5;

// A real Instagram post always has a shortcode URL. The actor ALSO pushes
// one item per requested profile that had nothing in the window (or was
// private/not found) — no owner, no caption, no post URL — and until
// 2026-09-14 those were silently dropped as "unexpected owner" (the
// 2026-09-13 run had 17 with ownerUsername ""). Once attribution moved
// to inputUrl (#518) they resolved to the requested account instead:
// the first daily run showed 111/180 "collab" posts and 113/177 "thin
// caption" items — one per quiet account — each of which also counted
// as a "genuinely new post" for the dormancy backstop, so no account
// could ever go inactive again. Requiring a post-shaped URL is the one
// check that holds regardless of the placeholder's exact field set.
const POST_URL = /^https?:\/\/(?:www\.)?instagram\.com\/(?:p|reel|reels|tv)\/[A-Za-z0-9_-]+\/?(?:[?#].*)?$/;

export function isInstagramPostUrl(url: string): boolean {
  return POST_URL.test(url);
}

// Pure and separately exported so the real output shape can be verified
// against a captured sample without hitting the real API — same pattern
// as lib/mavi-headless.ts's parseMaviActivities. Returns the placeholder
// count too, so the caller can log it as what it is instead of letting
// it masquerade as collab posts / thin captions downstream.
export function parseApifyInstagramPostsWithStats(items: unknown[]): { posts: ApifyInstagramPost[]; placeholders: number } {
  let placeholders = 0;
  const posts = items
    .filter((item): item is Record<string, unknown> => typeof item === "object" && item !== null)
    .map((item) => ({
      url: typeof item.url === "string" ? item.url : "",
      caption: typeof item.caption === "string" ? item.caption : null,
      timestamp: typeof item.timestamp === "string" ? item.timestamp : "",
      displayUrl: typeof item.displayUrl === "string" ? item.displayUrl : null,
      ownerUsername: typeof item.ownerUsername === "string" ? item.ownerUsername : "",
      inputUsername: usernameFromProfileUrl(item.inputUrl),
      coauthorUsernames: coauthorUsernamesOf(item.coauthorProducers),
    }))
    .filter((post) => {
      if (isInstagramPostUrl(post.url)) return true;
      placeholders += 1;
      return false;
    });
  return { posts, placeholders };
}

export function parseApifyInstagramPosts(items: unknown[]): ApifyInstagramPost[] {
  return parseApifyInstagramPostsWithStats(items).posts;
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
    const { posts, placeholders } = parseApifyInstagramPostsWithStats(items);
    if (placeholders > 0) {
      // Shape of the first non-post item, keys only — the actor's
      // placeholder format isn't documented, this is how it gets
      // confirmed from a real run without dumping data into the log.
      const sample = items.find((item) => typeof item === "object" && item !== null && !isInstagramPostUrl(String((item as Record<string, unknown>).url ?? "")));
      const keys = sample ? Object.keys(sample as object).slice(0, 12).join(",") : "?";
      console.log(`[instagram-discovery] ${placeholders}/${items.length} dataset item(s) are not posts (quiet/private/missing profile placeholders), dropped — sample keys: ${keys}`);
    }
    return { posts, errorMessage: null };
  } catch (err) {
    const message = (err as Error).message;
    console.error(`[instagram-discovery] failed to fetch Instagram posts via Apify: ${message}`);
    return { posts: [], errorMessage: message };
  }
}
