// An Instagram event whose title is the caption's opening sentence rather than
// the name of a show. instagram-item.ts uses the first caption line as the
// title when nothing is quoted, and Haiku keeps it when it finds no name of
// its own (discover.ts, mergeBrightSourceCandidate). Measured over 75 days of
// live events (2026-11-16): 5 such titles on the site, 1 of them the only
// slide of the Sunday 11-15 carousel:
//   "Te invitamos a una visita guiada dialogada junto al destacado periodista…" (cut at 120)
//   "La obra de la ilustradora inglesa Marianne North es reconocida por su…" (cut at 120)
//   "Entrada liberada este domingo en el MUG-UPLA 🖋💓"
//   "Algunas de las obras que estamos mostrando en @espacioandreabrunson hasta…"
//   "¡Este octubre La Menuda se multiplica! ✨"
//
// The event itself is real in all 5, so the candidate is kept and only its
// title is replaced with a plain label built from fields we already have.
//
// Every check needs the title to OPEN the caption: real shows are often named
// in a first line ("PROCESOS DE MISTIFICACIÓN", "KYNOPHOBIA"), and long real
// titles are common ("ANIMALIA: Una lectura contemporánea del tejido en fibra
// vegetal a través del imaginario animal"), so neither length nor position
// alone says anything. On top of that, one of: the line was cut mid-way (the
// 120-character cap), it opens with an invitation, it @-mentions an account,
// or it is a sentence of several words ending in "!" or an emoji.
//
// Runs AFTER isUmbrellaOfSiblings (run.ts): that rule drops an exclamation
// when the same post's shows came as their own candidates, and it can only
// see the exclamation if the title hasn't been relabelled yet.
import { normalizeTitle } from "../lib/event-filters.js";
import type { EventCandidate } from "./discover.js";

const INVITATION_OPENING = /^(te|los|las|les|lxs|l@s) invit|^invitamos|^entrada liberada|^algunas de las obras/i;
const ENDS_WITH_EXCLAMATION_OR_EMOJI = /(!|\p{Extended_Pictographic})[\s\p{Extended_Pictographic}️‍]*$/u;
const MIN_WORDS_FOR_SENTENCE = 5;

function firstCaptionLine(description: string): string | null {
  return description.split("\n").map((l) => l.trim()).find((l) => /[\p{L}\p{N}]/u.test(l)) ?? null;
}

export function isCaptionSentenceTitle(title: string, description: string | null): boolean {
  if (!description) return false;
  const line = firstCaptionLine(description);
  if (!line) return false;
  const t = normalizeTitle(title);
  const l = normalizeTitle(line);
  if (!t || !l.startsWith(t)) return false;
  const truncated = l.length > t.length;
  const words = title.split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w)).length;
  return (
    truncated ||
    INVITATION_OPENING.test(title.trim().replace(/^¡/, "")) ||
    title.includes("@") ||
    (words >= MIN_WORDS_FOR_SENTENCE && ENDS_WITH_EXCLAMATION_OR_EMOJI.test(title.trim()))
  );
}

const LABEL_BY_TYPE: Record<EventCandidate["eventType"], string> = {
  inauguracion: "Inauguración",
  visita_guiada: "Visita guiada",
  exposicion: "Exposición",
};

// "Exposición de Leo Benito", or "Visita guiada en Centro Cultural de Los
// Ángeles" when there's no artist (a guided visit is always "en", the person
// leading it is rarely the artist). null when neither is known: the original
// title is kept rather than inventing one.
export function labelTitle(c: Pick<EventCandidate, "eventType" | "artist" | "placeName">): string | null {
  const label = LABEL_BY_TYPE[c.eventType] ?? "Exposición";
  if (c.artist && c.eventType !== "visita_guiada") return `${label} de ${c.artist}`;
  if (c.placeName) return `${label} en ${c.placeName}`;
  if (c.artist) return `${label} de ${c.artist}`;
  return null;
}

export function readableTitle(c: EventCandidate): string {
  if (!isCaptionSentenceTitle(c.title, c.description)) return c.title;
  return labelTitle(c) ?? c.title;
}
