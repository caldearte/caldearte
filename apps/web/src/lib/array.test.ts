import { test } from "node:test";
import assert from "node:assert/strict";
import { chunk } from "./array";

test("chunk: splits into equal-size groups, last group holds the remainder", () => {
  assert.deepEqual(chunk([1, 2, 3, 4, 5], 2), [[1, 2], [3, 4], [5]]);
});

test("chunk: size >= length returns a single group", () => {
  assert.deepEqual(chunk([1, 2], 5), [[1, 2]]);
});

test("chunk: empty input returns no groups", () => {
  assert.deepEqual(chunk([], 3), []);
});
