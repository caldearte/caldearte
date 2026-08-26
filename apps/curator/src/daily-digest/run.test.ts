import { test } from "node:test";
import assert from "node:assert/strict";
import { santiagoDayBoundsUtc } from "./run.js";

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
