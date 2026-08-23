import { fmtOpeningHour, fmtUntilDate, parseDateOnly } from "@/lib/date";
import { esCL } from "@/i18n/es-CL";

export const FLYER_WIDTH = 1080;
export const FLYER_HEIGHT = 1350;

export type FlyerType = "inauguracion" | "no_te_la_pierdas" | "destacada";

const TOP_LABEL: Record<FlyerType, string> = {
  inauguracion: "INAUGURACIÓN",
  no_te_la_pierdas: "ÚLTIMOS DÍAS",
  destacada: "DESTACADA",
};

const WEEKDAYS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];

// Matches useEventCardActions.ts's own inauguración date-line composition
// (fmtInauguracionDate + fmtOpeningHour/consultHourWithVenue fallback) but
// prefixes the weekday name — the Figma mock (v1.2.0) explicitly wanted
// "JUEVES 20 AGOSTO, 19:00 HRS", which the on-site compact cards don't
// need but this larger flyer format does.
function fmtInauguracionDateLine(openingDatetimeIso: string, openingTimeConfirmed: boolean): string {
  const d = parseDateOnly(openingDatetimeIso.slice(0, 10));
  const weekday = WEEKDAYS[d.getDay()];
  const month = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"][
    d.getMonth()
  ];
  const hourPart = openingTimeConfirmed ? fmtOpeningHour(openingDatetimeIso) : esCL.consultHourWithVenue;
  return `${weekday} ${d.getDate()} ${month}, ${hourPart}`;
}

export interface FlyerEventInput {
  type: FlyerType;
  title: string;
  artist: string | null;
  placeName: string | null;
  // Separate, not pre-joined into one "Providencia, Santiago" string —
  // comuna renders as plain text, región as its own highlighted badge
  // (Daniel 2026-08-23).
  comuna: string | null;
  region: string;
  imageUrl: string;
  openingDatetime: string | null; // required for "inauguracion"
  openingTimeConfirmed: boolean;
  runEndDate: string | null; // required for "no_te_la_pierdas"
  todayStr: string;
}

// Satori's CSS text-overflow: ellipsis support is unreliable — truncating
// by character count ourselves before it ever reaches Satori is the
// approach next/og's own docs/community examples fall back on.
function truncate(text: string, maxChars: number): string {
  return text.length <= maxChars ? text : `${text.slice(0, maxChars - 1).trimEnd()}…`;
}

// Hard-wraps into exactly 2 lines by character count, not CSS's own
// whiteSpace:"normal" wrapping — real bug, found testing a genuinely long
// title: relying on CSS to wrap within a maxHeight backstop is
// unpredictable (word-boundary breaks don't line up with the char-count
// estimate that sizes the maxHeight), and when a 3rd line snuck in it got
// silently hard-clipped with no ellipsis, looking broken rather than
// truncated. Two independently truncate()'d lines, each with their own
// singleLineClip, is exactly as predictable as the single-line case this
// file already relied on before 2-line titles were needed.
function wrapToTwoLines(text: string, maxCharsPerLine: number): [string, string | null] {
  if (text.length <= maxCharsPerLine) return [text, null];
  let breakAt = text.lastIndexOf(" ", maxCharsPerLine);
  if (breakAt <= 0) breakAt = maxCharsPerLine;
  const line1 = text.slice(0, breakAt).trimEnd();
  const line2 = truncate(text.slice(breakAt).trimStart(), maxCharsPerLine);
  return [line1, line2];
}

export function buildFlyerDateLine(input: FlyerEventInput): string {
  switch (input.type) {
    case "inauguracion": {
      if (!input.openingDatetime) throw new Error("inauguracion flyer requires openingDatetime");
      return fmtInauguracionDateLine(input.openingDatetime, input.openingTimeConfirmed);
    }
    case "no_te_la_pierdas": {
      const anchor = input.runEndDate ?? input.openingDatetime?.slice(0, 10);
      if (!anchor) throw new Error("no_te_la_pierdas flyer requires runEndDate or openingDatetime");
      return fmtUntilDate(input.runEndDate, anchor, input.todayStr);
    }
    case "destacada":
      return "No te olvides visitar";
  }
}

const COLORS = {
  magenta: "#ff00fb",
  sage: "#d7dfe2",
  textPrimary: "#3d373d",
  textSecondary: "#626262",
};

