// The site search (2026-10-13): one box that reaches everything Caldearte
// has — places (región / comuna), venues, artists and every event, past
// ones included (Daniel: "poder llegar desde el buscador a todo el
// contenido disponible"). Pure functions only, so SearchPanel and the
// tests share them; client-safe (no Supabase, no unstable_cache).

import { regionIdFromAdminRegionName } from "./cities";
import { eventComuna } from "./event-utils";
import type { EventRecord } from "./events";
import { santiagoDateOfIso } from "./date";
import { shortRegionName } from "./regionNames";

export interface SearchEntity {
  name: string;
  href: string;
  // Short line under the name: a venue's comuna.
  meta: string | null;
  // Shows registered for it.
  count: number;
}

export interface SearchPlace {
  regionId: string;
  // Short región name ("Valparaíso", "Metropolitana").
  regionName: string;
  // Set on a comuna row ("Villa Alemana"); null on the región's own row.
  comuna: string | null;
  // The región's full name, also searched on its own row ("metropolitana"
  // finds "Región Metropolitana de Santiago", shown short as "Santiago").
  fullName?: string;
}

// What /api/search-index serves: everything the box can find.
export interface SearchIndex {
  events: EventRecord[];
  venues: SearchEntity[];
  artists: SearchEntity[];
  places: SearchPlace[];
}

export type SearchGroup =
  | { kind: "places"; best: number; items: SearchPlace[] }
  | { kind: "venues"; best: number; items: SearchEntity[] }
  | { kind: "artists"; best: number; items: SearchEntity[] }
  | { kind: "events"; best: number; items: EventRecord[] };

// Below this many characters only places, venues and artists whose name
// starts with what was typed are offered — with "ga" every event would
// match something and the list would be noise.
export const MIN_QUERY_FOR_EVENTS = 3;

function stripAccents(text: string): string {
  return text.normalize("NFD").replace(/[̀-ͯ]/g, "");
}

export function normalizeSearch(text: string): string {
  return stripAccents(text.toLowerCase()).replace(/\s+/g, " ").trim();
}

function startsAWord(t: string, q: string): boolean {
  return new RegExp(`(^|[^a-z0-9ñ])${q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`).test(t);
}

// How well `text` matches `query`, lower is better, null = no match:
// 0 the whole text, 1 the text starts with it, 2 a word in it starts with
// it, 3 anywhere — or, for a query of several words, each of them starting
// a word somewhere, in any order ("materia juvenil" finds "MATERIA:
// Encuentro Juvenil de Artes Visuales", 2026-10-28). Accent- and
// case-insensitive.
export function rankText(text: string | null, query: string): number | null {
  if (!text) return null;
  const t = normalizeSearch(text);
  const q = normalizeSearch(query);
  if (!q) return null;
  if (t === q) return 0;
  if (t.startsWith(q)) return 1;
  if (startsAWord(t, q)) return 2;
  if (t.includes(q)) return 3;
  const words = q.split(" ");
  if (words.length > 1 && words.every((w) => startsAWord(t, w))) return 3;
  return null;
}

function best(...ranks: (number | null)[]): number | null {
  const real = ranks.filter((r): r is number => r !== null);
  return real.length ? Math.min(...real) : null;
}

// An event's match: its title counts most; artist, venue and comuna a
// step less (a show AT a venue is a weaker match than one named so).
export function rankEvent(e: EventRecord, query: string): number | null {
  const title = rankText(e.title, query);
  const other = best(rankText(e.artist, query), rankText(e.placeName ?? e.freeformLocation, query), rankText(eventComuna(e), query));
  return best(title, other === null ? null : other + 1);
}

// When an event happens relative to today: 0 still ahead (opening or
// start), 1 running now, 2 over.
export function eventTense(e: EventRecord, today: string): 0 | 1 | 2 {
  const opening = e.openingDatetime ? santiagoDateOfIso(e.openingDatetime) : null;
  if (opening !== null && opening >= today) return 0;
  if ((e.runStartDate ?? "") > today) return 0;
  if (e.runEndDate !== null && e.runEndDate >= today) return 1;
  return 2;
}

function eventDate(e: EventRecord): string {
  return (e.openingDatetime ? santiagoDateOfIso(e.openingDatetime) : null) ?? e.runStartDate ?? e.runEndDate ?? "";
}

// How finely event matches are told apart: an exact title first, then
// every good match alike (a title or a word in it starting with the query,
// or the artist/venue/comuna doing so), then the loose ones. Within a
// bucket the date decides — "paisaje" lists this week's "Componiendo
// Paisajes" before last month's "Paisajes en tránsito".
function eventBucket(rank: number): number {
  return rank === 0 ? 0 : rank <= 2 ? 1 : 2;
}

// Events, best match first; among equals, what's ahead (soonest first),
// then what's running (closing soonest first), then the past (most
// recent first) — so a search reads like an agenda before an archive.
export function compareEvents(a: { e: EventRecord; rank: number }, b: { e: EventRecord; rank: number }, today: string): number {
  const ba = eventBucket(a.rank);
  const bb = eventBucket(b.rank);
  if (ba !== bb) return ba - bb;
  const ta = eventTense(a.e, today);
  const tb = eventTense(b.e, today);
  if (ta !== tb) return ta - tb;
  if (ta === 0) return eventDate(a.e).localeCompare(eventDate(b.e));
  if (ta === 1) return (a.e.runEndDate ?? "").localeCompare(b.e.runEndDate ?? "");
  return eventDate(b.e).localeCompare(eventDate(a.e));
}

