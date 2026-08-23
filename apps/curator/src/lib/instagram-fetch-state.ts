// Adaptive per-account fetch cadence for Instagram bright sources —
// distinct from the shared isSourceDue/BRIGHT_SOURCE_INTERVAL_MS every
// other bright source uses (event-discovery/run.ts). Ladder: a new
// account starts at 7 days; a fetch that finds nothing genuinely new for
// that account pushes it out one step (7 -> 14 -> 21 -> 28, capped there)
// — an account that posts rarely shouldn't burn an Apify fetch every
// cycle for nothing. A fetch that DOES find something new resets the
// account back to 7. Stored on the same bright_source_fetch_state table
// every bright source already uses (interval_days column, added
// 20260813040000 — nullable, NULL for every non-Instagram row, which
// keeps using the shared default elsewhere).
//
// Floor lowered 14 -> 7 days, 2026-08-23 (Daniel's explicit request,
// after the first real Sunday run only found 2 inauguraciones nationwide
// — the 14-day floor was suspected of missing real posts, not just
// costing more to check sooner). ESCALATION_STEP_DAYS/MAX_INTERVAL_DAYS
// unchanged (still 7 and 28) — lowering only the floor keeps the ladder's
// step size consistent (7 -> 14 -> 21 -> 28) rather than needing a new
// step value. Every account's stored interval_days was shifted down by
// one step (14->7, 21->14, 28 unchanged) the same day, in the same
// migration that lowered DEFAULT_INTERVAL_DAYS — see
// supabase/migrations/ for the exact statement.
//
// Extended 2026-08-15 with a dormancy path (Daniel's explicit request,
// given right after reviewing several IG accounts worth adding despite
// low current density): 3 consecutive empty cycles AT the 28-day cap
// drops the account to a 182-day ("semestral") cadence; 2 consecutive
// empty semesters at THAT cadence marks it inactive — never
// automatically fetched again (see isInstagramAccountDue). This is what
// makes it safe to add a "good venue, currently quiet" account rather
// than only ones already posting often: cost decays on its own instead
// of burning an Apify fetch indefinitely on a dead account.
import { getSupabaseClient } from "./supabase-client.js";
import type { InstagramAccountConfig } from "./instagram-accounts.js";

export const DEFAULT_INTERVAL_DAYS = 7;
const ESCALATION_STEP_DAYS = 7;
export const MAX_INTERVAL_DAYS = 28;
export const SEMESTRAL_INTERVAL_DAYS = 182;
export const ZERO_YIELD_CYCLES_BEFORE_SEMESTRAL = 3;
export const ZERO_YIELD_SEMESTERS_BEFORE_INACTIVE = 2;

export interface InstagramAccountState {
  lastFetchedAt: string | null;
  intervalDays: number;
  consecutiveZeroYieldAtCap: number;
  isInactive: boolean;
}

export interface NextFetchState {
  intervalDays: number;
  consecutiveZeroYieldAtCap: number;
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
    .select("url, last_fetched_at, interval_days, consecutive_zero_yield_at_cap, is_inactive")
    .in("url", urls);

  if (error) {
    throw new Error(`Failed to load Instagram fetch state: ${error.message}`);
  }

  return new Map(
    (data ?? []).map((row) => [
      row.url,
      {
        lastFetchedAt: row.last_fetched_at,
        intervalDays: row.interval_days ?? DEFAULT_INTERVAL_DAYS,
        consecutiveZeroYieldAtCap: row.consecutive_zero_yield_at_cap ?? 0,
        isInactive: row.is_inactive ?? false,
      },
    ]),
  );
}

// An inactive account is never due — the whole point of the dormancy
// path above is to stop paying for Apify fetches on an account that's
// shown nothing for a full year+ at the slowest cadence. Re-activating
// one (if it ever starts posting again) is a manual action, not
// automatic — see instagram-accounts.ts for how to do that.
export function isInstagramAccountDue(state: InstagramAccountState | undefined, now: Date): boolean {
  if (state?.isInactive) return false;
  if (!state?.lastFetchedAt) return true;
  const intervalMs = state.intervalDays * 24 * 60 * 60 * 1000;
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

// The full cadence state machine:
// - Any genuinely new post -> reset all the way back to 7 days, streak
//   cleared, never inactive.
// - Nothing new, still below the 28-day cap -> plain +7 step (7 -> 14 ->
//   21 -> 28).
// - Nothing new, AT the 28-day cap -> count the empty streak; the 3rd
//   consecutive empty cycle at this cap drops to the 182-day semestral
//   cadence (streak resets for the new tier).
// - Nothing new, AT the semestral cadence -> count the empty streak; the
//   2nd consecutive empty semester marks the account inactive (cadence
//   itself stays at 182 — isInstagramAccountDue is what actually stops
//   fetching it, not the interval).
export function nextFetchState(
  state: Pick<InstagramAccountState, "intervalDays" | "consecutiveZeroYieldAtCap"> | undefined,
  foundNewPost: boolean,
): NextFetchState {
  if (foundNewPost) {
    return { intervalDays: DEFAULT_INTERVAL_DAYS, consecutiveZeroYieldAtCap: 0, isInactive: false };
  }

  const currentInterval = state?.intervalDays ?? DEFAULT_INTERVAL_DAYS;

  if (currentInterval < MAX_INTERVAL_DAYS) {
    return { intervalDays: Math.min(currentInterval + ESCALATION_STEP_DAYS, MAX_INTERVAL_DAYS), consecutiveZeroYieldAtCap: 0, isInactive: false };
  }

  if (currentInterval === MAX_INTERVAL_DAYS) {
    const zeroStreak = (state?.consecutiveZeroYieldAtCap ?? 0) + 1;
    if (zeroStreak >= ZERO_YIELD_CYCLES_BEFORE_SEMESTRAL) {
      return { intervalDays: SEMESTRAL_INTERVAL_DAYS, consecutiveZeroYieldAtCap: 0, isInactive: false };
    }
    return { intervalDays: MAX_INTERVAL_DAYS, consecutiveZeroYieldAtCap: zeroStreak, isInactive: false };
  }

  // Already at semestral cadence.
  const zeroStreak = (state?.consecutiveZeroYieldAtCap ?? 0) + 1;
  return { intervalDays: SEMESTRAL_INTERVAL_DAYS, consecutiveZeroYieldAtCap: zeroStreak, isInactive: zeroStreak >= ZERO_YIELD_SEMESTERS_BEFORE_INACTIVE };
}

export async function recordInstagramFetchState(account: InstagramAccountConfig, now: Date, nextState: NextFetchState): Promise<void> {
  const client = getSupabaseClient();
  const { error } = await client.from("bright_source_fetch_state").upsert({
    url: instagramAccountProfileUrl(account),
    last_fetched_at: now.toISOString(),
    interval_days: nextState.intervalDays,
    consecutive_zero_yield_at_cap: nextState.consecutiveZeroYieldAtCap,
    is_inactive: nextState.isInactive,
  });
  if (error) {
    console.error(`[instagram-discovery] failed to record fetch state for ${account.username}: ${error.message}`);
  }
}
