import { test } from "node:test";
import assert from "node:assert/strict";
import { splitApifyFreeTier } from "./apify-cost-split.js";

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

test("splitApifyFreeTier: the free tier resets at a calendar month boundary, not a rolling window", () => {
  const rows = splitApifyFreeTier(
    [
      { date: "2026-08-31", amountUsd: 5 },
      { date: "2026-09-01", amountUsd: 1 },
    ],
    5,
  );
  assert.deepEqual(rows[0], { date: "2026-08-31", freeUsd: 5, realUsd: 0 });
  assert.deepEqual(rows[1], { date: "2026-09-01", freeUsd: 1, realUsd: 0 });
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
