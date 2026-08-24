import { test } from "node:test";
import assert from "node:assert/strict";
import {
  isInstagramAccountDue,
  accountCutoffDate,
  nextFetchState,
  instagramAccountProfileUrl,
  DEFAULT_INTERVAL_DAYS,
  ZERO_YIELD_WEEKS_BEFORE_INACTIVE,
} from "./instagram-fetch-state.js";
import type { InstagramAccountConfig } from "./instagram-accounts.js";

const NOW = new Date("2026-08-13T00:00:00.000Z");
const ACCOUNT: InstagramAccountConfig = { username: "some_account", note: "test", addedAt: "2026-08-12" };

test("instagramAccountProfileUrl builds the real profile URL from a username", () => {
  assert.equal(instagramAccountProfileUrl(ACCOUNT), "https://www.instagram.com/some_account/");
});

test("isInstagramAccountDue: an account never fetched before is always due", () => {
  assert.equal(isInstagramAccountDue(undefined, NOW), true);
  assert.equal(isInstagramAccountDue({ lastFetchedAt: null, consecutiveZeroYieldWeeks: 0, isInactive: false }, NOW), true);
});

test("isInstagramAccountDue: not due yet within the 7-day window", () => {
  const state = { lastFetchedAt: new Date(NOW.getTime() - 5 * 24 * 60 * 60 * 1000).toISOString(), consecutiveZeroYieldWeeks: 0, isInactive: false };
  assert.equal(isInstagramAccountDue(state, NOW), false);
});

// Real bug that motivated dropping the escalating ladder, 2026-08-24:
// Apify's actor is pay-per-RESULT, not per-account-queried, so a quiet
// account checked weekly costs the same ~$0 as one checked every 28
// days (a zero-yield fetch returns 0 results either way). Every account
// now uses the same flat 7-day window, regardless of history.
test("isInstagramAccountDue: due once 7 days have elapsed, even for an account with a long zero-yield streak", () => {
  const state = { lastFetchedAt: new Date(NOW.getTime() - 6 * 24 * 60 * 60 * 1000).toISOString(), consecutiveZeroYieldWeeks: 20, isInactive: false };
  assert.equal(isInstagramAccountDue(state, NOW), false);
  const dueState = { lastFetchedAt: new Date(NOW.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString(), consecutiveZeroYieldWeeks: 20, isInactive: false };
  assert.equal(isInstagramAccountDue(dueState, NOW), true);
});

test("isInstagramAccountDue: an inactive account is never due, regardless of how long it's been", () => {
  const state = {
    lastFetchedAt: new Date(NOW.getTime() - 400 * 24 * 60 * 60 * 1000).toISOString(),
    consecutiveZeroYieldWeeks: 52,
    isInactive: true,
  };
  assert.equal(isInstagramAccountDue(state, NOW), false);
});

test("accountCutoffDate uses the account's own last fetch date, not a fixed rolling window", () => {
  const lastFetchedAt = "2026-07-20T00:00:00.000Z";
  const cutoff = accountCutoffDate({ lastFetchedAt, consecutiveZeroYieldWeeks: 0, isInactive: false }, NOW);
  assert.equal(cutoff.toISOString(), lastFetchedAt);
});

test("accountCutoffDate falls back to DEFAULT_INTERVAL_DAYS back from now for a never-fetched account", () => {
  const cutoff = accountCutoffDate(undefined, NOW);
  assert.equal(cutoff.getTime(), NOW.getTime() - DEFAULT_INTERVAL_DAYS * 24 * 60 * 60 * 1000);
});

test("nextFetchState resets the zero-yield streak to 0 when the account produced a genuinely new post", () => {
  assert.deepEqual(nextFetchState({ consecutiveZeroYieldWeeks: 15 }, true), { consecutiveZeroYieldWeeks: 0, isInactive: false });
  assert.deepEqual(nextFetchState(undefined, true), { consecutiveZeroYieldWeeks: 0, isInactive: false });
});

test("nextFetchState: nothing new just increments the zero-yield streak, still active well below the inactive threshold", () => {
  assert.deepEqual(nextFetchState(undefined, false), { consecutiveZeroYieldWeeks: 1, isInactive: false });
  assert.deepEqual(nextFetchState({ consecutiveZeroYieldWeeks: 1 }, false), { consecutiveZeroYieldWeeks: 2, isInactive: false });
  assert.deepEqual(nextFetchState({ consecutiveZeroYieldWeeks: 50 }, false), { consecutiveZeroYieldWeeks: 51, isInactive: false });
});

test("nextFetchState: the 52nd consecutive empty week (a full year of weekly checks) marks the account inactive", () => {
  const result = nextFetchState({ consecutiveZeroYieldWeeks: ZERO_YIELD_WEEKS_BEFORE_INACTIVE - 1 }, false);
  assert.deepEqual(result, { consecutiveZeroYieldWeeks: ZERO_YIELD_WEEKS_BEFORE_INACTIVE, isInactive: true });
});

test("DEFAULT_INTERVAL_DAYS is 7 — flat weekly cadence for every account, no escalation", () => {
  assert.equal(DEFAULT_INTERVAL_DAYS, 7);
});

test("ZERO_YIELD_WEEKS_BEFORE_INACTIVE is 52 — a full year of weekly checks before giving up on an account", () => {
  assert.equal(ZERO_YIELD_WEEKS_BEFORE_INACTIVE, 52);
});
