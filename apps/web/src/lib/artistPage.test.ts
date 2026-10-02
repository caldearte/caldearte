import { test } from "node:test";
import assert from "node:assert/strict";
import { artistSlug, entitySlug, findBySlug, venueSlug } from "./venueSlug";
import { assembleArtistData, buildArtistPageData, findArtistBySlug, isArtistIndexable, type ArtistRecord } from "./artistPage";
import { assembleVenueData, type VenueRecord } from "./venuePage";
import { groupEventsByEntity, splitCurrentAndPast } from "./catalogPage";
import { buildArtistJsonLd } from "./artistJsonLd";
import type { EventRecord } from "./events";

const ARTIST: ArtistRecord = { id: "9d8c7b6a-1111-4222-8333-444455556666", name: "Ágata M. Basáez", instagramHandle: null };
const WITH_HANDLE: ArtistRecord = { ...ARTIST, id: "11112222-1111-4222-8333-444455556666", name: "pablo lehmann", instagramHandle: "pablo_lehmann" };

function event(id: string, runStartDate: string | null, runEndDate: string | null): EventRecord {
  return {
    id,
    title: id,
    artist: null,
    description: null,
    freeformLocation: "Santiago",
    placeName: null,
    address: null,
    regionName: "Santiago",
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

test("venues and artists share one slug scheme; findBySlug resolves any entity by its id prefix", () => {
  assert.equal(entitySlug(ARTIST), "agata-m-basaez-9d8c7b6a");
  assert.equal(artistSlug(ARTIST), entitySlug(ARTIST));
  assert.equal(venueSlug(ARTIST), entitySlug(ARTIST));
  assert.equal(findBySlug([WITH_HANDLE, ARTIST], "nombre-viejo-9d8c7b6a")?.id, ARTIST.id);
  assert.equal(findArtistBySlug([ARTIST], "sin-prefijo"), undefined);
});

test("splitCurrentAndPast is day-level: a show that closed yesterday is past, one ending today is current", () => {
  const today = "2026-10-02";
  const { current, past } = splitCurrentAndPast(
    [event("closed-yesterday", "2026-09-01", "2026-10-01"), event("ends-today", "2026-09-10", "2026-10-02"), event("later", "2026-11-01", "2026-12-01")],
    today,
  );
  assert.deepEqual(current.map((e) => e.id), ["ends-today", "later"]);
  assert.deepEqual(past.map((e) => e.id), ["closed-yesterday"]);
});

test("groupEventsByEntity ignores entities that are not in the visible set, so a hidden page collects nothing", () => {
  const events = [event("a", "2026-10-01", "2026-10-30"), event("b", "2026-10-01", "2026-10-30")];
  const grouped = groupEventsByEntity(events, { a: ["visible"], b: ["hidden"] }, new Set(["visible"]));
  assert.deepEqual(Object.keys(grouped), ["visible"]);
  assert.deepEqual(grouped["visible"].map((e) => e.id), ["a"]);
});

test("assembleVenueData joins the small link table onto the shared events, and a venue absent from venues_public (hidden) gets nothing", () => {
  const visible: VenueRecord = { id: "aaaaaaaa-0000-4000-8000-000000000001", name: "Visible", comuna: null, instagramHandle: null };
  const data = assembleVenueData([visible], { a: visible.id, b: "bbbbbbbb-0000-4000-8000-000000000002" }, [event("a", null, "2026-10-30"), event("b", null, "2026-10-30")]);
  assert.deepEqual(Object.keys(data.eventsByVenueId), [visible.id]);
  assert.deepEqual(data.eventsByVenueId[visible.id].map((e) => e.id), ["a"]);
});

test("assembleArtistData handles a show with several artists and an artist with several shows", () => {
  const data = assembleArtistData(
    [ARTIST, WITH_HANDLE],
    [
      { eventId: "joint", artistId: ARTIST.id },
      { eventId: "joint", artistId: WITH_HANDLE.id },
      { eventId: "solo", artistId: ARTIST.id },
    ],
    [event("joint", null, "2026-10-30"), event("solo", null, "2026-10-30"), event("unlinked", null, "2026-10-30")],
  );
  assert.deepEqual(data.eventsByArtistId[ARTIST.id].map((e) => e.id).sort(), ["joint", "solo"]);
  assert.deepEqual(data.eventsByArtistId[WITH_HANDLE.id].map((e) => e.id), ["joint"]);
});

test("isArtistIndexable: 2+ shows OR a published handle; one show and no handle stays out of the index", () => {
  assert.equal(isArtistIndexable(ARTIST, 1), false);
  assert.equal(isArtistIndexable(ARTIST, 2), true);
  assert.equal(isArtistIndexable(WITH_HANDLE, 1), true);
});

test("buildArtistPageData carries the indexable decision and the day-level split", () => {
  const page = buildArtistPageData(ARTIST, [event("x", "2026-03-01", "2026-04-01")], "2026-10-02");
  assert.equal(page.indexable, false);
  assert.equal(page.current.length, 0);
  assert.equal(page.past.length, 1);
});

test("buildArtistJsonLd is a bare Person: name, url, and the Instagram profile only when a handle is published", () => {
  const url = "https://www.caldearte.com/artistas/agata-m-basaez-9d8c7b6a";
  assert.deepEqual(buildArtistJsonLd(ARTIST, url), { "@context": "https://schema.org", "@type": "Person", name: "Ágata M. Basáez", url });
  assert.deepEqual(buildArtistJsonLd(WITH_HANDLE, url).sameAs, ["https://www.instagram.com/pablo_lehmann/"]);
});
