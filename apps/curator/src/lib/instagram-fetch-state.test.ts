import { test } from "node:test";
import assert from "node:assert/strict";
import {
  isInstagramAccountDue,
  accountCutoffDate,
  nextFetchState,
  instagramAccountProfileUrl,
  DEFAULT_INTERVAL_DAYS,
  MAX_INTERVAL_DAYS,
  SEMESTRAL_INTERVAL_DAYS,
} from "./instagram-fetch-state.js";
import type { InstagramAccountConfig } from "./instagram-accounts.js";

const NOW = new Date("2026-08-13T00:00:00.000Z");
const ACCOUNT: InstagramAccountConfig = { username: "some_account", note: "test", addedAt: "2026-08-12" };

test("instagramAccountProfileUrl builds the real profile URL from a username", () => {
  assert.equal(instagramAccountProfileUrl(ACCOUNT), "https://www.instagram.com/some_account/");
});

test("isInstagramAccountDue: an account never fetched before is always due", () => {
  assert.equal(isInstagramAccountDue(undefined, NOW), true);
  assert.equal(isInstagramAccountDue({ lastFetchedAt: null, intervalDays: 14, consecutiveZeroYieldAtCap: 0, isInactive: false }, NOW), true);
});

test("isInstagramAccountDue: not due yet within its own interval", () => {
  const state = { lastFetchedAt: new Date(NOW.getTime() - 10 * 24 * 60 * 60 * 1000).toISOString(), intervalDays: 14, consecutiveZeroYieldAtCap: 0, isInactive: false };
  assert.equal(isInstagramAccountDue(state, NOW), false);
});

test("isInstagramAccountDue: due once its own interval has elapsed — respects a longer escalated interval, not the 14-day default", () => {
  const state = { lastFetchedAt: new Date(NOW.getTime() - 20 * 24 * 60 * 60 * 1000).toISOString(), intervalDays: 28, consecutiveZeroYieldAtCap: 0, isInactive: false };
  assert.equal(isInstagramAccountDue(state, NOW), false); // would be due under 14, not under its real 28
  const dueState = { lastFetchedAt: new Date(NOW.getTime() - 28 * 24 * 60 * 60 * 1000).toISOString(), intervalDays: 28, consecutiveZeroYieldAtCap: 0, isInactive: false };
  assert.equal(isInstagramAccountDue(dueState, NOW), true);
});

test("isInstagramAccountDue: an inactive account is never due, regardless of how long it's been", () => {
  const state = {
    lastFetchedAt: new Date(NOW.getTime() - 400 * 24 * 60 * 60 * 1000).toISOString(),
    intervalDays: SEMESTRAL_INTERVAL_DAYS,
    consecutiveZeroYieldAtCap: 2,
    isInactive: true,
  };
  assert.equal(isInstagramAccountDue(state, NOW), false);
});

test("accountCutoffDate uses the account's own last fetch date, not a fixed rolling window", () => {
  const lastFetchedAt = "2026-07-20T00:00:00.000Z";
  const cutoff = accountCutoffDate({ lastFetchedAt, intervalDays: 21, consecutiveZeroYieldAtCap: 0, isInactive: false }, NOW);
  assert.equal(cutoff.toISOString(), lastFetchedAt);
});

test("accountCutoffDate falls back to DEFAULT_INTERVAL_DAYS back from now for a never-fetched account", () => {
  const cutoff = accountCutoffDate(undefined, NOW);
  assert.equal(cutoff.getTime(), NOW.getTime() - DEFAULT_INTERVAL_DAYS * 24 * 60 * 60 * 1000);
});

test("nextFetchState resets to the 14-day default, streak cleared, when the account produced a genuinely new post", () => {
  assert.deepEqual(nextFetchState({ intervalDays: 28, consecutiveZeroYieldAtCap: 2 }, true), {
    intervalDays: 14,
    consecutiveZeroYieldAtCap: 0,
    isInactive: false,
  });
  assert.deepEqual(nextFetchState(undefined, true), { intervalDays: 14, consecutiveZeroYieldAtCap: 0, isInactive: false });
});

test("nextFetchState escalates one step (14 -> 21 -> 28) when nothing new came back, below the cap", () => {
  assert.equal(nextFetchState(undefined, false).intervalDays, 21);
  assert.equal(nextFetchState({ intervalDays: 14, consecutiveZeroYieldAtCap: 0 }, false).intervalDays, 21);
  assert.equal(nextFetchState({ intervalDays: 21, consecutiveZeroYieldAtCap: 0 }, false).intervalDays, 28);
});

test("nextFetchState: at the 28-day cap, counts consecutive empty cycles and stays at 28 until the 3rd", () => {
  const first = nextFetchState({ intervalDays: 28, consecutiveZeroYieldAtCap: 0 }, false);
  assert.deepEqual(first, { intervalDays: 28, consecutiveZeroYieldAtCap: 1, isInactive: false });

  const second = nextFetchState({ intervalDays: 28, consecutiveZeroYieldAtCap: 1 }, false);
  assert.deepEqual(second, { intervalDays: 28, consecutiveZeroYieldAtCap: 2, isInactive: false });
});

test("nextFetchState: the 3rd consecutive empty cycle at the 28-day cap drops to semestral (182 days), streak reset", () => {
  const third = nextFetchState({ intervalDays: 28, consecutiveZeroYieldAtCap: 2 }, false);
  assert.deepEqual(third, { intervalDays: SEMESTRAL_INTERVAL_DAYS, consecutiveZeroYieldAtCap: 0, isInactive: false });
});

test("nextFetchState: at semestral cadence, the 1st empty semester stays semestral, not yet inactive", () => {
  const result = nextFetchState({ intervalDays: SEMESTRAL_INTERVAL_DAYS, consecutiveZeroYieldAtCap: 0 }, false);
  assert.deepEqual(result, { intervalDays: SEMESTRAL_INTERVAL_DAYS, consecutiveZeroYieldAtCap: 1, isInactive: false });
});

test("nextFetchState: the 2nd consecutive empty semester marks the account inactive", () => {
  const result = nextFetchState({ intervalDays: SEMESTRAL_INTERVAL_DAYS, consecutiveZeroYieldAtCap: 1 }, false);
  assert.deepEqual(result, { intervalDays: SEMESTRAL_INTERVAL_DAYS, consecutiveZeroYieldAtCap: 2, isInactive: true });
});

test("MAX_INTERVAL_DAYS is still 28 — the semestral path only kicks in ON TOP of the existing cap, doesn't change it", () => {
  assert.equal(MAX_INTERVAL_DAYS, 28);
});