// v1.2.0 Figma export (2026-08-23) — the earlier 10% margin was dropped
// (Daniel: "el margen de 10% no era necesario voy a ajustar los
// layouts"), and the header/footer bands shrank to make room for a
// bigger photo. INSET_X (127px) is unchanged from the previous version —
// only the band heights and logo moved.
const INSET_X = 127;
// 155, not the Figma export's 135 — Daniel 2026-08-23 wanted double the
// padding between the logo/label/badge and the photo below them (roughly
// 20px of breathing room in the original export, now ~40px).
const TOP_BAND_HEIGHT = 155;
// 246 (not the Figma export's 234) for the same reason — the padding
// between the band's top edge and the date line doubled (12px -> 24px,
// see BOTTOM_BAND_TEXT_TOP_PADDING below), so the band needs 12px more
// height to keep the same amount of room below the text. Sized for a
// single-line title with room to spare. When the title needs a 2nd line,
// Daniel 2026-08-23: the gray band should grow UPWARD into the photo to
// fit it — artist/venue must stay put, not get pushed down toward (or
// past) the canvas's bottom edge. BOTTOM_BAND_TOP is computed per-render
// below (depends on whether the title actually wrapped), not a fixed
// constant.
const BASE_BOTTOM_BAND_HEIGHT = 246;
const EXTRA_HEIGHT_FOR_SECOND_TITLE_LINE = 58; // 48px * 1.05 line-height + a small gap
const BOTTOM_BAND_TEXT_TOP_PADDING = 24;
const PHOTO_TOP = TOP_BAND_HEIGHT;

