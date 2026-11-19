import { test } from "node:test";
import assert from "node:assert/strict";
import { run, toCostSnapshotRows } from "./run.js";

// Real response shape, confirmed against Apify's own docs (2026-08-15).
const REAL_SHAPE_RESPONSE = {
  data: {
    totalUsageCreditsUsdAfterVolumeDiscount: 0.786143673840067,
    dailyServiceUsages: [
      { date: "2026-08-14T00:00:00.000Z", totalUsageCreditsUsd: 0.0474385791970591 },
      { date: "2026-08-15T00:00:00.000Z", totalUsageCreditsUsd: 1.6612 },
    ],
  },
};

test("toCostSnapshotRows shapes each day into an upsertable row, date truncated to YYYY-MM-DD", () => {
  const rows = toCostSnapshotRows(REAL_SHAPE_RESPONSE);
  assert.deepEqual(rows, [
    { platform: "apify", usage_date: "2026-08-14", amount_usd: 0.0474385791970591, raw: REAL_SHAPE_RESPONSE.data.dailyServiceUsages[0] },
    { platform: "apify", usage_date: "2026-08-15", amount_usd: 1.6612, raw: REAL_SHAPE_RESPONSE.data.dailyServiceUsages[1] },
  ]);
});

test("toCostSnapshotRows returns an empty array when dailyServiceUsages is empty", () => {
  const rows = toCostSnapshotRows({ data: { totalUsageCreditsUsdAfterVolumeDiscount: 0, dailyServiceUsages: [] } });
  assert.deepEqual(rows, []);
});

test("run sets a failing exit code when Apify answers with an HTTP error (revoked token, 2026-11-12)", async (t) => {
  const prevToken = process.env.APIFY_TOKEN;
  const prevExit = process.exitCode;
  process.env.APIFY_TOKEN = "test-token";
  t.mock.method(globalThis, "fetch", async () => new Response("{}", { status: 401 }));
  t.mock.method(console, "error", () => {});
  try {
    await run();
    assert.equal(process.exitCode, 1);
  } finally {
    process.exitCode = prevExit;
    if (prevToken === undefined) delete process.env.APIFY_TOKEN;
    else process.env.APIFY_TOKEN = prevToken;
  }
});
