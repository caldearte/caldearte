// No cadence gate for Instagram either, 2026-08-24 — same principle
// already applied to every other bright source (event-discovery/
// headless-discovery/google-alerts-discovery's own run.ts files): real
// data showed Apify's `apify/instagram-post-scraper` is pay-per-RESULT
// (~$0.0025/post), not per-account-queried, so a quiet account checked
// twice a week costs the same ~$0 as one checked once a week — a
// zero-yield fetch returns 0 results either way (verified against real
// platform_cost_snapshots data before this change, and again before
// adding the Wednesday cron in instagram-bright-sources.yml). Checking
// more often also closes a real gap: RESULTS_LIMIT_PER_ACCOUNT (5,
// apify-instagram.ts) could silently miss posts on an account that
// posted more than 5 times between checks.
//
// A dormancy backstop is kept: an account with nothing new for enough
// consecutive checks (however often the cron fires) is marked inactive
// so a genuinely dead/abandoned account doesn't get polled forever.
// Re-activating one (if it ever starts posting again) is a manual
// action, not automatic — see instagram-accounts.ts for how to do that.
// Reuses the same `interval_days`/`consecutive_zero_yield_at_cap`
// columns every bright source already has (bright_source_fetch_state) —
// interval_days is now always written as 7 for an Instagram row (purely
// for the admin dashboard's display, not read to gate anything), and
// consecutive_zero_yield_at_cap counts checks instead of cycles-at-cap;
// no migration needed, just a change in what these columns mean for this
// pipeline.
//
// The check-count threshold is deliberately tied to real elapsed time
// (~6 months of silence), not a fixed number — it's been recalculated
// twice already as the cron got more frequent (52 at weekly → ~1 year;
// 52 again at 2x/week → ~6 months) and would go stale silently otherwise.
// Bumped to 90 on 2026-08-26 when the cadence moved to every 2 days
// (~15.5 checks/month): keeping 52 would have shortened the real
// dormancy window to ~3.4 months, aggressive enough to risk marking a
// real but slow, irregularly-posting gallery inactive prematurely.
import { getSupabaseClient } from "./supabase-client.js";
import type { InstagramAccountConfig } from "./instagram-accounts.js";

export const DEFAULT_INTERVAL_DAYS = 7;
export const ZERO_YIELD_CHECKS_BEFORE_INACTIVE = 90;

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
  if (state?.lastFetchedAt) return new Date(state.lastFetchedAt);
  return new Date(now.getTime() - DEFAULT_INTERVAL_DAYS * 24 * 60 * 60 * 1000);
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
