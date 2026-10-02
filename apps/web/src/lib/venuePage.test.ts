import { test } from "node:test";
import assert from "node:assert/strict";
import { slugifyName, venueSlug, venueIdPrefixFromSlug } from "./venueSlug";
import { buildVenuePageData, findVenueBySlug, findVenueLinkForEvent, MIN_EVENTS_TO_INDEX, type VenueRecord } from "./venuePage";
import { buildVenueJsonLd, instagramProfileUrl } from "./venueJsonLd";
import type { EventRecord } from "./events";

const VENUE: VenueRecord = {
  id: "3f9a1b2c-1111-4222-8333-444455556666",
  name: "Galería Patricia Ready",
  comuna: "Vitacura",
  instagramHandle: "galeriapatriciaready",
};

function event(id: string, runStartDate: string | null, runEndDate: string | null): EventRecord {
  return {
    id,
    title: id,
    artist: null,
    description: null,
    freeformLocation: "Vitacura",
    placeName: VENUE.name,
    address: null,
    regionName: "Vitacura",
    imageUrl: null,
    openingDatetime: null,
    runStartDate,
    runEndDate,
    sensitivityTags: [],
    sourceUrl: null,
    openingTimeConfirmed: true,
    eventType: "exposicion",
  };
}

test("slugifyName strips accents, punctuation and edge dashes", () => {
  assert.equal(slugifyName("Galería Patricia Ready"), "galeria-patricia-ready");
  assert.equal(slugifyName("  MAC — Espacio Quinta Normal!! "), "mac-espacio-quinta-normal");
  assert.equal(slugifyName("Casa de la Cultura (Ñuñoa)"), "casa-de-la-cultura-nunoa");
});

test("slugifyName caps length without leaving a trailing dash", () => {
  const slug = slugifyName("a".repeat(58) + " bbbbbbbb");
  assert.ok(slug.length <= 60);
  assert.ok(!slug.endsWith("-"));
});

test("venueSlug appends the first 8 chars of the id, and falls back to the id alone for a name with no usable characters", () => {
  assert.equal(venueSlug(VENUE), "galeria-patricia-ready-3f9a1b2c");
  assert.equal(venueSlug({ id: VENUE.id, name: "¿¡?!" }), "3f9a1b2c");
});

test("venueIdPrefixFromSlug reads the trailing 8 hex chars, ignores a name that merely looks like one, rejects slugs without one", () => {
  assert.equal(venueIdPrefixFromSlug("galeria-patricia-ready-3f9a1b2c"), "3f9a1b2c");
  assert.equal(venueIdPrefixFromSlug("3f9a1b2c"), "3f9a1b2c");
  assert.equal(venueIdPrefixFromSlug("casa-abcdef12-3f9a1b2c"), "3f9a1b2c");
  assert.equal(venueIdPrefixFromSlug("galeria-patricia-ready"), null);
  assert.equal(venueIdPrefixFromSlug("galeria-3f9a1b2"), null);
});

test("findVenueBySlug resolves by id prefix even when the name part of the slug is stale (venue renamed after the link was shared)", () => {
  const other: VenueRecord = { ...VENUE, id: "aaaaaaaa-1111-4222-8333-444455556666", name: "Otra" };
  assert.equal(findVenueBySlug([other, VENUE], "nombre-viejo-3f9a1b2c")?.id, VENUE.id);
  assert.equal(findVenueBySlug([other, VENUE], "nombre-viejo-deadbeef"), undefined);
  assert.equal(findVenueBySlug([other, VENUE], "sin-prefijo"), undefined);
});

