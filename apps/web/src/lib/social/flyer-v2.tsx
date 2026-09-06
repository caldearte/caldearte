// Preview-only variant (2026-09-05) — Daniel/Camila noticed the current
// FlyerImage (flyer.tsx) covers too much of the event photo with opaque
// top/bottom bands. Redesign: photo fills the whole canvas, logo becomes a
// large round avatar (top-left) instead of the rectangular wordmark, and the
// type label ("INAUGURACIÓN"/"VISITA GUIADA") moves from its own top band
// into the title itself as a prefix. Artist shows conditionally (see
// resolveArtistDisplay below, added 2026-09-05); venue stays.
//
// Deliberately a SEPARATE file, not a rewrite of flyer.tsx — this is a
// design proposal being test-rendered against real events before Daniel
// decides whether to replace the production template (see the route's own
// `v=2` opt-in). Reuses FlyerEventInput/FLYER_WIDTH/FLYER_HEIGHT from
// flyer.tsx rather than duplicating them.
//
// Design decided 2026-09-05, after testing several alternatives against
// real production photos (including several that are themselves designed
// posters with their own baked-in text/logos):
// 1. Tried a small avatar tucked into whichever corner looked emptiest per
//    photo (bottom-left) to dodge institutional logos — Daniel rejected
//    this: "grandes es clave asi se separan del contenido del flayer y no
//    se confunde" — bold+large reads as an intentionally added layer, a
//    small mark trying to find empty space reads more like it's trying to
//    blend in as a co-organizer logo.
// 2. Tried always-large avatar+comuna together, top-left, but kept the
//    date+title+venue card ONLY when the photo had no text of its own
//    (`imageIsFlyer`) — Daniel's final correction: show the EXACT SAME
//    card treatment on every photo, flyer or not. His reasoning: a fixed,
//    repeating UI "chrome" that never adapts to the underlying photo is
//    what actually reads as an added interface layer (like a retweet/quote
//    card, or a nutrition-label overlay) rather than part of the original
//    design — consistency IS the disambiguator, not corner-hunting or
//    conditionally hiding pieces. So: no more `imageIsFlyer` branch here,
//    the full treatment (avatar, comuna, date, title, venue) always
//    renders, whether or not the photo already states the same info.
// 3. Confirmed 2026-09-05: this stays the permanent behavior, not a
//    stopgap — Daniel explicitly chose it over building an image
//    classifier (vision model call) to detect "is this photo already a
//    flyer": "lo dejaria asi siempre para no complejizar con
//    reconocimiento de imagen ni agregar modelo nuevo". No `imageIsFlyer`
//    field anywhere in this pipeline anymore (removed from
//    FlyerEventInput and the route's query parsing) — always-on is the
//    design, not a fallback.
const WEEKDAYS_ABBR = ["DOM", "LUN", "MAR", "MIÉ", "JUE", "VIE", "SÁB"];
const MONTHS_ABBR = ["ENE", "FEB", "MAR", "ABR", "MAY", "JUN", "JUL", "AGO", "SEP", "OCT", "NOV", "DIC"];

import { fmtOpeningHour, parseDateOnly } from "@/lib/date";
import type { FlyerEventInput, FlyerType } from "./flyer";
import { FLYER_WIDTH, FLYER_HEIGHT } from "./flyer";

const TYPE_PREFIX: Record<FlyerType, string> = {
  inauguracion: "Inauguración: ",
  visita_guiada: "Visita guiada: ",
};

// Bare form (no accents, no colon) of each label, used only to check
// whether the source title already says it — a real case found testing
// this template against production data: "Reverberación — Visita guiada
// con Aurora Anita" (type visita_guiada) became "VISITA GUIADA:
// REVERBERACIÓN — VISITA GUIADA CON AURORA ANITA" once prefixed
// unconditionally, since the phrase was already embedded mid-title, not
// just at the very start (a plain startsWith check wouldn't have caught
// this one). Checked anywhere in the title, not just as a prefix.
const TYPE_LABEL_PLAIN: Record<FlyerType, string> = {
  inauguracion: "inauguracion",
  visita_guiada: "visita guiada",
};

