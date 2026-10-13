// Text rules shared by the Instagram flyer (flyer-v2.tsx) and the home's
// agenda cards (AgendaSection.tsx, 2026-10-12), which mirror the flyer's
// look — kept in one client-safe module so the two never disagree on how
// a title or an artist line reads.
import type { FlyerType } from "./flyer";

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

// "Inauguración: Título", unless the title already says it.
export function titleWithTypePrefix(title: string, type: FlyerType): string {
  return titleAlreadyMentionsType(title, type) ? title : `${TYPE_PREFIX[type]}${title}`;
}

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
export function resolveArtistDisplay(artist: string | null): string | null {
  if (!artist) return null;
  const names = artist
    .split(",")
    .map((n) => n.trim())
    .filter(Boolean);
  if (names.length === 0) return null;
  if (names.length === 1) return names[0].toUpperCase();
  return "MUESTRA COLECTIVA";
}
