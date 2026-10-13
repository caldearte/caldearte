import { test } from "node:test";
import assert from "node:assert/strict";
import { isOptimizableImageUrl } from "./imageHosts";

test("isOptimizableImageUrl: allowlisted https hosts only", () => {
  assert.equal(isOptimizableImageUrl("https://static-assets.artlogic.net/w_1200/x.jpg"), true);
  assert.equal(isOptimizableImageUrl("https://g5noticias.cl/wp-content/uploads/banner.png"), false);
  assert.equal(isOptimizableImageUrl("http://static-assets.artlogic.net/x.jpg"), false);
  assert.equal(isOptimizableImageUrl("not a url"), false);
});