function stripAccents(text: string): string {
  return text.normalize("NFD").replace(/[̀-ͯ]/g, "");
}

function titleAlreadyMentionsType(title: string, type: FlyerType): boolean {
  return stripAccents(title.toLowerCase()).includes(TYPE_LABEL_PLAIN[type]);
}

const COLORS = {
  magenta: "#ff00fb",
  sage: "#d7dfe2",
  textPrimary: "#3d373d",
  textSecondary: "#626262",
};

function truncate(text: string, maxChars: number): string {
  return text.length <= maxChars ? text : `${text.slice(0, maxChars - 1).trimEnd()}…`;
}

// Balances multi-line wraps instead of leaving a long first line and a
// short leftover last line (Daniel 2026-09-06, on the "Colectivo de Acción
// Xilográfica..." example: "la primera linea es completa [y] la segunda
// linea dice solo gomez rojas" — wanted lines closer in length, tag width
// matching that).
//
// There's no real text-measurement API in Satori's render environment (no
// canvas), so line breaks are simulated with a plain character-count
// greedy wrap (same technique this file's own predecessor,
// wrapToTwoLines, already used) — not exact, but good enough to decide
// how many lines are needed and roughly where to break. Two-step approach,
// not a one-shot width/avgCharPx formula (which was tried first and
// OVER-shrank the width: reducing an already-approximate natural width by
// naive division landed at a width narrower than the text's own longest
// natural chunk, pushing "Acción Xilográfica..." to 3 lines instead of the
// intended 2):
//   1. Wrap once at maxCharsPerLine to find how many lines are genuinely
//      needed at the tag's full available width (`target`). If that's
//      already 1, there's nothing to balance.
//   2. Search DOWNWARD from maxCharsPerLine for the narrowest
//      charsPerLine that still produces exactly `target` lines (not one
//      more) — this is what actually balances line lengths, since a
//      narrower width only helps as long as it doesn't spill into an
//      extra line.
// The chosen charsPerLine converts back to a CSS pixel width via
// avgCharPx purely to tell Satori how narrow to render the tag — the
// ACTUAL line breaks are still Satori's own real text wrap at that width,
// so an imperfect avgCharPx estimate can only make the balance slightly
// off, never cause visual overflow.
function greedyWrapLines(text: string, maxCharsPerLine: number): string[] {
  const words = text.split(" ");
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length > maxCharsPerLine && current) {
      lines.push(current);
      current = word;
    } else {
      current = candidate;
    }
  }
  if (current) lines.push(current);
  return lines;
}

function balancedCharsPerLine(text: string, maxCharsPerLine: number): number {
  const target = greedyWrapLines(text, maxCharsPerLine).length;
  if (target <= 1) return maxCharsPerLine;
  const floor = Math.max(1, Math.ceil(text.length / target));
  let best = maxCharsPerLine;
  for (let cpl = maxCharsPerLine; cpl >= floor; cpl--) {
    if (greedyWrapLines(text, cpl).length === target) best = cpl;
    else break; // once narrowing forces an extra line, stop — best is the last one that didn't
  }
  return best;
}

function estimateBalancedWidth(text: string, avgCharPx: number, maxWidth: number): number | undefined {
  const maxCharsPerLine = Math.floor(maxWidth / avgCharPx);
  // 8% grace on the "does this even need wrapping" check only — avgCharPx
  // is a single average across every letter shape, so a boundary-length
  // string (e.g. exactly 32 chars against a 31-char threshold) can trip a
  // false positive on a title that Satori's real (per-glyph) measurement
  // would actually fit on one line. Real case found 2026-09-06:
  // "INAUGURACIÓN: ACCIÓN XILOGRÁFICA" (32 chars) forced an unwanted
  // 2-line wrap without this margin. Once past the grace threshold, the
  // balance search below still uses the strict maxCharsPerLine.
  const graceCharsPerLine = Math.floor((maxWidth * 1.08) / avgCharPx);
  if (greedyWrapLines(text, graceCharsPerLine).length <= 1) return undefined; // fits on one line — hug natural width
  const cpl = balancedCharsPerLine(text, maxCharsPerLine);
  return Math.min(maxWidth, Math.ceil(cpl * avgCharPx));
}
// Calibrated 2026-09-06 against two real wraps this file already produced
// at native (unconstrained) width: the title (Lato Black 44px) broke
// "INAUGURACIÓN: VILO: EL PESO DEL" (32 chars) onto line 1 within
// TITLE_TAG_MAX_WIDTH, and the artist tag (Geist SemiBold 28px) broke
// "COLECTIVO DE ACCIÓN XILOGRÁFICA JOSÉ DOMINGO" (46 chars) onto its own
// line 1 within the same width — giving ~31px/char and ~21.5px/char
// respectively (uppercase, this file's own letterSpacing included).
const TITLE_AVG_CHAR_PX = 31;
const ARTIST_AVG_CHAR_PX = 21.5;

