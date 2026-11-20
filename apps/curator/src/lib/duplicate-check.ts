import type { DiscoverUsage, MessagesClient } from "../event-discovery/discover.js";
import { fetchAllRows } from "./fetch-all.js";

// A second look, by a model, at the candidates the deterministic dedup
// (findExistingMatch) was about to insert as brand-new events: is any of
// them a show that is already on the calendar under other words?
//
// Why it exists (measured 2026-11-19): after the overlapping-runs fix
// (#702), ~2 duplicates a day were still removed by hand, and none of them
// is reachable by word overlap. A venue posts again about its own show
// ("Con la excusa de algunas imágenes de la inauguración…", "Últimos días",
// "visita comentada con el artista"), another account announces the same
// show under the artist's name ("Exposición individual de Augusta
// Lecaros"), or one post covers shows already listed one by one. The
// opposite shape — several genuinely different shows opening the same
// minute in the same room (the 8 MAC shows) — shares just as few words, so
// no string rule can tell them apart; findExistingMatch documents that
// limit ("América despierta", 2026-08-14). Reading the text can.
//
// Only ever removes: a match drops the candidate as a duplicate, a miss
// leaves the deterministic decision as it was. When in doubt the prompt
// says no match, because a duplicate listing is noise and a hidden show is
// a loss.

const MODEL = "claude-haiku-5-5";
const EFFORT = "low";
export { MODEL as DUPLICATE_CHECK_MODEL };

const MAX_DESCRIPTION_CHARS = 400;
const MAX_EXISTING_DESCRIPTION_CHARS = 160;

export interface DuplicateCheckEvent {
  title: string;
  placeName: string | null;
  location: string | null;
  sourceAccount: string | null;
  runStartDate: string | null;
  runEndDate: string | null;
  openingDatetime: string | null;
  description: string | null;
}

export interface DuplicateCheckExisting extends DuplicateCheckEvent {
  id: string;
}

// One call: some new candidates and the live events they could duplicate
// (same comuna or same account). The caller groups them.
export interface DuplicateCheckGroup<C> {
  candidates: Array<{ ref: C; event: DuplicateCheckEvent }>;
  existing: DuplicateCheckExisting[];
}

export interface DuplicateCheckDecision<C> {
  ref: C;
  existingId: string | null;
  confident: boolean;
  reason: string;
}

export interface DuplicateCheckResult<C> {
  // Only confident matches: what the caller acts on.
  matches: Map<C, { existingId: string; reason: string }>;
  // Every answer the model gave, for the run log and for measuring.
  decisions: DuplicateCheckDecision<C>[];
  usage: DiscoverUsage;
}

