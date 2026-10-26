import { test } from "node:test";
import assert from "node:assert/strict";
import { events30dKpi, intentClicksKpi, outsideRmPctKpi, regionCoverage, venueKindSummary, type MisionEvent } from "./misionKpis";

const NOW = new Date("2026-10-25T15:00:00Z");
const RM = "Región Metropolitana de Santiago";

function ev(openingDate: string, adminRegionName: string | null = RM, venueKind: string | null = null, venueId: string | null = "v1"): MisionEvent {
  return { openingDate, adminRegionName, venueId, venueKind };
}

test("events30dKpi counts openings in the last 30 days (today included, future excluded) and compares against 30 days earlier", () => {
  const events = [ev("2026-10-25"), ev("2026-09-26"), ev("2026-09-25"), ev("2026-10-30"), ev("2026-09-10")];
  const kpi = events30dKpi(events, NOW);
  assert.equal(kpi.value, 2, "09-26..10-25 inclusive; 09-25 is day 31, 10-30 hasn't opened");
  // As of 09-25: window 08-27..09-25 holds 09-25 and 09-10.
  assert.equal(kpi.delta30d, 0);
  assert.equal(kpi.series.length, 90);
});

test("outsideRmPctKpi ignores events without a región and returns null with no data", () => {
  const events = [ev("2026-10-01", RM), ev("2026-10-02", "Valparaíso"), ev("2026-10-03", null)];
  assert.equal(outsideRmPctKpi(events, NOW).value, 50);
  assert.equal(outsideRmPctKpi([], NOW).value, null);
});

test("intentClicksKpi keeps Chile and missing-country clicks only", () => {
  const clicks = [
    { createdAt: "2026-10-20T10:00:00Z", country: "CL" },
    { createdAt: "2026-10-21T10:00:00Z", country: null },
    { createdAt: "2026-10-22T10:00:00Z", country: "US" },
  ];
  assert.equal(intentClicksKpi(clicks, NOW).value, 2);
});

test("venueKindSummary: shares over events with a venue, unclassified venues counted once", () => {
  const events = [
    ev("2026-10-01", RM, "institucional", "a"),
    ev("2026-10-02", RM, "independiente", "b"),
    ev("2026-10-03", RM, "independiente", "b"),
    ev("2026-10-04", RM, null, "c"),
    ev("2026-10-05", RM, null, "c"),
    ev("2026-10-06", RM, null, null),
    ev("2026-01-01", RM, "municipal", "d"),
  ];
  const s = venueKindSummary(events, NOW);
  assert.deepEqual(
    s.recent.map((r) => [r.kind, r.events, r.pct]),
    [
      ["institucional", 1, 20],
      ["municipal", 0, 0],
      ["independiente", 2, 40],
      ["sin_clasificar", 2, 40],
    ],
  );
  assert.equal(s.allTime.find((r) => r.kind === "municipal")?.events, 1);
  assert.equal(s.unclassifiedVenues, 1);
  assert.equal(s.independientePct.value, 40);
});

test("venueKindSummary drops the sin_clasificar row when everything is classified", () => {
  const s = venueKindSummary([ev("2026-10-01", RM, "municipal", "a")], NOW);
  assert.equal(s.recent.some((r) => r.kind === "sin_clasificar"), false);
  assert.equal(s.unclassifiedVenues, 0);
});

test("regionCoverage keeps every región, even with zero events", () => {
  const rows = regionCoverage([ev("2026-10-20", RM), ev("2026-08-01", "Valparaíso")], ["Valparaíso", RM, "Atacama"], NOW);
  assert.deepEqual(
    rows.map((r) => [r.adminRegionName, r.events30d, r.events90d, r.pct90d]),
    [
      ["Valparaíso", 0, 1, 50],
      [RM, 1, 1, 50],
      ["Atacama", 0, 0, 0],
    ],
  );
});
