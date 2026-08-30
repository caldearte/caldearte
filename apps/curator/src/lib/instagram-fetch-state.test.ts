import { test } from "node:test";
import assert from "node:assert/strict";
import {
  isInstagramAccountDue,
  accountCutoffDate,
  nextFetchState,
  instagramAccountProfileUrl,
  DEFAULT_INTERVAL_DAYS,
  ZERO_YIELD_CHECKS_BEFORE_INACTIVE,
} from "./instagram-fetch-state.js";
import type { InstagramAccountConfig } from "./instagram-accounts.js";

const NOW = new Date("2026-08-13T00:00:00.000Z");
const ACCOUNT: InstagramAccountConfig = { username: "some_account", note: "test", addedAt: "2026-08-12" };

test("instagramAccountProfileUrl builds the real profile URL from a username", () => {
  assert.equal(instagramAccountProfileUrl(ACCOUNT), "https://www.instagram.com/some_account/");
});

test("isInstagramAccountDue: an account never fetched before is always due", () => {
  assert.equal(isInstagramAccountDue(undefined, NOW), true);
  assert.equal(isInstagramAccountDue({ lastFetchedAt: null, consecutiveZeroYieldChecks: 0, isInactive: false }, NOW), true);
});

// No time-elapsed check anymore, 2026-08-24 — real data showed Apify's
// actor is pay-per-RESULT, not per-account-queried, so checking more
// often than any fixed window costs the same ~$0 for a quiet account (a
// zero-yield fetch returns 0 results either way). This is what makes a
// second weekly discovery cron (Wednesday, added the same day) actually
// find something: with the old 7-day window, a Wednesday run 3 days
// after Sunday's would have found every account "not due" and fetched
// nothing.
test("isInstagramAccountDue: due even moments after the last fetch, as long as it's not marked inactive", () => {
  const state = { lastFetchedAt: new Date(NOW.getTime() - 60 * 1000).toISOString(), consecutiveZeroYieldChecks: 20, isInactive: false };
  assert.equal(isInstagramAccountDue(state, NOW), true);
});

test("isInstagramAccountDue: an inactive account is never due, regardless of how long it's been", () => {
  const state = {
    lastFetchedAt: new Date(NOW.getTime() - 400 * 24 * 60 * 60 * 1000).toISOString(),
    consecutiveZeroYieldChecks: 52,
    isInactive: true,
  };
  assert.equal(isInstagramAccountDue(state, NOW), false);
});

test("accountCutoffDate uses the account's own last fetch date, not a fixed rolling window", () => {
  const lastFetchedAt = "2026-07-20T00:00:00.000Z";
  const cutoff = accountCutoffDate({ lastFetchedAt, consecutiveZeroYieldChecks: 0, isInactive: false }, NOW);
  assert.equal(cutoff.toISOString(), lastFetchedAt);
});

test("accountCutoffDate falls back to DEFAULT_INTERVAL_DAYS back from now for a never-fetched account", () => {
  const cutoff = accountCutoffDate(undefined, NOW);
  assert.equal(cutoff.getTime(), NOW.getTime() - DEFAULT_INTERVAL_DAYS * 24 * 60 * 60 * 1000);
});

test("nextFetchState resets the zero-yield streak to 0 when the account produced a genuinely new post", () => {
  assert.deepEqual(nextFetchState({ consecutiveZeroYieldChecks: 15 }, true), { consecutiveZeroYieldChecks: 0, isInactive: false });
  assert.deepEqual(nextFetchState(undefined, true), { consecutiveZeroYieldChecks: 0, isInactive: false });
});

test("nextFetchState: nothing new just increments the zero-yield streak, still active well below the inactive threshold", () => {
  assert.deepEqual(nextFetchState(undefined, false), { consecutiveZeroYieldChecks: 1, isInactive: false });
  assert.deepEqual(nextFetchState({ consecutiveZeroYieldChecks: 1 }, false), { consecutiveZeroYieldChecks: 2, isInactive: false });
  assert.deepEqual(nextFetchState({ consecutiveZeroYieldChecks: 50 }, false), { consecutiveZeroYieldChecks: 51, isInactive: false });
});

test("nextFetchState: the Nth consecutive empty check marks the account inactive", () => {
  const result = nextFetchState({ consecutiveZeroYieldChecks: ZERO_YIELD_CHECKS_BEFORE_INACTIVE - 1 }, false);
  assert.deepEqual(result, { consecutiveZeroYieldChecks: ZERO_YIELD_CHECKS_BEFORE_INACTIVE, isInactive: true });
});

test("DEFAULT_INTERVAL_DAYS is 4 — the never-fetched fallback for accountCutoffDate, matching the real worst-case Sun/Wed gap (Wed→Sun) so a newly-added account doesn't drag the shared Apify call's cutoff wider than the cadence actually needs", () => {
  assert.equal(DEFAULT_INTERVAL_DAYS, 4);
});

test("ZERO_YIELD_CHECKS_BEFORE_INACTIVE is 52 — how many checks to wait before giving up on an account, independent of how often the cron fires (reverted 2026-08-30 alongside the cadence reverting to 2x/week, ~6 months of real silence)", () => {
  assert.equal(ZERO_YIELD_CHECKS_BEFORE_INACTIVE, 52);
});
