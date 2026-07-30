import { test } from "node:test";
import assert from "node:assert/strict";
import { requestPreciseCityId } from "./geolocation.js";

// Node's test environment has no navigator.geolocation — this is exactly
// the "unsupported" branch real old/locked-down browsers hit too, so it
// doubles as a regression guard for that no-op path.
test("requestPreciseCityId no-ops (never calls the callback) when geolocation isn't available", () => {
  let called = false;
  requestPreciseCityId([], () => {
    called = true;
  });
  assert.equal(called, false);
});
