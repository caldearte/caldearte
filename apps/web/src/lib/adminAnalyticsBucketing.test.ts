import { test } from "node:test";
import assert from "node:assert/strict";
import {
  bucketLabel,
  countActiveByPeriod,
  enumeratePeriods,
  formatPeriodLabel,
  sumFlowByPeriod,
} from "./adminAnalyticsBucketing";

test("bucketLabel: week is Monday-anchored, month/year truncate, total collapses everything", () => {
  assert.equal(bucketLabel("2026-08-14", "week"), "2026-08-10"); // Friday -> that week's Monday
  assert.equal(bucketLabel("2026-08-10", "week"), "2026-08-10"); // Monday -> itself
  assert.equal(bucketLabel("2026-08-14", "month"), "2026-08");
  assert.equal(bucketLabel("2026-08-14", "year"), "2026");
  assert.equal(bucketLabel("2026-08-14", "total"), "total");
  assert.equal(bucketLabel("2026-08-14T04:06:23.524Z", "month"), "2026-08", "handles full ISO timestamps, not just date-only strings");
});

test("enumeratePeriods: dense list from min to max, inclusive, each granularity", () => {
  assert.deepEqual(enumeratePeriods("2026-01-05", "2026-01-20", "week"), ["2026-01-05", "2026-01-12", "2026-01-19"]);
  assert.deepEqual(enumeratePeriods("2026-01-15", "2026-03-02", "month"), ["2026-01", "2026-02", "2026-03"]);
  assert.deepEqual(enumeratePeriods("2024-06-01", "2026-01-01", "year"), ["2024", "2025", "2026"]);
  assert.deepEqual(enumeratePeriods("2026-01-01", "2026-12-31", "total"), ["total"]);
});

test("sumFlowByPeriod: an item counts exactly once, in its own period, dense-filled with zeros", () => {
  const periods = enumeratePeriods("2026-08-01", "2026-08-31", "month");
  const items = [{ date: "2026-08-05" }, { date: "2026-08-20" }];
  const result = sumFlowByPeriod(items, periods, "month");
  assert.deepEqual(result, [{ period: "2026-08", group: null, count: 2 }]);
});

test("sumFlowByPeriod: groups are broken out separately, zero-filled where a group has no items in a period", () => {
  const periods = enumeratePeriods("2026-01-01", "2026-02-28", "month");
  const items = [
    { date: "2026-01-10", group: "RM" },
    { date: "2026-02-05", group: "Valparaíso" },
  ];
  const result = sumFlowByPeriod(items, periods, "month");
  const byKey = new Map(result.map((r) => [`${r.period}|${r.group}`, r.count]));
  assert.equal(byKey.get("2026-01|RM"), 1);
  assert.equal(byKey.get("2026-01|Valparaíso"), 0, "RM's period still has a zero-filled row for the other group");
  assert.equal(byKey.get("2026-02|Valparaíso"), 1);
  assert.equal(byKey.get("2026-02|RM"), 0);
});

test("countActiveByPeriod: a range counts in every period it overlaps, not just where it started", () => {
  const periods = enumeratePeriods("2026-01-01", "2026-04-30", "month");
  // Exhibition running March through... open the whole quarter.
  const ranges = [{ start: "2026-01-15", end: "2026-03-20" }];
  const result = countActiveByPeriod(ranges, periods, "month");
  const byPeriod = new Map(result.map((r) => [r.period, r.count]));
  assert.equal(byPeriod.get("2026-01"), 1, "started mid-January — active that period");
  assert.equal(byPeriod.get("2026-02"), 1, "still running, no new flow that month, but still active");
  assert.equal(byPeriod.get("2026-03"), 1, "closes mid-March — still active that period");
  assert.equal(byPeriod.get("2026-04"), 0, "already closed before April starts");
});

test("countActiveByPeriod: a range with no run_end_date is excluded, same as the public site's own exposición rule", () => {
  const periods = enumeratePeriods("2026-01-01", "2026-02-28", "month");
  const ranges = [{ start: "2026-01-05", end: null }];
  const result = countActiveByPeriod(ranges, periods, "month");
  assert.ok(result.every((r) => r.count === 0));
});

test("total granularity: sumFlowByPeriod and countActiveByPeriod both collapse to a single all-time bucket", () => {
  const items = [{ date: "2024-06-01" }, { date: "2026-08-14" }];
  const flowResult = sumFlowByPeriod(items, ["total"], "total");
  assert.deepEqual(flowResult, [{ period: "total", group: null, count: 2 }]);

  const ranges = [{ start: "2024-06-01", end: "2024-07-01" }, { start: "2026-08-01", end: "2026-09-01" }];
  const stateResult = countActiveByPeriod(ranges, ["total"], "total");
  assert.deepEqual(stateResult, [{ period: "total", group: null, count: 2 }]);
});

test("formatPeriodLabel: matches the reference charts' Spanish month'YY style, and passes week/year through readably", () => {
  assert.equal(formatPeriodLabel("2026-08", "month"), "ago'26");
  assert.equal(formatPeriodLabel("2026", "year"), "2026");
  assert.equal(formatPeriodLabel("2026-08-10", "week"), "10-ago");
  assert.equal(formatPeriodLabel("total", "total"), "Total");
});
