// No cadence gate for Instagram either, 2026-08-24 — same principle
// already applied to every other bright source (event-discovery/
// headless-discovery/google-alerts-discovery's own run.ts files): a
// quiet account returns 0 results whether checked often or rarely, so
// gating on a per-account timer buys nothing once the cron itself has a
// fixed cadence. Checking more often also closes a real gap:
// RESULTS_LIMIT_PER_ACCOUNT (5, apify-instagram.ts) could silently miss
// posts on an account that posted more than 5 times between checks.
//
// A dormancy backstop is kept: an account with nothing new for enough
// consecutive checks (however often the cron fires) is marked inactive
// so a genuinely dead/abandoned account doesn't get polled forever.
// Re-activating one (if it ever starts posting again) is a manual
// action, not automatic — see instagram-accounts.ts for how to do that.
// Reuses the same `interval_days`/`consecutive_zero_yield_at_cap`
// columns every bright source already has (bright_source_fetch_state) —
// interval_days is now always written as DEFAULT_INTERVAL_DAYS for an
// Instagram row (purely for the admin dashboard's display, not read to
// gate anything), and consecutive_zero_yield_at_cap counts checks
// instead of cycles-at-cap; no migration needed, just a change in what
// these columns mean for this pipeline.
//
// The check-count threshold is deliberately tied to real elapsed time
// (~6 months of silence), not a fixed number — recalculated each time
// the cron cadence changes so it doesn't go stale silently: 52 at
// weekly → ~1 year; 52 at 2x/week → ~6 months; bumped to 90 on
// 2026-08-26 for every-2-days (~15.5 checks/month, keeping 52 there
// would have shortened it to ~3.4 months). Reverted to 52 on 2026-08-30
// alongside the cadence reverting back to 2x/week (Sun/Wed) — see
// instagram-bright-sources.yml's own comment: the every-2-days cadence
// hit Apify's real $5/mo free-tier limit mid-month, no usage signal yet
// to justify paying past it. Raised to 156 on 2026-09-13 with the move
// to daily Mon-Sat (6 checks/week × 26 weeks ≈ the same ~6 months) —
// the cadence change was justified by measuring, from real post
// timestamps, that Sun/Wed saw only 74% of inauguraciones before they
// happened vs ~93% daily, and by confirming Apify bills per post
// fetched (never per call), so extra runs cost nothing by themselves.
//
// DEFAULT_INTERVAL_DAYS dropped 7→4 the same day, for a different
// reason: instagram-discovery/run.ts used to share ONE Apify call across
// every due account, using the OLDEST per-account cutoff as the single
// onlyPostsNewerThan — and a newly-added account (no last_fetched_at
// yet) fell back to a full 7 days regardless of the real Sun/Wed cadence
// (worst real gap: 4 days, Wed→Sun). That dragged the shared window wide
// open every time an account got added, re-fetching (and re-billing)
// posts every other account had already seen days earlier — confirmed
// directly in a real run's own log ("N post(s) already seen, skipped
// before curation"). 4 days matched the real worst-case gap exactly.
// That shared-call design is gone since 2026-09-13 (groupAccountsByCutoff
// below: one call per distinct cutoff date), so a new account's 4-day
// window no longer affects anyone else — 4 is kept simply as a sensible
// first window for an account we've never seen.
import { getSupabaseClient } from "./supabase-client.js";
import type { InstagramAccountConfig } from "./instagram-accounts.js";

export const DEFAULT_INTERVAL_DAYS = 4;
// Hard ceiling on how far back a single account's cutoff may reach,
// whatever its last_fetched_at says (Daniel's rule, 2026-09-13). Measured
// on that day's real catch-up run after a 2-week Apify outage: posts
// older than 7 days yielded 8 exhibitions and ONE future inauguración
// (ARTE MAR) — while the 9 inauguraciones announced in those posts had
// already happened and expired regardless of whether we fetched them.
// Since the calendar's whole point is inauguraciones, not expos, paying
// for that tail buys almost nothing. 7 also matches
// OPENING_ONLY_GRACE_DAYS (discover.ts): an opening announced more than
// 7 days before the run is either still ahead (rare, ~5% of posts) or
// already outside the grace window anyway. Applies to ANY gap for any
// reason (outage, failed workflow, manual pause) — no need to detect an
// Apify cut specifically.
export const MAX_LOOKBACK_DAYS = 7;
export const ZERO_YIELD_CHECKS_BEFORE_INACTIVE = 156;

export interface InstagramAccountState {
  lastFetchedAt: string | null;
  consecutiveZeroYieldChecks: number;
  isInactive: boolean;
}

export interface NextFetchState {
  consecutiveZeroYieldChecks: number;
  isInactive: boolean;
}

export function instagramAccountProfileUrl(account: InstagramAccountConfig): string {
  return `https://www.instagram.com/${account.username}/`;
}

