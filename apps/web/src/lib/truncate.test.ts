import { test } from "node:test";
import assert from "node:assert/strict";
import { truncateChars } from "./truncate";

test("truncateChars: short text passes through unchanged", () => {
  assert.deepEqual(truncateChars("hola mundo", 20), { truncated: "hola mundo", wasCut: false });
});

test("truncateChars: cuts at the last full word before the limit", () => {
  assert.deepEqual(truncateChars("Balmaceda Arte Joven presenta una muestra", 25), {
    truncated: "Balmaceda Arte Joven",
    wasCut: true,
  });
});

test("truncateChars: no spaces before the limit falls back to a hard cut", () => {
  assert.deepEqual(truncateChars("Supercalifragilisticoexpialidocioso", 10), {
    truncated: "Supercalif",
    wasCut: true,
  });
});