export const DUPLICATE_CHECK_SYSTEM_PROMPT = `Eres parte del sistema de un calendario de exposiciones de arte en Chile. Cada evento del calendario es UNA exposición (o una intervención artística) en UN lugar.

Recibes candidatos nuevos (C1, C2, …) y los eventos que ya están en el calendario en la misma comuna o de la misma cuenta (E1, E2, …). Para cada candidato decide si es una exposición que YA está en el calendario.

ES LA MISMA (responde con el E correspondiente) cuando el candidato habla de la misma exposición, aunque las palabras sean otras:
- La misma cuenta vuelve a publicar sobre una muestra suya: registro o fotos de la inauguración, agradecimientos, "últimos días", "ya viniste a ver", recordatorio, cierre o finissage.
- Una actividad de la muestra que no es otra muestra: visita guiada o comentada, mediación, recorrido con el artista, conversatorio o charla sobre esa exposición.
- Una publicación sobre una obra o una sala de una muestra que ya está (cápsulas, "conoce esta obra", una pieza destacada).
- Otra cuenta (el artista, una fundación, un agregador, una galería que la difunde) anuncia la misma exposición: mismo artista o mismo título, mismo lugar, fechas compatibles. El título puede ser el nombre del artista, el del espacio o una frase del texto.
- Una publicación que agrupa varias exposiciones que ya están cada una en el calendario (una "ficha general" o "post paraguas"): responde con la primera de ellas.
- Un evento con varias sedes (bienal, festival): cada sede es su propio evento. Un candidato de una sede que ya está es esa misma; una ficha general de todo el evento, cuando sus sedes ya están, también es la misma.

NO ES LA MISMA (responde null):
- Otra exposición en el mismo lugar, aunque inaugure el mismo día o en la misma temporada. Un espacio que abre varias muestras a la vez tiene una ficha por muestra, cada una con su título o su artista.
- Una performance, activación performativa o intervención en vivo: es un evento propio aunque ocurra dentro de una exposición que ya está.
- Una muestra concreta que se inaugura dentro de una jornada o programa general que ya está (por ejemplo una exposición con título propio dentro de una "Noche de Museos"): la muestra es su propio evento.
- Una nueva edición, o una muestra anterior o siguiente del mismo espacio o del mismo artista.
- La misma obra o el mismo artista en otro lugar distinto.
- Cualquier duda. Un duplicado se puede quitar después; una exposición escondida por error no la ve nadie.

Para cada candidato escribe primero el razonamiento y después la respuesta, que tiene que ser coherente con él. "confidence" es "alta" solo cuando el texto lo deja claro (mismo título o mismo artista, mismo lugar, o el candidato nombra la muestra existente); si estás deduciendo por coincidencia de lugar y fechas, es "media".

Responde SOLO con un arreglo JSON, un objeto por candidato, en el mismo orden:
[{"candidate":"C1","reason":"<una frase>","duplicate_of":"E3","confidence":"alta"},{"candidate":"C2","reason":"<una frase>","duplicate_of":null,"confidence":"alta"}]`;

// By code point, not UTF-16 unit: slicing through an emoji leaves a lone
// surrogate, and the API rejects the whole request body as invalid JSON
// (3 of 197 calls on the first measurement).
function clip(text: string | null, max: number): string {
  if (!text) return "";
  const chars = Array.from(text.replace(/\s+/g, " ").trim());
  return chars.length > max ? `${chars.slice(0, max).join("")}…` : chars.join("");
}

function dates(e: DuplicateCheckEvent): string {
  const parts: string[] = [];
  if (e.openingDatetime) parts.push(`inaugura ${e.openingDatetime}`);
  if (e.runStartDate || e.runEndDate) parts.push(`${e.runStartDate ?? "?"} → ${e.runEndDate ?? "?"}`);
  return parts.join(", ") || "sin fechas";
}

function describe(label: string, e: DuplicateCheckEvent, maxDescription: number): string {
  const lines = [
    `${label}: ${e.title}`,
    `  lugar: ${[e.placeName, e.location].filter(Boolean).join(", ") || "?"}`,
    `  cuenta: ${e.sourceAccount ?? "-"}`,
    `  fechas: ${dates(e)}`,
  ];
  const description = clip(e.description, maxDescription);
  if (description) lines.push(`  texto: ${description}`);
  return lines.join("\n");
}

export function buildDuplicateCheckBlock(candidates: DuplicateCheckEvent[], existing: DuplicateCheckExisting[]): string {
  return [
    "CANDIDATOS NUEVOS",
    ...candidates.map((c, i) => describe(`C${i + 1}`, c, MAX_DESCRIPTION_CHARS)),
    "",
    "YA EN EL CALENDARIO",
    ...existing.map((e, i) => describe(`E${i + 1}`, e, MAX_EXISTING_DESCRIPTION_CHARS)),
  ].join("\n");
}

export interface ParsedDecision {
  existingIndex: number | null;
  confident: boolean;
  reason: string;
}

