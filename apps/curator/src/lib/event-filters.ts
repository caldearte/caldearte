// Used by event-discovery/run.ts to dedupe candidates against what's
// already stored.

function stripAccents(text: string): string {
  return text.normalize("NFD").replace(/[̀-ͯ]/g, "");
}

// Accent/quote-insensitive: the same event routinely surfaces with
// slightly different punctuation across sources and re-runs ("Ejercicios
// de enlaces" vs "Exposición 'Ejercicios de enlaces'" was a real observed
// duplicate) — plain trim+lowercase missed it. Also collapses the
// title/subtitle separator itself: real bug (2026-07-18) — "Una metáfora
// verde - arte, activismo y solidaridad" vs "Una metáfora verde: arte,
// activismo y solidaridad", same event from two sources, one using a
// hyphen and the other a colon, evaded exact-match dedup.
export function normalizeTitle(title: string): string {
  return stripAccents(title.toLowerCase())
    .replace(/["'«»“”]/g, "")
    .replace(/\s*[-:–—|]\s*/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Used by run.ts's locationDateKey dedup fingerprint. Real bug (found
// 2026-07-20, via a user-requested Event Discovery audit): the same
// festival ("ARTEPUERTO 2026") got inserted 3 times in one run because 3
// different social posts about it reported the location as "Valparaíso,
// Chile" vs "Valparaíso" vs (via a different unit) just "Chile" appended
// differently — plain normalizeTitle-style whitespace/accent/case
// normalization still left those as different strings, so none of the 3
// dedup signals (title, sourceUrl, location+date) fired. `location` is
// documented as "la comuna/ciudad" (see discover.ts's buildSystemPrompt),
// so only the FIRST comma-segment is the actual signal — a trailing ",
// Chile"/", Región de ..." is noise that varies source-to-source for the
// same real place.
// Real production bug (found 2026-07-22, running Event Discovery for
// real): `insertCandidates` computes this dedup key for EVERY candidate,
// not just approved ones — a rejected candidate can legitimately have a
// null `location` (Haiku sometimes doesn't bother filling it in for an
// event it's discarding), and this crashed the whole unit on
// `null.split(",")`, same class of failure as `isChileanLocation`'s own
// null-safety fix (lib/locations.ts). `| null | undefined` in the
// signature documents that this function must survive exactly the input
// that broke it, not just the declared type.
export function normalizeLocation(location: string | null | undefined): string {
  if (!location) return "";
  const firstSegment = location.split(",")[0];
  return normalizeTitle(firstSegment);
}

// Generic art-event vocabulary, stripped before comparing titles for
// similarity — shared only because two DIFFERENT events happen to both be
// "una exposición" or "de 2026", not because they're the same event. Kept
// deliberately small/conservative: better to miss a fuzzy duplicate than to
// silently merge two genuinely different events over generic word overlap.
const GENERIC_TITLE_WORDS = new Set([
  "exposicion", "expo", "muestra", "arte", "artistica", "artistico",
  "artisticas", "artisticos", "inauguracion", "obra", "obras", "galeria",
  "centro", "cultural", "museo", "intervencion",
]);

// Used by run.ts's cross-run dedup as a fallback signal, for the case none
// of the three exact-match keys (title, sourceUrl, location+datetime) catch
// a real duplicate — e.g. two different social posts about the same real
// opening, reporting slightly different exact hours ("19:00" vs "19:30"),
// with meaningfully different title wording too. Requires BOTH high
// word-overlap (Jaccard >= 0.6) AND at least 2 shared significant words —
// either alone is too weak (a single shared generic-sounding word, or a
// borderline Jaccard score on very short titles, both risk merging two
// genuinely different events at the same venue on the same day, which is a
// worse outcome than an occasional missed duplicate).
function tokenizeSignificantWords(title: string): Set<string> {
  return new Set(
    stripAccents(title.toLowerCase())
      .split(/[^a-z0-9]+/)
      .filter((w) => w.length > 2 && !/^\d+$/.test(w) && !GENERIC_TITLE_WORDS.has(w)),
  );
}

// Shared comparator behind isLikelySameTitle/isLikelySameTitleIgnoringPlaceName
// — both need the identical Jaccard-or-overlap decision, just over
// different word sets.
function wordSetsLikelySameTitle(wordsA: Set<string>, wordsB: Set<string>): boolean {
  if (wordsA.size === 0 || wordsB.size === 0) return false;

  const shared = [...wordsA].filter((w) => wordsB.has(w));
  if (shared.length < 2) return false;

  const union = new Set([...wordsA, ...wordsB]).size;
  const jaccard = shared.length / union;
  // Overlap coefficient (shared / the SMALLER title's word count) is a
  // second, independent way to pass, alongside the original Jaccard
  // check — added for a real case (2026-07-28): the same real exhibition
  // titled "Estado de Posibilidad: Exposición del Laboratorio I de Artes
  // Visuales" on chilecultura.gob.cl and "LAB#1: «Estado de Posibilidad»"
  // on the venue's own site share only 2 of 7 total distinct words
  // (Jaccard ≈ 0.29, well under 0.6), but those 2 words are 2 of the
  // terser title's only 3 (overlap ≈ 0.67) — a much better signal when
  // one source uses an internal code name and another a full descriptive
  // title for the exact same event. Still gated on shared >= 2 above,
  // same as the original check, so a single shared proper noun (the
  // ARTEPUERTO case below) never qualifies on its own.
  const overlap = shared.length / Math.min(wordsA.size, wordsB.size);
  return jaccard >= 0.6 || overlap >= 0.6;
}

export function isLikelySameTitle(a: string, b: string): boolean {
  return wordSetsLikelySameTitle(tokenizeSignificantWords(a), tokenizeSignificantWords(b));
}

// Used by run.ts's strict location+date dedup tier (2026-08-12, real
// production bug): a source like uchile.cl/artes.uchile.cl bakes its own
// venue name straight into every title ("Exposición 'X' en el MAC Parque
// Forestal") — when a venue runs several genuinely different concurrent
// exhibitions sharing one placeName + season-wide run dates, that shared
// "en el MAC Parque Forestal" suffix alone is enough to pass plain
// isLikelySameTitle (3 of 4-5 significant words shared, purely from the
// venue name), which would falsely treat 2 different real exhibitions as
// the same event. Strips placeName's own significant words from both
// titles before comparing, so only the part of the title that actually
// describes the exhibition counts.
export function isLikelySameTitleIgnoringPlaceName(a: string, b: string, placeName: string | null): boolean {
  const placeWords = placeName ? tokenizeSignificantWords(placeName) : new Set<string>();
  const withoutPlaceWords = (title: string) => new Set([...tokenizeSignificantWords(title)].filter((w) => !placeWords.has(w)));
  return wordSetsLikelySameTitle(withoutPlaceWords(a), withoutPlaceWords(b));
}

// Used by run.ts's fuzzy cross-run dedup ALONGSIDE isLikelySameTitle, not
// instead of it — the coarse comuna+date bucket (locationDateOnlyKey,
// 2026-07-29) deliberately no longer requires placeName to match exactly
// to even be compared (that used to hide real duplicates whose sources
// spell the same venue differently — see run.ts's own comment). But
// comuna+date+similar-title alone isn't safe either: two DIFFERENT venues
// in the same comuna can have a near-identical title on the same day
// (this file's own dedup test seeds exactly that case) — placeName still
// has to weigh in, just leniently instead of requiring an exact string.
// Deliberately a LOWER bar than isLikelySameTitle (>=1 shared significant
// word, not >=2): venue names are short ("MAC - Quinta Normal" / "MAC -
// Museo de Arte Contemporáneo" share only "mac" once generic words like
// "museo"/"centro"/"galeria" are stripped — the same GENERIC_TITLE_WORDS
// list already covers common venue-type nouns), so requiring 2 shared
// words the way title-matching does would make this check useless for
// exactly the short-venue-name case it exists for. A null/empty
// placeName on either side is treated as "no signal" (permissive true)
// rather than a veto — same posture as `location`'s own coarser
// comuna-only fallback before place_name existed at all.
export function placeNamesLikelySame(a: string | null, b: string | null): boolean {
  if (!a || !b) return true;
  const wordsA = tokenizeSignificantWords(a);
  const wordsB = tokenizeSignificantWords(b);
  if (wordsA.size === 0 || wordsB.size === 0) return true;
  return [...wordsA].some((w) => wordsB.has(w));
}

// Real gap found 2026-08-14 (factor__f, "BOTÁNICA"; hifas.galeria,
// "Cartografía del Fuego"): posts about the SAME real opening, worded
// almost entirely differently beyond the exhibition name itself —
// "Mañana es el día..." vs "Anota la fecha... inauguramos BOTÁNICA...",
// or "Registro de mediación de la exposición Cartografía del Fuego" vs
// "Registro de la inauguración Cartografía del Fuego" — share only 3 of
// ~9 significant words each (jaccard ~0.2-0.3, overlap ~0.3-0.4), both
// well under isLikelySameTitle's 0.6 threshold (tuned for more
// consistently-worded aggregator titles, not independently-written
// informal social captions). run.ts's dedup tier already requires an
// EXACT venue name match (not just placeNamesLikelySame's looser "some
// shared word") plus an exact date signal before calling this — that's
// already strong independent evidence, so the ratio requirement is
// dropped here. STILL requires >=2 shared significant words, same floor
// as isLikelySameTitle — real regression found writing this function's
// own test (MAC - Parque Forestal, two genuinely different exhibitions
// sharing a venue+season): dropping the word-count floor too, not just
// the ratio, let a single incidental shared word falsely merge them.
export function isLikelySameTitleWithoutRatio(a: string, b: string, placeName: string | null): boolean {
  const placeWords = placeName ? tokenizeSignificantWords(placeName) : new Set<string>();
  const withoutPlaceWords = (title: string) => new Set([...tokenizeSignificantWords(title)].filter((w) => !placeWords.has(w)));
  const wordsA = withoutPlaceWords(a);
  const wordsB = withoutPlaceWords(b);
  const shared = [...wordsA].filter((w) => wordsB.has(w));
  return shared.length >= 2;
}

// Used by run.ts's cross-source conflict escalation (2026-07-30, found via
// a manual curation audit — see docs/curation-policy.md's "Cross-source
// conflict escalation" section) to decide whether two anchor dates are
// close enough that the events they belong to might be the same real
// exhibition described by two different sources. Plain calendar-day
// difference, not calendar-aware (no month-length edge cases to worry
// about at this granularity) — both args are "YYYY-MM-DD" strings, same
// format used everywhere else in this codebase for date-only values.
export function isWithinAnchorWindow(a: string, b: string, windowDays = 30): boolean {
  const msPerDay = 24 * 60 * 60 * 1000;
  const diffDays = Math.abs(Date.parse(a) - Date.parse(b)) / msPerDay;
  return diffDays <= windowDays;
}