// Artist display rule (Daniel 2026-09-05): show ONE name for a solo show,
// "MUESTRA COLECTIVA" for a confirmed group show, nothing when we simply
// don't know. `artist` is comma-separated free text today (confirmed
// against real production data 2026-09-05 — e.g. "Elisa Cordua, Felipe
// Ulloa, Tamara Lamilla, Diego Silva, Mateo Cereceda", 5 names) — 2+ names
// is a confirmed collective, exactly 1 is shown as-is (this also covers a
// collective referred to by its own single group name, e.g. "Colectivo de
// Acción Xilográfica...", which isn't a person but is still real,
// non-fabricated attribution), and null/empty renders nothing rather than
// guessing "MUESTRA COLECTIVA" for what might just be a data gap (~half of
// recent events have no `artist` captured at all, for sources that never
// state one — that's not evidence either way of solo vs. collective).
// Applied to BOTH flyer types (not just inauguracion) — same
// always-the-same-treatment reasoning as the rest of this file.
function resolveArtistDisplay(artist: string | null): string | null {
  if (!artist) return null;
  const names = artist
    .split(",")
    .map((n) => n.trim())
    .filter(Boolean);
  if (names.length === 0) return null;
  if (names.length === 1) return names[0].toUpperCase();
  return "MUESTRA COLECTIVA";
}

// "JUE 20 AGO - 19 HR" — weekday AND month both abbreviated to fit the top
// pill (Daniel's latest mockup, 2026-09-05), unlike the bottom-card date
// line this replaces (which used the full weekday name).
function fmtCompactDateLine(openingDatetimeIso: string, openingTimeConfirmed: boolean): string {
  const d = parseDateOnly(openingDatetimeIso.slice(0, 10));
  const weekday = WEEKDAYS_ABBR[d.getDay()];
  const month = MONTHS_ABBR[d.getMonth()];
  const hourPart = openingTimeConfirmed ? fmtOpeningHour(openingDatetimeIso).toUpperCase() : "HORA POR CONFIRMAR";
  return `${weekday} ${d.getDate()} ${month} - ${hourPart}`;
}

// 220 (up from an earlier 128) — Daniel 2026-09-05, working from his own
// mockup: "fíjate que avatar y comuna son grandes" (proportionally close to
// the Figma-style mock's own avatar/card-width ratio, ~0.24).
const AVATAR_SIZE = 220;
const MARGIN = 48;
const PILL_GAP = 24;
// Vertical gap between the comuna pill and the date pill stacked under it.
const PILL_STACK_GAP = 16;
const CARD_MARGIN_X = 48;
const CARD_BOTTOM_MARGIN = 48;
// Gap between the title tag and the venue tag, now that they're two
// separate tags instead of one shared card (Daniel 2026-09-05).
const TAG_STACK_GAP = 16;
// 99 (up from an earlier 28) — Daniel 2026-09-05: "cuando el template
// muestra mas informacion fijate que el redondeo es de 99 y tambien es
// grande", from the same mockup.
const CARD_RADIUS = 99;
// Bumped from 40/24 — Daniel 2026-09-05: "esa pill necesita un poco mas de
// padding".
const CARD_PADDING_X = 48;
const CARD_PADDING_Y = 32;
// The title tag's own max width — long titles now WRAP within this instead
// of being truncated with "…" (Daniel 2026-09-05: "que tal si en vez de
// truncar el nombre lo dejamos crecer?"). Matches the bottom tags' shared
// wrapper maxWidth, so a long title grows downward (more lines) rather
// than getting cut off mid-word.
const TITLE_TAG_MAX_WIDTH = FLYER_WIDTH - CARD_MARGIN_X * 2;

