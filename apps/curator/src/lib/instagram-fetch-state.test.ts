import { test } from "node:test";
import assert from "node:assert/strict";
import { isInstagramAccountDue, accountCutoffDate, nextIntervalDays, instagramAccountProfileUrl, DEFAULT_INTERVAL_DAYS } from "./instagram-fetch-state.js";
import type { InstagramAccountConfig } from "./instagram-accounts.js";

const NOW = new Date("2026-08-13T00:00:00.000Z");
const ACCOUNT: InstagramAccountConfig = { username: "some_account", note: "test", addedAt: "2026-08-12" };

test("instagramAccountProfileUrl builds the real profile URL from a username", () => {
  assert.equal(instagramAccountProfileUrl(ACCOUNT), "https://www.instagram.com/some_account/");
});

test("isInstagramAccountDue: an account never fetched before is always due", () => {
  assert.equal(isInstagramAccountDue(undefined, NOW), true);
  assert.equal(isInstagramAccountDue({ lastFetchedAt: null, intervalDays: 14 }, NOW), true);
});

test("isInstagramAccountDue: not due yet within its own interval", () => {
  const state = { lastFetchedAt: new Date(NOW.getTime() - 10 * 24 * 60 * 60 * 1000).toISOString(), intervalDays: 14 };
  assert.equal(isInstagramAccountDue(state, NOW), false);
});

test("isInstagramAccountDue: due once its own interval has elapsed — respects a longer escalated interval, not the 14-day default", () => {
  const state = { lastFetchedAt: new Date(NOW.getTime() - 20 * 24 * 60 * 60 * 1000).toISOString(), intervalDays: 28 };
  assert.equal(isInstagramAccountDue(state, NOW), false); // would be due under 14, not under its real 28
  const dueState = { lastFetchedAt: new Date(NOW.getTime() - 28 * 24 * 60 * 60 * 1000).toISOString(), intervalDays: 28 };
  assert.equal(isInstagramAccountDue(dueState, NOW), true);
});

test("accountCutoffDate uses the account's own last fetch date, not a fixed rolling window", () => {
  const lastFetchedAt = "2026-07-20T00:00:00.000Z";
  const cutoff = accountCutoffDate({ lastFetchedAt, intervalDays: 21 }, NOW);
  assert.equal(cutoff.toISOString(), lastFetchedAt);
});

test("accountCutoffDate falls back to DEFAULT_INTERVAL_DAYS back from now for a never-fetched account", () => {
  const cutoff = accountCutoffDate(undefined, NOW);
  assert.equal(cutoff.getTime(), NOW.getTime() - DEFAULT_INTERVAL_DAYS * 24 * 60 * 60 * 1000);
});

test("nextIntervalDays resets to the 14-day default when the account produced a genuinely new post", () => {
  assert.equal(nextIntervalDays(28, true), 14);
  assert.equal(nextIntervalDays(undefined, true), 14);
});

test("nextIntervalDays escalates one step (14 -> 21 -> 28) when nothing new came back", () => {
  assert.equal(nextIntervalDays(undefined, false), 21);
  assert.equal(nextIntervalDays(14, false), 21);
  assert.equal(nextIntervalDays(21, false), 28);
});

test("nextIntervalDays caps escalation at 28 — never grows unbounded", () => {
  assert.equal(nextIntervalDays(28, false), 28);
});
