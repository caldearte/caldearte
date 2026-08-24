// Flat weekly fetch cadence for every Instagram bright source, 2026-08-24
// — replaces the earlier escalating ladder (7 -> 14 -> 21 -> 28 ->
// semestral -> inactive). Real data killed the cost assumption the
// ladder was built on: Apify's `apify/instagram-post-scraper` is
// pay-per-RESULT (~$0.0025/post), not per-account-queried, so a quiet
// account checked weekly costs the same ~$0 as one checked every 28
// days — a zero-yield fetch returns 0 results either way. Checking
// weekly instead of on a stretched-out cadence also closes a real gap:
// RESULTS_LIMIT_PER_ACCOUNT (5, apify-instagram.ts) could silently miss
// posts on an account that posted more than 5 times since its last
// (infrequent) check. Simulated the real cost of flat-weekly-for-all
// against actual platform_cost_snapshots data before making this change
// — ~1.5x more account-checks/week, negligible in absolute dollars.
//
// The escalation ladder's dormancy path is kept, simplified: an account
// with nothing new for a full year of weekly checks (52 in a row) is
// marked inactive so a genuinely dead/abandoned account doesn't get
// polled forever. Re-activating one (if it ever starts posting again) is
// a manual action, not automatic — see instagram-accounts.ts for how to
// do that. Reuses the same `interval_days`/`consecutive_zero_yield_at_cap`
// columns every bright source already has (bright_source_fetch_state) —
// interval_days is now always written as 7 for an Instagram row, and
// consecutive_zero_yield_at_cap counts weeks instead of cycles-at-cap; no
// migration needed, just a change in what these columns mean for this
// pipeline.
import { getSupabaseClient } from "./supabase-client.js";
import type { InstagramAccountConfig } from "./instagram-accounts.js";

export const DEFAULT_INTERVAL_DAYS = 7;
export const ZERO_YIELD_WEEKS_BEFORE_INACTIVE = 52;

export interface InstagramAccountState {
  lastFetchedAt: string | null;
  consecutiveZeroYieldWeeks: number;
  isInactive: boolean;
}

export interface NextFetchState {
  consecutiveZeroYieldWeeks: number;
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
        consecutiveZeroYieldWeeks: row.consecutive_zero_yield_at_cap ?? 0,
        isInactive: row.is_inactive ?? false,
      },
    ]),
  );
}

// An inactive account is never due — the whole point of the dormancy
// path above is to stop paying for Apify fetches on an account that's
// shown nothing for a full year. Re-activating one (if it ever starts
// posting again) is a manual action, not automatic — see
// instagram-accounts.ts for how to do that.
export function isInstagramAccountDue(state: InstagramAccountState | undefined, now: Date): boolean {
  if (state?.isInactive) return false;
  if (!state?.lastFetchedAt) return true;
  const intervalMs = DEFAULT_INTERVAL_DAYS * 24 * 60 * 60 * 1000;
  return now.getTime() - new Date(state.lastFetchedAt).getTime() >= intervalMs;
}

// The cutoff Apify should use for THIS account specifically — its own
// last real fetch, not a fixed rolling window (Daniel's explicit
// request: "el onlyPostsNewerThan debe traer la fecha de la última vez
// que se consultó esa fuente"). Falls back to DEFAULT_INTERVAL_DAYS back
// from now for an account that's never been fetched, since there's no
// real "last time" to anchor to yet.
export function accountCutoffDate(state: InstagramAccountState | undefined, now: Date): Date {
  if (state?.lastFetchedAt) return new Date(state.lastFetchedAt);
  return new Date(now.getTime() - DEFAULT_INTERVAL_DAYS * 24 * 60 * 60 * 1000);
}

// Any genuinely new post resets the zero-yield streak to 0 (never
// inactive). Nothing new just increments the streak; the 52nd
// consecutive empty week marks the account inactive.
export function nextFetchState(
  state: Pick<InstagramAccountState, "consecutiveZeroYieldWeeks"> | undefined,
  foundNewPost: boolean,
): NextFetchState {
  if (foundNewPost) {
    return { consecutiveZeroYieldWeeks: 0, isInactive: false };
  }
  const zeroStreak = (state?.consecutiveZeroYieldWeeks ?? 0) + 1;
  return { consecutiveZeroYieldWeeks: zeroStreak, isInactive: zeroStreak >= ZERO_YIELD_WEEKS_BEFORE_INACTIVE };
}

export async function recordInstagramFetchState(account: InstagramAccountConfig, now: Date, nextState: NextFetchState): Promise<void> {
  const client = getSupabaseClient();
  const { error } = await client.from("bright_source_fetch_state").upsert({
    url: instagramAccountProfileUrl(account),
    last_fetched_at: now.toISOString(),
    interval_days: DEFAULT_INTERVAL_DAYS,
    consecutive_zero_yield_at_cap: nextState.consecutiveZeroYieldWeeks,
    is_inactive: nextState.isInactive,
  });
  if (error) {
    console.error(`[instagram-discovery] failed to record fetch state for ${account.username}: ${error.message}`);
  }
}