export function FlyerImageV2({
  input,
  photoDataUri,
  avatarDataUri,
}: {
  input: FlyerEventInput;
  photoDataUri: string;
  // The real round Instagram-profile-style avatar (Daniel 2026-09-05),
  // replacing the earlier JSX-drawn circle-with-text approximation.
  avatarDataUri: string;
}) {
  if (!input.openingDatetime) throw new Error(`${input.type} flyer requires openingDatetime`);
  const dateLine = fmtCompactDateLine(input.openingDatetime, input.openingTimeConfirmed);
  // No line cap — grows downward instead of truncating (Daniel 2026-09-05).
  // truncate() here is only a defensive backstop against a pathological
  // title, not the normal path.
  const title = truncate(
    (titleAlreadyMentionsType(input.title, input.type) ? input.title : `${TYPE_PREFIX[input.type]}${input.title}`).toUpperCase(),
    200,
  );
  const venue = input.placeName ? truncate(input.placeName, 60).toUpperCase() : null;
  const comuna = input.comuna ? truncate(input.comuna, 20).toUpperCase() : null;
  const artist = resolveArtistDisplay(input.artist);
  const titleBalancedWidth = estimateBalancedWidth(title, TITLE_AVG_CHAR_PX, TITLE_TAG_MAX_WIDTH);
  const artistBalancedWidth = artist ? estimateBalancedWidth(artist, ARTIST_AVG_CHAR_PX, TITLE_TAG_MAX_WIDTH) : undefined;

  const singleLineClip = { overflow: "hidden", whiteSpace: "nowrap" as const };

  // Each pill/tag sizes to its OWN content, not to its sibling's (Daniel
  // 2026-09-05: comuna, being shorter text, was stretching to match the
  // wider date pill). display:flex + no explicit width on the pill itself,
  // combined with alignItems:"flex-start" on the STACKING parent (instead
  // of the default "stretch"), is what makes each child hug its own
  // content width in Satori's flexbox (Yoga) layout.
  const pillStyle = {
    display: "flex" as const,
    alignItems: "center" as const,
    background: COLORS.magenta,
    borderRadius: 999,
    padding: "18px 36px",
  };
  const pillTextStyle = { fontFamily: "Lato", fontWeight: 900, fontSize: 34, color: "white", letterSpacing: 0.5 };
  const tagStyle = {
    display: "flex" as const,
    flexDirection: "column" as const,
    background: COLORS.sage,
    borderRadius: CARD_RADIUS,
    padding: `${CARD_PADDING_Y}px ${CARD_PADDING_X}px`,
  };

  return (
    <div style={{ width: FLYER_WIDTH, height: FLYER_HEIGHT, position: "relative", background: "white", display: "flex" }}>
      {/* Photo — fills the ENTIRE canvas, nothing else drawn behind it. */}
      {/* eslint-disable-next-line @next/next/no-img-element -- Satori (next/og) only supports plain <img>, not next/image */}
      <img
        src={photoDataUri}
        alt=""
        style={{ position: "absolute", left: 0, top: 0, width: FLYER_WIDTH, height: FLYER_HEIGHT, objectFit: "cover" }}
      />

      {/* Round avatar, top-left — always large, same on every photo. */}
      {/* eslint-disable-next-line @next/next/no-img-element -- Satori (next/og) only supports plain <img>, not next/image */}
      <img
        src={avatarDataUri}
        alt=""
        style={{ position: "absolute", left: MARGIN, top: MARGIN, width: AVATAR_SIZE, height: AVATAR_SIZE, borderRadius: AVATAR_SIZE / 2 }}
      />

      {/* Comuna + date pills, stacked, to the right of the avatar — both
          always shown, on every photo (see this file's top comment for
          why this stopped being conditional on imageIsFlyer).
          Vertically CENTERED against the avatar's own height (Daniel
          2026-09-05: "los tags de arriba estan alineados al medio
          verticalmente respecto del avatar") — a fixed-height wrapper
          (height: AVATAR_SIZE) with justifyContent:"center" centers the
          pill stack without having to hand-compute pixel offsets.
          alignItems:"flex-start" (not the flexbox default "stretch") is
          what lets each pill size to its own text instead of both
          stretching to match the wider one. */}
      <div
        style={{
          position: "absolute",
          left: MARGIN + AVATAR_SIZE + PILL_GAP,
          top: MARGIN,
          height: AVATAR_SIZE,
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          alignItems: "flex-start",
          gap: PILL_STACK_GAP,
        }}
      >
        {comuna && (
          <div style={pillStyle}>
            <span style={pillTextStyle}>{comuna}</span>
          </div>
        )}
        <div style={pillStyle}>
          <span style={{ ...pillTextStyle, ...singleLineClip }}>{dateLine}</span>
        </div>
      </div>

      {/* Title tag + venue tag, stacked as TWO SEPARATE tags now (Daniel
          2026-09-05: "abajo dejaste nombre de la inauguracion en el mismo
          tag que el nombre del lugar, cuando deben ser tags separados") —
          each one its own rounded background, sized to its own content
          (alignItems:"flex-start" on this wrapper, same reasoning as the
          top pills). Anchored via `bottom`, not a precomputed height +
          `top` — Satori/Yoga sizes each tag from its actual text, so
          nothing here needs to guess how tall a 1- vs 2-line title tag
          will be. */}
      <div
        style={{
          position: "absolute",
          left: CARD_MARGIN_X,
          bottom: CARD_BOTTOM_MARGIN,
          display: "flex",
          flexDirection: "column",
          alignItems: "flex-start",
          gap: TAG_STACK_GAP,
          maxWidth: FLYER_WIDTH - CARD_MARGIN_X * 2,
        }}
      >
        {/* Artist tag, above the title — Daniel 2026-09-05: "aqui va el
            artista sobre titulo de obra tamaño de texto que teniamos en el
            nombre del lugar" (28px, the venue tag's OLD size). Only when
            resolveArtistDisplay has something real to say (see its own
            comment) — no empty/placeholder tag when we simply don't know. */}
        {artist && (
          // No singleLineClip here — wraps to more lines instead of being
          // cut off (Daniel 2026-09-06: a long single-string collective
          // name, "Colectivo de Acción Xilográfica José Domingo Gómez
          // Rojas", looked truncated; same "let it grow" treatment already
          // used for the title). maxWidth matches the title tag's own so
          // both tags wrap at the same boundary.
          <div style={{ ...tagStyle, maxWidth: TITLE_TAG_MAX_WIDTH, ...(artistBalancedWidth ? { width: artistBalancedWidth } : {}) }}>
            <span
              style={{
                fontFamily: "Geist",
                fontWeight: 600,
                fontSize: 28,
                lineHeight: 1.25,
                color: COLORS.textSecondary,
                letterSpacing: 1.5,
              }}
            >
              {artist}
            </span>
          </div>
        )}
        <div style={{ ...tagStyle, maxWidth: TITLE_TAG_MAX_WIDTH, ...(titleBalancedWidth ? { width: titleBalancedWidth } : {}) }}>
          <span
            style={{
              fontFamily: "Lato",
              fontWeight: 900,
              fontSize: 44,
              lineHeight: 1.15,
              color: COLORS.magenta,
              letterSpacing: 0.5,
            }}
          >
            {title}
          </span>
        </div>
        {/* Venue tag — sized down (Daniel 2026-09-05: "el nombre del lugar
            baja de tamaño") now that the artist tag has taken over the
            venue's old 28px size. */}
        {venue && (
          <div style={tagStyle}>
            <span
              style={{
                fontFamily: "Geist",
                fontWeight: 600,
                fontSize: 22,
                color: COLORS.textSecondary,
                letterSpacing: 1.5,
                ...singleLineClip,
              }}
            >
              {venue}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
