// "Agrega tu expo" against what's already on the calendar (2026-11-20).
//
// A gallery submitting its own show is the best version of that show we can
// get, so when the same show is already live from a scraper (its Instagram
// post, an aggregator), the form's row should stay and the scraped one go —
// Daniel's call on the first real case ("Rotten", Casa Chagual, 2026-11-12,
// fixed by hand). Until now the form inserted without looking at all.
//
// Two levels, because removing a live event on the strength of a public form
// is the expensive mistake:
//
// - `supersede`: same venue (sharing a word, and the same región when both
//   rows have one), same date (opening day, run start or run end), and the
//   same title by one of the comparators the scrapers' own dedup already
//   trusts under a venue+date match. Or, with no venue, the identical title
//   with every date and the región agreeing (see sameShowWithoutVenue).
//   These are replaced automatically.
// - `possible`: any two of those three. Only reported in the notification
//   email so a person can decide; nothing is removed. This is where the
//   MAC - Parque Forestal shape lands (two real shows, same venue and day,
//   different titles) and also an Instagram row whose title is a caption
//   sentence rather than the show's name.
import {
  coreTitleKey,
  isLikelySameTitleWithoutRatio,
  isTitleSubsetOfOther,
  normalizeTitle,
  placeNamesLikelySame,
} from "./event-filters.js";

export interface SubmissionForMatch {
  title: string;
  placeName: string;
  regionId: string | null;
  // UTC ISO instant, as the form route already computes it.
  openingDatetime: string;
  // YYYY-MM-DD
  runEndDate: string | null;
}

export interface LiveEventForMatch {
  id: string;
  title: string;
  place_name: string | null;
  region_id: string | null;
  opening_datetime: string | null;
  run_start_date: string | null;
  run_end_date: string | null;
}

export interface SubmissionMatches<T extends LiveEventForMatch> {
  supersede: T[];
  possible: T[];
}

const santiagoDay = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Santiago",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

// YYYY-MM-DD in Santiago — a 21:00 opening is already the next day in UTC.
export function santiagoDate(isoInstant: string): string {
  return santiagoDay.format(new Date(isoInstant));
}

function sameVenue(s: SubmissionForMatch, e: LiveEventForMatch): boolean {
  // placeNamesLikelySame treats a missing name as "no signal" (true); here a
  // missing venue must not count as agreement.
  if (!e.place_name || !placeNamesLikelySame(e.place_name, s.placeName)) return false;
  return !(e.region_id && s.regionId && e.region_id !== s.regionId);
}

function sameDate(s: SubmissionForMatch, e: LiveEventForMatch): boolean {
  const openingDay = santiagoDate(s.openingDatetime);
  if (e.opening_datetime && santiagoDate(e.opening_datetime) === openingDay) return true;
  if (e.run_start_date === openingDay) return true;
  return s.runEndDate !== null && e.run_end_date === s.runEndDate;
}

function sameTitle(s: SubmissionForMatch, e: LiveEventForMatch): boolean {
  return (
    sameExactTitle(s, e) ||
    isLikelySameTitleWithoutRatio(e.title, s.title, s.placeName) ||
    isTitleSubsetOfOther(e.title, s.title, s.placeName)
  );
}

function sameExactTitle(s: SubmissionForMatch, e: LiveEventForMatch): boolean {
  if (normalizeTitle(e.title) === normalizeTitle(s.title)) return true;
  const core = coreTitleKey(s.title);
  return core !== "" && core === coreTitleKey(e.title);
}

// The motivating case itself fails the venue check: the Instagram row for
// "Rotten" stored the street address ("Merced 633") as its venue, the form
// says "Casa chagual". So the identical title also counts without a venue,
// but only with every date agreeing — same opening day AND same closing
// day — inside the same región. Two different shows with one name, one
// region, one opening day and one closing day is not a shape we've seen.
function sameShowWithoutVenue(s: SubmissionForMatch, e: LiveEventForMatch): boolean {
  if (!sameExactTitle(s, e)) return false;
  if (!s.regionId || e.region_id !== s.regionId) return false;
  if (!e.opening_datetime || santiagoDate(e.opening_datetime) !== santiagoDate(s.openingDatetime)) return false;
  return s.runEndDate !== null && e.run_end_date === s.runEndDate;
}

export function findSubmissionMatches<T extends LiveEventForMatch>(s: SubmissionForMatch, live: T[]): SubmissionMatches<T> {
  const supersede: T[] = [];
  const possible: T[] = [];
  for (const e of live) {
    const signals = [sameVenue(s, e), sameDate(s, e), sameTitle(s, e)].filter(Boolean).length;
    if (signals === 3 || sameShowWithoutVenue(s, e)) supersede.push(e);
    else if (signals === 2) possible.push(e);
  }
  return { supersede, possible };
}