export async function loadInstagramFetchState(accounts: InstagramAccountConfig[]): Promise<Map<string, InstagramAccountState>> {
  const urls = accounts.map(instagramAccountProfileUrl);
  if (urls.length === 0) return new Map();

  const { data, error } = await getSupabaseClient()
    .from("bright_source_fetch_state")
    .select("url, last_fetched_at, consecutive_zero_yield_at_cap, is_inactive")
    .in("url", urls);

  if (error) {
    throw new Error(`Failed to load Instagram fetch state: ${error.message}`);
  }

  return new Map(
    (data ?? []).map((row) => [
      row.url,
      {
        lastFetchedAt: row.last_fetched_at,
        consecutiveZeroYieldChecks: row.consecutive_zero_yield_at_cap ?? 0,
        isInactive: row.is_inactive ?? false,
      },
    ]),
  );
}

// No time-elapsed check anymore, 2026-08-24 (see this file's own header
// comment) — an account is due unless marked inactive. `now` is kept as
// a parameter for call-site compatibility even though it's now unused
// here; the real per-account freshness signal is accountCutoffDate
// below, not this function.
export function isInstagramAccountDue(state: InstagramAccountState | undefined, _now: Date): boolean {
  return !state?.isInactive;
}

// The cutoff Apify should use for THIS account specifically — its own
// last real fetch, not a fixed rolling window (Daniel's explicit
// request: "el onlyPostsNewerThan debe traer la fecha de la última vez
// que se consultó esa fuente"). Falls back to DEFAULT_INTERVAL_DAYS back
// from now for an account that's never been fetched, since there's no
// real "last time" to anchor to yet.
export function accountCutoffDate(state: InstagramAccountState | undefined, now: Date): Date {
  const floor = new Date(now.getTime() - MAX_LOOKBACK_DAYS * 24 * 60 * 60 * 1000);
  if (state?.lastFetchedAt) {
    const last = new Date(state.lastFetchedAt);
    return last > floor ? last : floor;
  }
  return new Date(now.getTime() - DEFAULT_INTERVAL_DAYS * 24 * 60 * 60 * 1000);
}

// Which accounts share which `onlyPostsNewerThan` — the real fix
// (2026-09-13) for the waste the DEFAULT_INTERVAL_DAYS 7→4 note above only
// mitigated: instagram-discovery/run.ts used to make ONE Apify call for
// every account with the OLDEST cutoff among them, so a single new
// account (or one lagging after a gap) pulled every other account's
// window back to its date, and Apify billed every re-fetched post before
// the pre-curation dedup threw it away (2026-08-26: 93 of 145 fetched
// posts already seen; 2026-08-29: 53 of 297). Grouping by cutoff DATE
// (Apify's onlyPostsNewerThan is day-granular) and making one call per
// group means each account fetches exactly what it's missing and nothing
// more — in a normal run every account was fetched the same day, so this
// is still a single call; it only splits when there are new or lagging
// accounts. Apify bills per post, never per call, so N calls cost the
// same as one. Groups come back oldest-first, purely for stable logs.
export interface AccountCutoffGroup {
  onlyPostsNewerThan: string;
  accounts: InstagramAccountConfig[];
}

export function groupAccountsByCutoff(
  accounts: InstagramAccountConfig[],
  fetchState: ReadonlyMap<string, InstagramAccountState>,
  now: Date,
): AccountCutoffGroup[] {
  const byDate = new Map<string, InstagramAccountConfig[]>();
  for (const account of accounts) {
    const date = accountCutoffDate(fetchState.get(instagramAccountProfileUrl(account)), now).toISOString().slice(0, 10);
    const group = byDate.get(date);
    if (group) group.push(account);
    else byDate.set(date, [account]);
  }
  return [...byDate.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([onlyPostsNewerThan, accounts]) => ({ onlyPostsNewerThan, accounts }));
}

// Any genuinely new post resets the zero-yield streak to 0 (never
// inactive). Nothing new just increments the streak; the 52nd
// consecutive empty check marks the account inactive.
export function nextFetchState(
  state: Pick<InstagramAccountState, "consecutiveZeroYieldChecks"> | undefined,
  foundNewPost: boolean,
): NextFetchState {
  if (foundNewPost) {
    return { consecutiveZeroYieldChecks: 0, isInactive: false };
  }
  const zeroStreak = (state?.consecutiveZeroYieldChecks ?? 0) + 1;
  return { consecutiveZeroYieldChecks: zeroStreak, isInactive: zeroStreak >= ZERO_YIELD_CHECKS_BEFORE_INACTIVE };
}

export async function recordInstagramFetchState(account: InstagramAccountConfig, now: Date, nextState: NextFetchState): Promise<void> {
  const client = getSupabaseClient();
  const { error } = await client.from("bright_source_fetch_state").upsert({
    url: instagramAccountProfileUrl(account),
    last_fetched_at: now.toISOString(),
    interval_days: DEFAULT_INTERVAL_DAYS,
    consecutive_zero_yield_at_cap: nextState.consecutiveZeroYieldChecks,
    is_inactive: nextState.isInactive,
  });
  if (error) {
    console.error(`[instagram-discovery] failed to record fetch state for ${account.username}: ${error.message}`);
  }
}
