import { test } from "node:test";
import assert from "node:assert/strict";
import { REJECTION_AXES, REJECTION_AXIS_POLICY, TEXT_CURATION_POLICY, isRejectionAxis } from "./policy.js";

// Axis reporting (2026-09-07) — the guard is what keeps the cross-source
// safety net fail-open, so its "reject anything unexpected" behaviour is
// the property worth pinning, not the happy path.
test("isRejectionAxis accepts exactly the five documented axes", () => {
  for (const axis of REJECTION_AXES) {
    assert.equal(isRejectionAxis(axis), true, `${axis} should be recognised`);
  }
  assert.equal(REJECTION_AXES.length, 5);
});

test("isRejectionAxis rejects anything else, so an unexpected value degrades to 'no axis'", () => {
  for (const bad of ["religión", "Religion", "guerra", "", "otro", null, undefined, 3, {}, ["religion"]]) {
    assert.equal(isRejectionAxis(bad), false, `${JSON.stringify(bad)} must not be trusted as an axis`);
  }
});

test("REJECTION_AXIS_POLICY names all five values and states it never changes the decision", () => {
  for (const axis of REJECTION_AXES) {
    assert.ok(REJECTION_AXIS_POLICY.includes(`"${axis}"`), `policy text must name ${axis}`);
  }
  assert.match(REJECTION_AXIS_POLICY, /never change whether you approve or reject/);
  assert.match(REJECTION_AXIS_POLICY, /null on every approved event/);
});

test("TEXT_CURATION_POLICY is untouched by the axis-reporting addition — same four axes, same default-exclude wording", () => {
  assert.match(TEXT_CURATION_POLICY, /default-exclusion policy across four axes/);
  assert.match(TEXT_CURATION_POLICY, /the default decision is EXCLUDE/);
  assert.match(TEXT_CURATION_POLICY, /There's no middle ground/);
});