// Candidate index → the model's answer (0-based existing index, or null),
// only for answers that name a real candidate and, when they match, a real
// existing event. Anything unparseable means no match: this check can only
// ever remove, so failing open is the safe side.
export function parseDuplicateCheckResponse(text: string, candidateCount: number, existingCount: number): Map<number, ParsedDecision> {
  const out = new Map<number, ParsedDecision>();
  const start = text.indexOf("[");
  const end = text.lastIndexOf("]");
  if (start === -1 || end <= start) return out;
  let parsed: unknown;
  try {
    parsed = JSON.parse(text.slice(start, end + 1));
  } catch {
    return out;
  }
  if (!Array.isArray(parsed)) return out;
  for (const entry of parsed) {
    if (!entry || typeof entry !== "object") continue;
    const { candidate, duplicate_of: duplicateOf, reason, confidence } = entry as Record<string, unknown>;
    const c = typeof candidate === "string" ? /^C(\d+)$/i.exec(candidate.trim()) : null;
    if (!c) continue;
    const ci = Number(c[1]) - 1;
    if (ci < 0 || ci >= candidateCount || out.has(ci)) continue;
    const e = typeof duplicateOf === "string" ? /^E(\d+)$/i.exec(duplicateOf.trim()) : null;
    const ei = e ? Number(e[1]) - 1 : null;
    if (ei !== null && (ei < 0 || ei >= existingCount)) continue;
    out.set(ci, {
      existingIndex: ei,
      // Only a confident match removes anything; "media" is a guess from
      // place and dates, the exact shape that wrongly merges two shows.
      confident: typeof confidence === "string" && confidence.trim().toLowerCase() === "alta",
      reason: typeof reason === "string" ? reason : "",
    });
  }
  return out;
}

export async function checkDuplicates<C>(client: MessagesClient, groups: DuplicateCheckGroup<C>[]): Promise<DuplicateCheckResult<C>> {
  const matches = new Map<C, { existingId: string; reason: string }>();
  const decisions: DuplicateCheckDecision<C>[] = [];
  const usage: DiscoverUsage = { inputTokens: 0, outputTokens: 0, cacheCreationInputTokens: 0, cacheReadInputTokens: 0 };
  for (const group of groups) {
    if (group.candidates.length === 0 || group.existing.length === 0) continue;
    let text: string;
    try {
      const response = await client.messages.create({
        model: MODEL,
        max_tokens: 8000,
        output_config: { effort: EFFORT },
        system: DUPLICATE_CHECK_SYSTEM_PROMPT,
        messages: [{ role: "user", content: buildDuplicateCheckBlock(group.candidates.map((c) => c.event), group.existing) }],
      });
      usage.inputTokens += response.usage.input_tokens;
      usage.outputTokens += response.usage.output_tokens;
      usage.cacheCreationInputTokens! += response.usage.cache_creation_input_tokens ?? 0;
      usage.cacheReadInputTokens! += response.usage.cache_read_input_tokens ?? 0;
      text = response.content
        .filter((b) => b.type === "text" && b.text)
        .map((b) => b.text)
        .join("");
    } catch (err) {
      console.error(`[duplicate-check] call failed, keeping the deterministic decision: ${(err as Error).message}`);
      continue;
    }
    const parsed = parseDuplicateCheckResponse(text, group.candidates.length, group.existing.length);
    for (const [ci, { existingIndex, confident, reason }] of parsed) {
      const ref = group.candidates[ci].ref;
      const existingId = existingIndex === null ? null : group.existing[existingIndex].id;
      decisions.push({ ref, existingId, confident, reason });
      if (existingId !== null && confident) matches.set(ref, { existingId, reason });
    }
  }
  return { matches, decisions, usage };
}

// --- Pipeline side ----------------------------------------------------------

// A live (current or upcoming) approved event, the pool a candidate is
// compared against. Same liveness rule as the measurement: the last date
// it has (end, else start, else opening day) is no earlier than yesterday.
export interface LiveEvent extends DuplicateCheckExisting {
  regionId: string | null;
}

interface LiveEventRow {
  id: string;
  title: string;
  place_name: string | null;
  freeform_location: string | null;
  region_id: string | null;
  source_account: string | null;
  run_start_date: string | null;
  run_end_date: string | null;
  opening_datetime: string | null;
  description: string | null;
}

export interface LiveEventsClient {
  from(table: "events"): {
    select(columns: string): {
      eq(column: string, value: string): {
        is(column: string, value: null): {
          or(filter: string): {
            range(from: number, to: number): PromiseLike<{ data: LiveEventRow[] | null; error: { message: string } | null }>;
          };
        };
      };
    };
  };
}

