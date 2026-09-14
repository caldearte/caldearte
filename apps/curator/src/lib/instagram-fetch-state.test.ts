import { test } from "node:test";
import assert from "node:assert/strict";
import {
  MAX_LOOKBACK_DAYS,
  groupAccountsByCutoff,
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
  const lastFetchedAt = "2026-08-10T00:00:00.000Z";
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

test("DEFAULT_INTERVAL_DAYS is 4 — the first window for an account never fetched before (no longer shared with anyone else's call since groupAccountsByCutoff)", () => {
  assert.equal(DEFAULT_INTERVAL_DAYS, 4);
});

test("ZERO_YIELD_CHECKS_BEFORE_INACTIVE is 156 — ~6 months of real silence at the daily Mon-Sat cadence (6 checks/week × 26 weeks), recalculated 2026-09-13 with the cadence change", () => {
  assert.equal(ZERO_YIELD_CHECKS_BEFORE_INACTIVE, 156);
});

// Daniel's rule, 2026-09-13, after a 2-week Apify outage: never look back
// more than 7 days, whatever last_fetched_at says. Posts older than that
// only yield expos (which the calendar doesn't prioritise) and
// inauguraciones that already happened and expire anyway.
test("accountCutoffDate caps the lookback at MAX_LOOKBACK_DAYS even when the last fetch is much older", () => {
  const cutoff = accountCutoffDate({ lastFetchedAt: "2026-07-30T00:00:00.000Z", consecutiveZeroYieldChecks: 0, isInactive: false }, NOW);
  assert.equal(cutoff.getTime(), NOW.getTime() - MAX_LOOKBACK_DAYS * 24 * 60 * 60 * 1000);
});

test("accountCutoffDate: a last fetch within the cap is used as-is (the cap never widens a window)", () => {
  const lastFetchedAt = "2026-08-12T00:00:00.000Z";
  assert.equal(accountCutoffDate({ lastFetchedAt, consecutiveZeroYieldChecks: 0, isInactive: false }, NOW).toISOString(), lastFetchedAt);
});

// Real re-billing this replaces: one shared Apify call with the OLDEST
// cutoff among all accounts — 2026-08-26: 93 of 145 fetched posts were
// already seen (a new account's wider window applied to everyone).
test("groupAccountsByCutoff: accounts fetched the same day share one call; a new account and a lagging one get their own", () => {
  const fetchedYesterday = { ...ACCOUNT, username: "a_yesterday" };
  const fetchedYesterdayToo = { ...ACCOUNT, username: "b_yesterday" };
  const fetchedTwoDaysAgo = { ...ACCOUNT, username: "c_two_days" };
  const brandNew = { ...ACCOUNT, username: "d_new" };
  const laggingAfterOutage = { ...ACCOUNT, username: "e_lagging" };
  const state = (lastFetchedAt: string) => ({ lastFetchedAt, consecutiveZeroYieldChecks: 0, isInactive: false });
  const fetchState = new Map([
    [instagramAccountProfileUrl(fetchedYesterday), state("2026-08-12T09:00:00.000Z")],
    [instagramAccountProfileUrl(fetchedYesterdayToo), state("2026-08-12T09:05:00.000Z")],
    [instagramAccountProfileUrl(fetchedTwoDaysAgo), state("2026-08-11T09:00:00.000Z")],
    [instagramAccountProfileUrl(laggingAfterOutage), state("2026-07-20T09:00:00.000Z")],
  ]);
  const groups = groupAccountsByCutoff([fetchedYesterday, fetchedYesterdayToo, fetchedTwoDaysAgo, brandNew, laggingAfterOutage], fetchState, NOW);
  assert.deepEqual(
    groups.map((g) => ({ cutoff: g.onlyPostsNewerThan, accounts: g.accounts.map((a) => a.username) })),
    [
      { cutoff: "2026-08-06", accounts: ["e_lagging"] }, // capped at 7 days, not 2026-07-20
      { cutoff: "2026-08-09", accounts: ["d_new"] }, // DEFAULT_INTERVAL_DAYS
      { cutoff: "2026-08-11", accounts: ["c_two_days"] },
      { cutoff: "2026-08-12", accounts: ["a_yesterday", "b_yesterday"] },
    ],
  );
});

test("groupAccountsByCutoff: a normal run (everyone fetched the same day) is still a single call", () => {
  const accounts = ["x", "y", "z"].map((u) => ({ ...ACCOUNT, username: u }));
  const fetchState = new Map(accounts.map((a) => [instagramAccountProfileUrl(a), { lastFetchedAt: "2026-08-12T08:17:00.000Z", consecutiveZeroYieldChecks: 0, isInactive: false }]));
  const groups = groupAccountsByCutoff(accounts, fetchState, NOW);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].accounts.length, 3);
});