export function FlyerImage({ input, logoDataUri, photoDataUri }: { input: FlyerEventInput; logoDataUri: string; photoDataUri: string }) {
  // Uppercased here in JS rather than via CSS text-transform, since it's
  // needed either way for FLYER-owned strings (destacada's fixed "no te
  // olvides visitar" is already correctly cased at the source) and JS's
  // toUpperCase() is at least as correct as any CSS-level transform.
  //
  // Known open issue, not resolved: runtime-sourced text (from the
  // query-param-supplied title/artist/etc, as opposed to this file's own
  // literal strings like TOP_LABEL) renders Spanish accented uppercase
  // letters (Á/É/Í/Ó/Ú/Ñ) as their bare unaccented form — confirmed the
  // font itself has every glyph, and confirmed it's unrelated to
  // truncation, the singleLineClip below, or text-transform vs JS
  // toUpperCase (tried removing each independently, bug persisted).
  // Deprioritized per Daniel 2026-08-22 — flyers are still legible
  // without tildes, revisit only if it becomes a real complaint.
  const dateLine = truncate(buildFlyerDateLine(input), 40).toUpperCase();
  // 2 lines now, not 1 — Daniel 2026-08-23: this font size leaves too
  // little room for most real titles on a single line. 28 chars/line is
  // the same per-line budget the single-line version already used and
  // proved safe at this font size/width.
  const [titleLine1, titleLine2] = wrapToTwoLines(input.title.toUpperCase(), 28);
  const artist = input.artist ? truncate(input.artist, 60).toUpperCase() : null;
  const venue = input.placeName ? truncate(input.placeName, 60).toUpperCase() : null;
  const comuna = input.comuna ? truncate(input.comuna, 20).toUpperCase() : null;
  const region = truncate(input.region, 20).toUpperCase();
  // Backstop for this file's own char-count truncate() estimates — real
  // bug, found testing a long title: it bled past the canvas's right edge
  // despite already being truncate()'d, because the char-count budget was
  // just a guess, not a hard limit. A fixed-width, overflow:hidden
  // container guarantees nothing ever crosses the edge. No CSS
  // textOverflow: "ellipsis" — truncate() already appends its own "…", so
  // it isn't needed, and next/og's own docs already flag Satori's
  // ellipsis support as unreliable.
  const singleLineClip = { overflow: "hidden", whiteSpace: "nowrap" as const };
  const bottomTextWidth = FLYER_WIDTH - INSET_X - 30;
  const bottomBandHeight = BASE_BOTTOM_BAND_HEIGHT + (titleLine2 ? EXTRA_HEIGHT_FOR_SECOND_TITLE_LINE : 0);
  const bottomBandTop = FLYER_HEIGHT - bottomBandHeight;
  const photoHeight = bottomBandTop - PHOTO_TOP;
  // Was 248 (double the original 124px, to clear Instagram's carousel
  // slide-count indicator "5/10") — Daniel 2026-08-23: that ended up too
  // much once comuna/región grew to 32px. Pulled back a quarter, to 186.
  const topRightMargin = 186;

  return (
    <div style={{ width: FLYER_WIDTH, height: FLYER_HEIGHT, position: "relative", background: "white", display: "flex" }}>
      {/* Top band */}
      <div
        style={{ position: "absolute", left: 0, top: 0, width: FLYER_WIDTH, height: TOP_BAND_HEIGHT, background: COLORS.sage, display: "flex" }}
      />
      {/* eslint-disable-next-line @next/next/no-img-element -- Satori (next/og) only supports plain <img>, not next/image */}
      {/* 210px wide (Daniel 2026-08-23), scaled up from the Figma export's
          165.758×80.961 keeping its exact aspect ratio (~0.4885). */}
      <img src={logoDataUri} alt="" style={{ position: "absolute", left: 127.34, top: 27.4, width: 210, height: 102.59 }} />
      <span
        style={{
          position: "absolute",
          right: topRightMargin,
          top: 27,
          fontFamily: "Lato",
          fontWeight: 900,
          fontSize: 48,
          lineHeight: 0.71,
          color: COLORS.magenta,
          letterSpacing: 1,
        }}
      >
        {TOP_LABEL[input.type]}
      </span>
      {/* Comuna as plain text, región as its own black badge — per Daniel
          2026-08-23, the región needed more visual weight than the comuna,
          not the two collapsed into one string as before. */}
      <div style={{ position: "absolute", right: topRightMargin, top: 82, display: "flex", flexDirection: "row", alignItems: "center" }}>
        {comuna && (
          <span
            style={{ fontFamily: "Lato", fontWeight: 900, fontSize: 32, color: COLORS.textPrimary, letterSpacing: -0.24, marginRight: 8 }}
          >
            {comuna}
          </span>
        )}
        <div style={{ display: "flex", background: "black", padding: 2 }}>
          <span style={{ fontFamily: "Lato", fontWeight: 900, fontSize: 32, color: "#d7dfe2", letterSpacing: -0.24 }}>{region}</span>
        </div>
      </div>

      {/* Photo */}
      {/* eslint-disable-next-line @next/next/no-img-element -- Satori (next/og) only supports plain <img>, not next/image */}
      <img
        src={photoDataUri}
        alt=""
        style={{ position: "absolute", left: 0, top: PHOTO_TOP, width: FLYER_WIDTH, height: photoHeight, objectFit: "cover" }}
      />

      {/* Bottom band — height (and therefore top) is dynamic: a 2-line
          title grows it upward into the photo, per Daniel 2026-08-23, so
          artist/venue stay anchored near the true bottom instead of ever
          risking landing past the canvas edge. */}
      <div
        style={{
          position: "absolute",
          left: 0,
          top: bottomBandTop,
          width: FLYER_WIDTH,
          height: bottomBandHeight,
          background: COLORS.sage,
          display: "flex",
        }}
      />
      {/* flex column, not fixed absolute offsets per element — lets
          artist/venue flow below whatever height the (now possibly
          2-line) title actually takes. */}
      <div
        style={{
          position: "absolute",
          left: INSET_X,
          top: bottomBandTop + BOTTOM_BAND_TEXT_TOP_PADDING,
          display: "flex",
          flexDirection: "column",
          width: bottomTextWidth,
        }}
      >
        <span
          style={{
            fontFamily: "Lato",
            fontWeight: 700,
            fontSize: 40,
            color: COLORS.textPrimary,
            letterSpacing: -0.4,
            ...singleLineClip,
          }}
        >
          {dateLine}
        </span>
        {/* NOT the 0.71 (Figma's "70.96%" leading) used elsewhere — real
            bug, found testing a real long title: combined with
            overflow:hidden, a line-height that tight makes the line box
            shorter than the glyphs themselves, so overflow:hidden crops
            the bottom of every letter. Figma's own renderer doesn't clip
            this way, so its number doesn't transfer literally. */}
        <span style={{ fontFamily: "Lato", fontWeight: 900, fontSize: 48, lineHeight: 1.05, color: COLORS.magenta, letterSpacing: 1, marginTop: 8, ...singleLineClip }}>
          {titleLine1}
        </span>
        {titleLine2 && (
          <span style={{ fontFamily: "Lato", fontWeight: 900, fontSize: 48, lineHeight: 1.05, color: COLORS.magenta, letterSpacing: 1, marginTop: 4, ...singleLineClip }}>
            {titleLine2}
          </span>
        )}
        {artist && (
          <span
            style={{
              fontFamily: "Geist",
              fontWeight: 600,
              fontSize: 20,
              color: COLORS.textSecondary,
              letterSpacing: 2,
              marginTop: 16,
              ...singleLineClip,
            }}
          >
            {artist}
          </span>
        )}
        {venue && (
          <span
            style={{
              fontFamily: "Geist",
              fontWeight: 600,
              fontSize: 24,
              color: COLORS.textSecondary,
              letterSpacing: 2,
              marginTop: artist ? 12 : 16,
              ...singleLineClip,
            }}
          >
            {venue}
          </span>
        )}
      </div>
    </div>
  );
}
