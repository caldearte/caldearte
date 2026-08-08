import { test } from "node:test";
import assert from "node:assert/strict";
import { buildEventJsonLd } from "./eventJsonLd";
import type { EventRecord } from "./events";

function event(overrides: Partial<EventRecord> = {}): EventRecord {
  return {
    id: "abc-123",
    title: "Muestra",
    artist: "Artista",
    description: null,
    freeformLocation: "Galería X, Santiago",
    placeName: null,
    regionName: null,
    imageUrl: null,
    openingDatetime: null,
    runStartDate: "2026-07-05",
    runEndDate: "2026-07-20",
    sensitivityTags: [],
    sourceUrl: null,
    openingTimeConfirmed: true,
    ...overrides,
  };
}

test("buildEventJsonLd: real-photo events include an image, and the address never duplicates a comuna already present in the freeform location", () => {
  const e = event({ placeName: "MAC - Parque Forestal", freeformLocation: "Talca, Región del Maule", regionName: "Talca", imageUrl: "https://example.com/real.jpg" });
  const jsonLd = buildEventJsonLd(e);
  assert.equal(jsonLd["@type"], "VisualArtsEvent");
  assert.equal(jsonLd.url, "https://www.caldearte.com/eventos/abc-123");
  assert.deepEqual(jsonLd.image, ["https://example.com/real.jpg"]);
  assert.equal(jsonLd.location.name, "MAC - Parque Forestal");
  assert.equal(jsonLd.location.address, "Talca, Región del Maule");
  assert.doesNotMatch(jsonLd.location.address, /Talca.*Talca/);
});

test("buildEventJsonLd: never fabricates an image — a placeholder-only event (no real imageUrl) omits the image field entirely", () => {
  const e = event({ imageUrl: null, sourceUrl: null });
  const jsonLd = buildEventJsonLd(e);
  assert.equal("image" in jsonLd, false);
});

test("buildEventJsonLd: an Instagram/Facebook sourceUrl without a re-hosted imageUrl is still untrusted — same rule as resolveCardImage — so no image is included", () => {
  const e = event({ imageUrl: "https://scontent.cdninstagram.com/foo.jpg", sourceUrl: "https://www.instagram.com/p/xyz" });
  const jsonLd = buildEventJsonLd(e);
  assert.equal("image" in jsonLd, false);
});

test("buildEventJsonLd: startDate/endDate come from activeRange (the same 'full run' range every other feature already derives from runStartDate/runEndDate/openingDatetime), date-only — never a fabricated hour", () => {
  const withRun = event({ openingDatetime: "2026-08-05T20:00:00.000Z", runStartDate: "2026-08-01", runEndDate: "2026-08-20" });
  assert.equal(buildEventJsonLd(withRun).startDate, "2026-08-01");
  assert.equal(buildEventJsonLd(withRun).endDate, "2026-08-20");

  const noRange = event({ openingDatetime: null, runStartDate: null, runEndDate: null });
  const jsonLd = buildEventJsonLd(noRange);
  assert.equal("startDate" in jsonLd, false);
  assert.equal("endDate" in jsonLd, false);
});

test("buildEventJsonLd: description falls back to the title when there's no real description, matching generateMetadata's own convention", () => {
  const e = event({ description: null, title: "Sín-tesis" });
  assert.equal(buildEventJsonLd(e).description, "Sín-tesis");
});