function rankEntities(items: SearchEntity[], query: string, maxRank: number): { item: SearchEntity; rank: number }[] {
  return items
    .map((item) => ({ item, rank: rankText(item.name, query) }))
    .filter((x): x is { item: SearchEntity; rank: number } => x.rank !== null && x.rank <= maxRank)
    .sort((a, b) => a.rank - b.rank || b.item.count - a.item.count || a.item.name.localeCompare(b.item.name, "es"));
}

function rankPlaces(places: SearchPlace[], query: string, maxRank: number): { item: SearchPlace; rank: number }[] {
  const ranked = places
    .map((item) => ({ item, rank: best(rankText(item.comuna ?? item.regionName, query), item.comuna === null ? rankText(item.fullName ?? null, query) : null) }))
    .filter((x): x is { item: SearchPlace; rank: number } => x.rank !== null && x.rank <= maxRank)
    // Región rows before comuna rows on a tie ("valpa": the región first).
    .sort((a, b) => a.rank - b.rank || Number(a.item.comuna !== null) - Number(b.item.comuna !== null) || (a.item.comuna ?? a.item.regionName).localeCompare(b.item.comuna ?? b.item.regionName, "es"));
  return ranked;
}

// Fixed order of the groups when their best matches tie.
const GROUP_PRIORITY: Record<SearchGroup["kind"], number> = { places: 0, venues: 1, artists: 2, events: 3 };

// Everything that matches `query`, grouped by kind. The groups come in
// order of their best match — "santia" puts places first, "artesp" venues,
// "zabala" artists — then places, venues, artists, events on a tie.
export function searchAll(index: SearchIndex, query: string, today: string): SearchGroup[] {
  const q = normalizeSearch(query);
  if (!q) return [];
  const short = q.length < MIN_QUERY_FOR_EVENTS;
  // With a short query only name starts count (rank ≤ 2).
  const maxRank = short ? 2 : 3;
  const groups: SearchGroup[] = [];

  const places = rankPlaces(index.places, q, maxRank);
  if (places.length) groups.push({ kind: "places", best: places[0].rank, items: places.map((x) => x.item) });
  const venues = rankEntities(index.venues, q, maxRank);
  if (venues.length) groups.push({ kind: "venues", best: venues[0].rank, items: venues.map((x) => x.item) });
  const artists = rankEntities(index.artists, q, maxRank);
  if (artists.length) groups.push({ kind: "artists", best: artists[0].rank, items: artists.map((x) => x.item) });
  if (!short) {
    const events = index.events
      .map((e) => ({ e, rank: rankEvent(e, q) }))
      .filter((x): x is { e: EventRecord; rank: number } => x.rank !== null)
      .sort((a, b) => compareEvents(a, b, today));
    if (events.length) groups.push({ kind: "events", best: events[0].rank, items: events.map((x) => x.e) });
  }

  return groups.sort((a, b) => a.best - b.best || GROUP_PRIORITY[a.kind] - GROUP_PRIORITY[b.kind]);
}

// Where `query` sits in `text`, for highlighting: [start, end) in the
// ORIGINAL string, matched accent- and case-insensitively, or null.
export function matchRange(text: string, query: string): [number, number] | null {
  const q = normalizeSearch(query);
  if (!q) return null;
  // Normalize char by char, remembering where each normalized char came from.
  let norm = "";
  const origin: number[] = [];
  [...text].forEach((ch, i) => {
    const n = stripAccents(ch.toLowerCase());
    for (const c of n) {
      norm += c;
      origin.push(i);
    }
  });
  // Count by code units of the original, so slicing works.
  const offsets: number[] = [];
  let acc = 0;
  for (const ch of text) {
    offsets.push(acc);
    acc += ch.length;
  }
  offsets.push(acc);
  const at = norm.replace(/\s/g, " ").indexOf(q);
  if (at === -1) return null;
  return [offsets[origin[at]], offsets[origin[at + q.length - 1] + 1]];
}

// The places list for the index: each región, plus each comuna pointing
// at its región (picking either switches the home to that región).
export function buildSearchPlaces(regions: { name: string; adminRegionName: string | null }[]): SearchPlace[] {
  const out: SearchPlace[] = [];
  const seen = new Set<string>();
  for (const r of regions) {
    if (!r.adminRegionName) continue;
    const regionId = regionIdFromAdminRegionName(r.adminRegionName);
    const regionName = shortRegionName(r.adminRegionName);
    if (!seen.has(regionId)) {
      seen.add(regionId);
      out.push({ regionId, regionName, comuna: null, fullName: r.adminRegionName });
    }
    // A comuna named like its región ("Valparaíso") would just repeat the row.
    if (normalizeSearch(r.name) !== normalizeSearch(regionName)) out.push({ regionId, regionName, comuna: r.name });
  }
  return out;
}
