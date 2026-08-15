// Deterministic, best-effort classifier over Haiku's own curationReasoning
// text — feeds out_of_scope_signals (see that table's migration comment),
// a NOT-pruned accumulation of real evidence on what kinds of non-
// visual-art events Event Discovery keeps finding and rejecting
// (convocatorias, talleres, charlas, etc.), meant to inform a future,
// deliberate decision on whether Caldearte should expand its scope.
//
// Deliberately NOT a new Haiku-emitted structured field: that would touch
// discover.ts's shared curation prompt/schema, reused identically by every
// pipeline (comuna search AND every bright source), for a feature whose
// value is still unproven — "measure before building infra." Running a
// classifier after the fact, over text every pipeline already produces
// identically, needs no per-pipeline handling and can't destabilize the
// shared curation call.
//
// Precision over recall, on purpose: a rejection only lands in
// out_of_scope_signals when this positively recognizes an out-of-scope-
// BY-TYPE signature. Ordinary in-scope rejections (missing date info,
// duplicate, already expired, ungrounded) are deliberately never
// classified — this file has no "catch-all" branch. The real cost of
// that choice is recall: talleres/charlas described in unexpected
// phrasing, or in English, are silently undercounted, never
// misclassified. That's the accepted tradeoff for a table whose entire
// value is being trustworthy evidence, not an exhaustive census.
export type OutOfScopeCategory = "convocatoria" | "taller_o_charla" | "otro_evento_no_arte_visual";

// Tier 1 — already fully deterministic, 100% precision: this exact suffix
// is appended by rejectConvocatorias/looksLikeConvocatoria (discover.ts)
// whenever its own regex-based convocatoria detector fires. The signal
// already exists; this just routes it somewhere durable.
const CONVOCATORIA_CODE_FILTER_SUFFIX = "[FILTRO DE CÓDIGO: la fuente contiene lenguaje de convocatoria/llamado a postular; forzado a rejected]";

// Tier 2 — conservative keyword/regex match over Haiku's free-text
// reasoning (mixed Spanish/English, varies run to run). Only fires on
// fairly unambiguous terms — a miss here just means the rejection isn't
// recorded, not misclassified, so err toward narrower patterns rather
// than trying to catch every phrasing.
const TALLER_O_CHARLA_PATTERN = /\b(taller|workshop|charla|conversatorio|coloquio|seminari[oa]|clase de arte|mesa redonda|talk format|lecture)\b/i;
const OTRO_EVENTO_PATTERN = /\b(concierto|recital|festival de m[uú]sica|feria del libro|feria gastron[oó]mica|obra de teatro|funci[oó]n de danza)\b/i;

export function classifyOutOfScope(reasoning: string): OutOfScopeCategory | null {
  if (reasoning.includes(CONVOCATORIA_CODE_FILTER_SUFFIX)) return "convocatoria";
  if (TALLER_O_CHARLA_PATTERN.test(reasoning)) return "taller_o_charla";
  if (OTRO_EVENTO_PATTERN.test(reasoning)) return "otro_evento_no_arte_visual";
  return null;
}
