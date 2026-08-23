import { test } from "node:test";
import assert from "node:assert/strict";
import { diversifyByComuna } from "./diversify.js";

test("diversifyByComuna: round-robins across comunas instead of taking one comuna's items first", () => {
  const events = [
    { id: "s1", comunaName: "Santiago" },
    { id: "s2", comunaName: "Santiago" },
    { id: "s3", comunaName: "Santiago" },
    { id: "v1", comunaName: "Valparaíso" },
    { id: "p1", comunaName: "Providencia" },
  ];
  const result = diversifyByComuna(events, 3);
  assert.deepEqual(
    result.map((e) => e.id),
    ["s1", "v1", "p1"],
  );
});

test("diversifyByComuna: fills later rounds from a heavy comuna once other comunas are exhausted", () => {
  const events = [
    { id: "s1", comunaName: "Santiago" },
    { id: "s2", comunaName: "Santiago" },
    { id: "s3", comunaName: "Santiago" },
    { id: "v1", comunaName: "Valparaíso" },
  ];
  const result = diversifyByComuna(events, 3);
  assert.deepEqual(
    result.map((e) => e.id),
    ["s1", "v1", "s2"],
  );
});

test("diversifyByComuna: stops early (no infinite loop) when there are fewer events than the cap", () => {
  const events = [
    { id: "a", comunaName: "X" },
    { id: "b", comunaName: "Y" },
  ];
  const result = diversifyByComuna(events, 10);
  assert.equal(result.length, 2);
});

test("diversifyByComuna: null comunaName is treated as its own bucket, not merged with others", () => {
  const events = [
    { id: "n1", comunaName: null },
    { id: "n2", comunaName: null },
    { id: "s1", comunaName: "Santiago" },
  ];
  const result = diversifyByComuna(events, 2);
  assert.deepEqual(
    result.map((e) => e.id),
    ["n1", "s1"],
  );
});