test("buildVenuePageData splits current from past at day level and orders each sensibly", () => {
  const today = "2026-10-02";
  const closedYesterday = event("closed-yesterday", "2026-09-01", "2026-10-01");
  const endsToday = event("ends-today", "2026-09-10", "2026-10-02");
  const upcomingLater = event("upcoming-later", "2026-11-05", "2026-12-20");
  const runningNow = event("running-now", "2026-09-20", "2026-11-15");
  const longPast = event("long-past", "2026-03-01", "2026-04-01");

  const data = buildVenuePageData(VENUE, [longPast, upcomingLater, closedYesterday, runningNow, endsToday], today);

  assert.deepEqual(
    data.current.map((e) => e.id),
    ["ends-today", "running-now", "upcoming-later"],
    "current: a show that closed yesterday must NOT be listed as in cartelera; ordered by start date",
  );
  assert.deepEqual(
    data.past.map((e) => e.id),
    ["closed-yesterday", "long-past"],
    "past: most recently closed first",
  );
  assert.equal(data.totalEvents, 5);
});

test("buildVenuePageData marks a venue indexable only from MIN_EVENTS_TO_INDEX events up", () => {
  assert.equal(MIN_EVENTS_TO_INDEX, 2);
  const one = buildVenuePageData(VENUE, [event("a", "2026-10-01", "2026-10-30")], "2026-10-02");
  const two = buildVenuePageData(VENUE, [event("a", "2026-10-01", "2026-10-30"), event("b", "2026-02-01", "2026-02-28")], "2026-10-02");
  assert.equal(one.indexable, false);
  assert.equal(two.indexable, true);
});

test("buildVenuePageData puts an event with no resolvable date under past instead of promising it as current", () => {
  const data = buildVenuePageData(VENUE, [event("dateless", null, null)], "2026-10-02");
  assert.equal(data.current.length, 0);
  assert.equal(data.past.length, 1);
});

test("buildVenueJsonLd only states what the catalog holds: comuna as locality, Instagram as sameAs, no fabricated street address or subtype", () => {
  const ld = buildVenueJsonLd(VENUE, "https://www.caldearte.com/espacios/galeria-patricia-ready-3f9a1b2c");
  assert.equal(ld["@type"], "Place");
  assert.deepEqual(ld.address, { "@type": "PostalAddress", addressLocality: "Vitacura", addressCountry: "CL" });
  assert.deepEqual(ld.sameAs, ["https://www.instagram.com/galeriapatriciaready/"]);

  const bare = buildVenueJsonLd({ ...VENUE, comuna: null, instagramHandle: null }, "https://www.caldearte.com/espacios/x");
  assert.deepEqual(bare.address, { "@type": "PostalAddress", addressCountry: "CL" });
  assert.equal("sameAs" in bare, false);
});

test("instagramProfileUrl percent-encodes the handle instead of trusting it", () => {
  assert.equal(instagramProfileUrl("a/b?c"), "https://www.instagram.com/a%2Fb%3Fc/");
});

test("findVenueLinkForEvent links an event to its venue's page when that page has more than this event on it", () => {
  const data = { venues: [VENUE], eventsByVenueId: { [VENUE.id]: [event("a", "2026-10-01", "2026-10-30"), event("b", "2026-02-01", "2026-02-28")] } };
  assert.deepEqual(findVenueLinkForEvent(data, "a"), { href: "/espacios/galeria-patricia-ready-3f9a1b2c", name: "Galería Patricia Ready" });
  assert.deepEqual(findVenueLinkForEvent(data, "b"), { href: "/espacios/galeria-patricia-ready-3f9a1b2c", name: "Galería Patricia Ready" });
});

test("findVenueLinkForEvent does not link when the venue's page would only list this same event (noindex, nothing to add)", () => {
  const data = { venues: [VENUE], eventsByVenueId: { [VENUE.id]: [event("only", "2026-10-01", "2026-10-30")] } };
  assert.equal(findVenueLinkForEvent(data, "only"), null);
});

test("findVenueLinkForEvent returns null for an event with no venue in the catalog yet", () => {
  const data = { venues: [VENUE], eventsByVenueId: { [VENUE.id]: [event("a", null, "2026-10-30"), event("b", null, "2026-10-30")] } };
  assert.equal(findVenueLinkForEvent(data, "not-catalogued"), null);
  assert.equal(findVenueLinkForEvent({ venues: [], eventsByVenueId: {} }, "a"), null);
});
