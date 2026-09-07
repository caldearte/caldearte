import { test } from "node:test";
import assert from "node:assert/strict";
import { splitApifyFreeTier, apifyCycleStart } from "./apifyCostSplit";

test("splitApifyFreeTier: entirely within the free tier all month — every day fully free, zero real", () => {
  const rows = splitApifyFreeTier(
    [
      { date: "2026-08-01", amountUsd: 1 },
      { date: "2026-08-02", amountUsd: 2 },
    ],
    5,
  );
  assert.deepEqual(rows, [
    { date: "2026-08-01", freeUsd: 1, realUsd: 0 },
    { date: "2026-08-02", freeUsd: 2, realUsd: 0 },
  ]);
});

test("splitApifyFreeTier: the day that crosses the free-tier threshold is split between free and real", () => {
  const rows = splitApifyFreeTier(
    [
      { date: "2026-08-01", amountUsd: 1 },
      { date: "2026-08-02", amountUsd: 2 },
      { date: "2026-08-03", amountUsd: 4 },
    ],
    5,
  );
  assert.deepEqual(rows[2], { date: "2026-08-03", freeUsd: 2, realUsd: 2 });
});

test("splitApifyFreeTier: once the free tier is already exhausted, a day is entirely real", () => {
  const rows = splitApifyFreeTier(
    [
      { date: "2026-08-01", amountUsd: 6 },
      { date: "2026-08-02", amountUsd: 3 },
    ],
    5,
  );
  assert.deepEqual(rows[0], { date: "2026-08-01", freeUsd: 5, realUsd: 1 });
  assert.deepEqual(rows[1], { date: "2026-08-02", freeUsd: 0, realUsd: 3 });
});

test("splitApifyFreeTier: the free tier resets at the billing anniversary, not the 1st of the month", () => {
  const rows = splitApifyFreeTier(
    [
      { date: "2026-08-12", amountUsd: 5 },
      { date: "2026-08-13", amountUsd: 1 },
    ],
    5,
  );
  assert.deepEqual(rows[0], { date: "2026-08-12", freeUsd: 5, realUsd: 0 });
  assert.deepEqual(rows[1], { date: "2026-08-13", freeUsd: 1, realUsd: 0 });
});

// The bug this file's anchor was introduced to fix: with calendar-month
// bucketing the Sep 1 day reset the running total and came back "free",
// hiding that the cycle opened 2026-08-13 was already exhausted.
test("splitApifyFreeTier: a calendar-month boundary INSIDE a cycle does not reset the free tier", () => {
  const rows = splitApifyFreeTier(
    [
      { date: "2026-08-30", amountUsd: 5 },
      { date: "2026-09-01", amountUsd: 1 },
    ],
    5,
  );
  assert.deepEqual(rows[0], { date: "2026-08-30", freeUsd: 5, realUsd: 0 });
  assert.deepEqual(rows[1], { date: "2026-09-01", freeUsd: 0, realUsd: 1 });
});

test("apifyCycleStart: a date on or after the anchor opens this month's cycle", () => {
  assert.equal(apifyCycleStart(new Date("2026-09-13T00:00:00Z")), "2026-09-13");
  assert.equal(apifyCycleStart(new Date("2026-09-30T23:00:00Z")), "2026-09-13");
});

test("apifyCycleStart: a date before the anchor still belongs to last month's cycle", () => {
  assert.equal(apifyCycleStart(new Date("2026-09-06T00:00:00Z")), "2026-08-13");
  assert.equal(apifyCycleStart(new Date("2026-09-12T23:59:59Z")), "2026-08-13");
});

test("apifyCycleStart: crossing a year boundary rolls back to December", () => {
  assert.equal(apifyCycleStart(new Date("2027-01-05T00:00:00Z")), "2026-12-13");
});

test("apifyCycleStart: an anchor past the end of a short month clamps to its last day", () => {
  assert.equal(apifyCycleStart(new Date("2027-03-10T00:00:00Z"), 31), "2027-02-28");
});

test("splitApifyFreeTier: sorts by date first, independent of input order", () => {
  const rows = splitApifyFreeTier(
    [
      { date: "2026-08-02", amountUsd: 2 },
      { date: "2026-08-01", amountUsd: 1 },
    ],
    5,
  );
  assert.deepEqual(
    rows.map((r) => r.date),
    ["2026-08-01", "2026-08-02"],
  );
});
