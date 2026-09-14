import { test } from "node:test";
import assert from "node:assert/strict";
import { qualityLabel } from "./TopSourcesTable";

// Real case, 2026-09-14: artes.uchile.cl/agenda/30dias read 42% (10/24)
// while 9 of its 14 rejections were duplicate re-listings of the rolling
// agenda — its real content approval is 10/15.
test("qualityLabel excludes duplicate rejections from the denominator and shows them apart", () => {
  assert.equal(qualityLabel(10, 14, 9), "67% aprobación (10/15) · 9 dup.");
});

test("qualityLabel without duplicates is unchanged; a payload from an older Edge Function (no field) too", () => {
  assert.equal(qualityLabel(39, 37), "51% aprobación (39/76)");
  assert.equal(qualityLabel(39, 37, 0), "51% aprobación (39/76)");
});

test("qualityLabel: duplicates can never exceed rejections, and an all-duplicate source with no approvals reads as no data", () => {
  assert.equal(qualityLabel(0, 3, 5), "Sin datos aún");
  assert.equal(qualityLabel(0, 0), "Sin datos aún");
});