export async function loadLiveEvents(client: LiveEventsClient, now: Date): Promise<LiveEvent[]> {
  const since = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const rows = await fetchAllRows<LiveEventRow>((from, to) =>
    client
      .from("events")
      .select("id, title, place_name, freeform_location, region_id, source_account, run_start_date, run_end_date, opening_datetime, description")
      .eq("curation_status", "approved")
      .is("removed_at", null)
      .or(
        `run_end_date.gte.${since},and(run_end_date.is.null,run_start_date.gte.${since}),and(run_end_date.is.null,run_start_date.is.null,opening_datetime.gte.${since})`,
      )
      .range(from, to),
  );
  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    placeName: r.place_name,
    location: r.freeform_location,
    regionId: r.region_id,
    sourceAccount: r.source_account,
    runStartDate: r.run_start_date,
    runEndDate: r.run_end_date,
    openingDatetime: r.opening_datetime,
    description: r.description,
  }));
}

// The candidate's comuna, or its account: a venue's own follow-up post and
// another account's announcement of the same show both land in one of
// the two. Biggest pool measured: 75 (Santiago).
export function poolFor(live: LiveEvent[], regionId: string | null, sourceAccount: string | null): LiveEvent[] {
  return live.filter((e) => (regionId !== null && e.regionId === regionId) || (sourceAccount !== null && e.sourceAccount === sourceAccount));
}

export interface LlmDuplicate {
  existingId: string;
  existingTitle: string;
  reason: string;
}

export interface FindLlmDuplicatesOptions<C> {
  // Which candidates to ask about: in practice wouldInsertAsNew, so only
  // what the deterministic dedup would have stored as a brand-new event.
  shouldCheck: (c: C) => boolean;
  toEvent: (c: C) => DuplicateCheckEvent & { regionId: string | null };
  loadLive: () => Promise<LiveEvent[]>;
  concurrency?: number;
}

// One call per candidate, the shape that was measured. A failure anywhere
// (loading the pool, a call) leaves every candidate as it was.
export async function findLlmDuplicates<C>(
  client: MessagesClient,
  candidates: C[],
  opts: FindLlmDuplicatesOptions<C>,
): Promise<{ matches: Map<C, LlmDuplicate>; checked: number; usage: DiscoverUsage }> {
  const matches = new Map<C, LlmDuplicate>();
  const usage: DiscoverUsage = { inputTokens: 0, outputTokens: 0, cacheCreationInputTokens: 0, cacheReadInputTokens: 0 };
  const toCheck = candidates.filter(opts.shouldCheck);
  if (toCheck.length === 0) return { matches, checked: 0, usage };

  let live: LiveEvent[];
  try {
    live = await opts.loadLive();
  } catch (err) {
    console.error(`[duplicate-check] could not load live events, skipping the check: ${(err as Error).message}`);
    return { matches, checked: 0, usage };
  }

  let checked = 0;
  const queue = [...toCheck];
  async function worker(): Promise<void> {
    for (let c = queue.shift(); c !== undefined; c = queue.shift()) {
      const event = opts.toEvent(c);
      const pool = poolFor(live, event.regionId, event.sourceAccount);
      if (pool.length === 0) continue;
      checked += 1;
      const result = await checkDuplicates(client, [{ candidates: [{ ref: c, event }], existing: pool }]);
      usage.inputTokens += result.usage.inputTokens;
      usage.outputTokens += result.usage.outputTokens;
      usage.cacheCreationInputTokens! += result.usage.cacheCreationInputTokens ?? 0;
      usage.cacheReadInputTokens! += result.usage.cacheReadInputTokens ?? 0;
      const match = result.matches.get(c);
      if (match) {
        const existing = pool.find((e) => e.id === match.existingId);
        matches.set(c, { existingId: match.existingId, existingTitle: existing?.title ?? "", reason: match.reason });
      }
    }
  }
  await Promise.all(Array.from({ length: opts.concurrency ?? 4 }, worker));
  return { matches, checked, usage };
}
