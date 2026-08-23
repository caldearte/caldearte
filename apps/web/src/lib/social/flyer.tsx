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
  location: string; // comuna, región — e.g. "Providencia, Santiago"
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

// 10% margin used in the Figma mockups translates to this left inset
// (127px of 1080px ≈ 11.8%, close enough to "10%" as Daniel described it —
// matches the exported frame exactly rather than a round number).
const INSET_X = 127;
const PHOTO_TOP = 241;
const PHOTO_HEIGHT = 747; // 988 - 241, per the Figma export

export function FlyerImage({ input }: { input: FlyerEventInput }) {
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
  const title = truncate(input.title, 28).toUpperCase();
  const artist = input.artist ? truncate(input.artist, 60).toUpperCase() : null;
  const venue = input.placeName ? truncate(input.placeName, 60).toUpperCase() : null;
  const location = truncate(input.location, 36).toUpperCase();
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

  return (
    <div style={{ width: FLYER_WIDTH, height: FLYER_HEIGHT, position: "relative", background: "white", display: "flex" }}>
      {/* Top band */}
      <div style={{ position: "absolute", left: 0, top: 0, width: FLYER_WIDTH, height: 241, background: COLORS.sage, display: "flex" }} />
      <div style={{ position: "absolute", left: 128, top: 144, display: "flex", flexDirection: "column" }}>
        <span
          style={{
            fontFamily: "Lato",
            fontWeight: 900,
            fontSize: 51,
            lineHeight: 0.71,
            color: COLORS.magenta,
            letterSpacing: 0.5,
          }}
        >
          CALDE
        </span>
        <span style={{ fontFamily: "Lato", fontWeight: 900, fontSize: 51, lineHeight: 0.71, color: COLORS.magenta, letterSpacing: 0.5 }}>
          ARTE.
        </span>
      </div>
      <div style={{ position: "absolute", right: 124, top: 147, display: "flex", flexDirection: "column", alignItems: "flex-end" }}>
        <span style={{ fontFamily: "Lato", fontWeight: 900, fontSize: 48, lineHeight: 0.71, color: COLORS.magenta, letterSpacing: 1 }}>
          {TOP_LABEL[input.type]}
        </span>
        <span
          style={{
            fontFamily: "Lato",
            fontWeight: 900,
            fontSize: 24,
            color: COLORS.textPrimary,
            letterSpacing: -0.24,
            marginTop: 12,
            maxWidth: 700,
            ...singleLineClip,
          }}
        >
          {location}
        </span>
      </div>

      {/* Photo */}
      {/* eslint-disable-next-line @next/next/no-img-element -- Satori (next/og) only supports plain <img>, not next/image */}
      <img
        src={input.imageUrl}
        alt=""
        style={{ position: "absolute", left: 0, top: PHOTO_TOP, width: FLYER_WIDTH, height: PHOTO_HEIGHT, objectFit: "cover" }}
      />

      {/* Bottom band */}
      <div
        style={{
          position: "absolute",
          left: 0,
          top: PHOTO_TOP + PHOTO_HEIGHT,
          width: FLYER_WIDTH,
          height: FLYER_HEIGHT - (PHOTO_TOP + PHOTO_HEIGHT),
          background: COLORS.sage,
          display: "flex",
          flexDirection: "column",
        }}
      />
      <div style={{ position: "absolute", left: INSET_X, top: 1007, display: "flex", flexDirection: "column" }}>
        <span
          style={{
            fontFamily: "Lato",
            fontWeight: 700,
            fontSize: 40,
            color: COLORS.textPrimary,
            letterSpacing: -0.4,
            maxWidth: bottomTextWidth,
            ...singleLineClip,
          }}
        >
          {dateLine}
        </span>
        <span
          style={{
            fontFamily: "Lato",
            fontWeight: 900,
            fontSize: 48,
            lineHeight: 0.71,
            color: COLORS.magenta,
            letterSpacing: 1,
            marginTop: 12,
            maxWidth: bottomTextWidth,
            ...singleLineClip,
          }}
        >
          {title}
        </span>
        {artist && (
          <span
            style={{
              fontFamily: "Geist",
              fontWeight: 600,
              fontSize: 20,
              color: COLORS.textSecondary,
              letterSpacing: 2,
              marginTop: 20,
              maxWidth: bottomTextWidth,
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
              marginTop: artist ? 16 : 20,
              maxWidth: bottomTextWidth,
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
