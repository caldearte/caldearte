import { test } from "node:test";
import assert from "node:assert/strict";
import { isAggregatorSource } from "./known-sources.js";

test("isAggregatorSource is true for a real known aggregator domain (no fixedLocation)", () => {
  assert.equal(isAggregatorSource("https://chilecultura.gob.cl/events/12345/"), true);
  assert.equal(isAggregatorSource("https://www.arteinformado.com/agenda/f/some-exhibition-123"), true);
});

test("isAggregatorSource is false for a real single-venue source (has fixedLocation)", () => {
  assert.equal(isAggregatorSource("https://www.mnba.gob.cl/some-exhibition"), false);
  assert.equal(isAggregatorSource("https://parquecultural.cl/expo-1"), false);
  assert.equal(isAggregatorSource("https://www.mhnv.gob.cl/cartelera/some-exhibition"), false);
});

test("isAggregatorSource is false for a URL whose domain doesn't match any KNOWN_SOURCES entry — a Tavily-discovered social post is a primary post, not a re-listing", () => {
  assert.equal(isAggregatorSource("https://www.instagram.com/p/abc123/"), false);
});

test("isAggregatorSource returns false rather than throwing on an unparseable URL", () => {
  assert.equal(isAggregatorSource("not a url"), false);
});
