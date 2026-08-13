// Adaptive per-account fetch cadence for Instagram bright sources —
// distinct from the shared isSourceDue/BRIGHT_SOURCE_INTERVAL_MS every
// other bright source uses (event-discovery/run.ts). Daniel's explicit
// request (2026-08-13): a new account starts at 14 days; a fetch that
// finds nothing genuinely new for that account pushes it out to 21, then
// 28 (capped there) — an account that posts rarely shouldn't burn an
// Apify fetch every cycle for nothing. A fetch that DOES find something
// new resets the account back to 14. Stored on the same
// bright_source_fetch_state table every bright source already uses
// (interval_days column, added 20260813040000 — nullable, NULL for every
// non-Instagram row, which keeps using the shared default elsewhere).
import { getSupabaseClient } from "./supabase-client.js";
import type { InstagramAccountConfig } from "./instagram-accounts.js";

export const DEFAULT_INTERVAL_DAYS = 14;
const ESCALATION_STEP_DAYS = 7;
const MAX_INTERVAL_DAYS = 28;

export interface InstagramAccountState {
  lastFetchedAt: string | null;
  intervalDays: number;
}

export function instagramAccountProfileUrl(account: InstagramAccountConfig): string {
  return `https://www.instagram.com/${account.username}/`;
}

export async function loadInstagramFetchState(accounts: InstagramAccountConfig[]): Promise<Map<string, InstagramAccountState>> {
  const urls = accounts.map(instagramAccountProfileUrl);
  if (urls.length === 0) return new Map();

  const { data, error } = await getSupabaseClient()
    .from("bright_source_fetch_state")
    .select("url, last_fetched_at, interval_days")
    .in("url", urls);

  if (error) {
    throw new Error(`Failed to load Instagram fetch state: ${error.message}`);
  }

  return new Map(
    (data ?? []).map((row) => [row.url, { lastFetchedAt: row.last_fetched_at, intervalDays: row.interval_days ?? DEFAULT_INTERVAL_DAYS }]),
  );
}

export function isInstagramAccountDue(state: InstagramAccountState | undefined, now: Date): boolean {
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

// Reset to the 14-day default when the account produced at least one
// genuinely new (not-previously-seen) post this run; otherwise escalate
// one step (capped at 28).
export function nextIntervalDays(currentIntervalDays: number | undefined, foundNewPost: boolean): number {
  if (foundNewPost) return DEFAULT_INTERVAL_DAYS;
  const current = currentIntervalDays ?? DEFAULT_INTERVAL_DAYS;
  return Math.min(current + ESCALATION_STEP_DAYS, MAX_INTERVAL_DAYS);
}

export async function recordInstagramFetchState(account: InstagramAccountConfig, now: Date, intervalDays: number): Promise<void> {
  const client = getSupabaseClient();
  const { error } = await client
    .from("bright_source_fetch_state")
    .upsert({ url: instagramAccountProfileUrl(account), last_fetched_at: now.toISOString(), interval_days: intervalDays });
  if (error) {
    console.error(`[instagram-discovery] failed to record fetch state for ${account.username}: ${error.message}`);
  }
}
