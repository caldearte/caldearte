import { test } from "node:test";
import assert from "node:assert/strict";
import { groupPipelineLabel, mergePipelineComparison } from "./pipelineGrouping";

test("groupPipelineLabel: bright_source and headless (MAVI) both map to 'Web'", () => {
  assert.equal(groupPipelineLabel("bright_source"), "Web");
  assert.equal(groupPipelineLabel("headless"), "Web");
});

test("groupPipelineLabel: instagram maps to 'Instagram', null maps to 'Sin atribuir'", () => {
  assert.equal(groupPipelineLabel("instagram"), "Instagram");
  assert.equal(groupPipelineLabel(null), "Sin atribuir");
});

test("groupPipelineLabel: comuna_search keeps its own label, marked inactive", () => {
  assert.match(groupPipelineLabel("comuna_search"), /inactiva/);
});

test("mergePipelineComparison: sums bright_source + headless into one 'Web' row instead of two separate rows", () => {
  const rows = mergePipelineComparison([
    { pipeline: "bright_source", accepted: 6, rejected: 93, avgCostUsdPerEvent: 0.5, totalCostUsd: 3, approvalRate: 6 / 99 },
    { pipeline: "headless", accepted: 3, rejected: 1, avgCostUsdPerEvent: 0.2, totalCostUsd: 0.6, approvalRate: 3 / 4 },
    { pipeline: "instagram", accepted: 6, rejected: 17, avgCostUsdPerEvent: 0.1, totalCostUsd: 0.6, approvalRate: 6 / 23 },
  ]);

  const web = rows.find((r) => r.label === "Web");
  assert.ok(web, "bright_source and headless merged into a single 'Web' row");
  assert.equal(web!.accepted, 9);
  assert.equal(web!.rejected, 94);
  assert.equal(web!.totalCostUsd, 3.6);
  assert.equal(web!.approvalRate, 9 / 103);

  assert.equal(rows.filter((r) => r.label === "Web").length, 1, "not two separate rows for bright_source and headless");
  const instagram = rows.find((r) => r.label === "Instagram");
  assert.ok(instagram);
  assert.equal(instagram!.accepted, 6);
});

test("mergePipelineComparison: a group with zero accepted events has a null avgCostUsdPerEvent, not a division-by-zero NaN", () => {
  const rows = mergePipelineComparison([{ pipeline: "comuna_search", accepted: 0, rejected: 0, avgCostUsdPerEvent: null, totalCostUsd: 0, approvalRate: null }]);
  assert.equal(rows[0].avgCostUsdPerEvent, null);
  assert.equal(rows[0].approvalRate, null);
});
