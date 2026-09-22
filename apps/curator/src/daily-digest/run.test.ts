import { test } from "node:test";
import assert from "node:assert/strict";
import { santiagoDayBoundsUtc, waitForInstagramRun } from "./run.js";

test("santiagoDayBoundsUtc: returns the Santiago calendar date and a 1-day UTC window for it", () => {
  const { dateStr, startUtc, endUtc } = santiagoDayBoundsUtc(new Date("2026-08-26T15:00:00.000Z"));
  assert.equal(dateStr, "2026-08-26");
  assert.equal(startUtc.toISOString(), "2026-08-26T00:00:00.000Z");
  assert.equal(endUtc.toISOString(), "2026-08-27T00:00:00.000Z");
});

test("santiagoDayBoundsUtc: a UTC instant that's still the PREVIOUS day in Santiago (early UTC morning) resolves to the earlier date", () => {
  // Santiago is behind UTC — 02:00 UTC is still the evening before in Santiago.
  const { dateStr } = santiagoDayBoundsUtc(new Date("2026-08-26T02:00:00.000Z"));
  assert.equal(dateStr, "2026-08-25");
});

// GitHub delays every scheduled workflow in this repo by 4-7 h, and the
// digest only survives because it drifts alongside the Instagram run —
// 84 minutes apart on 2026-09-19. These cover the wait that removes the
// race (see run.ts's own comment).
test("waitForInstagramRun returns immediately when the run is already recorded", async () => {
  let calls = 0;
  let slept = 0;
  const found = await waitForInstagramRun(
    async () => {
      calls += 1;
      return true;
    },
    { timeoutMs: 90 * 60_000, pollMs: 5 * 60_000, sleepFn: async (ms) => { slept += ms; }, nowFn: () => 0 },
  );
  assert.equal(found, true);
  assert.equal(calls, 1);
  assert.equal(slept, 0, "must not sleep when the run is already there");
});

test("waitForInstagramRun polls until the run appears", async () => {
  let calls = 0;
  let clock = 0;
  const found = await waitForInstagramRun(
    async () => {
      calls += 1;
      return calls >= 3;
    },
    { timeoutMs: 90 * 60_000, pollMs: 5 * 60_000, sleepFn: async (ms) => { clock += ms; }, nowFn: () => clock },
  );
  assert.equal(found, true);
  assert.equal(calls, 3);
  assert.equal(clock, 10 * 60_000, "two waits of 5 minutes");
});

test("waitForInstagramRun gives up after the timeout and reports it never showed up", async () => {
  let clock = 0;
  let calls = 0;
  const found = await waitForInstagramRun(
    async () => {
      calls += 1;
      return false;
    },
    { timeoutMs: 20 * 60_000, pollMs: 5 * 60_000, sleepFn: async (ms) => { clock += ms; }, nowFn: () => clock },
  );
  assert.equal(found, false);
  assert.equal(clock, 20 * 60_000);
  assert.equal(calls, 5, "checks at 0, 5, 10, 15 and 20 minutes, then gives up");
});
