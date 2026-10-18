// AI-generated texts for the weekly digest — a short, grounded intro and
// one paragraph per opening day, once per macro-región (shared across
// every subscriber in that región, not generated per-subscriber). Real risk
// to guard against here, confirmed by this project's own history
// (docs/data-model.md / the 2026-07-22 fabrication incident): Haiku
// invented whole events when given loose freedom over event text. This
// module is deliberately narrow — it only ever sees titles/venues/comunas
// already curated and approved, is instructed never to add facts beyond
// that list, and any failure (budget exceeded, API error) degrades to no
// intro at all rather than blocking the digest.
import { OPENINGS_LABEL, type DigestSection } from "../lib/notify.js";
import { recordUsage, getConfigNumber, getCurrentMonthSpend } from "../lib/usage-tracking.js";

const MODEL = "claude-haiku-4-5" as const;

// Narrow structural interface, same pattern as event-discovery/discover.ts's
// own MessagesClient — lets tests inject a stub without hitting the real API.
export interface MessagesClient {
  messages: {
    create(params: Record<string, unknown>): Promise<{
      content: Array<{ type: string; text?: string }>;
      usage: {
        input_tokens: number;
        output_tokens: number;
        cache_creation_input_tokens?: number | null;
        cache_read_input_tokens?: number | null;
      };
    }>;
  };
}

export interface GenerateIntroDeps {
  messagesClient?: MessagesClient;
}

// Budget check, client creation, the actual call, and usage recording —
// degrades to null on any failure (budget exceeded, API error); the
// digest always sends fine without an intro.
async function callHaikuForIntro(system: string, userContent: string, maxTokens: number, deps: GenerateIntroDeps, callerName: string): Promise<string | null> {
  try {
    const [spend, budget] = await Promise.all([getCurrentMonthSpend(), getConfigNumber("monthly_budget_usd")]);
    if (spend >= budget) {
      console.warn(`${callerName}: monthly budget already exceeded — skipping AI intro this week.`);
      return null;
    }
  } catch (err) {
    console.warn(`${callerName}: failed to check budget, skipping AI intro`, err);
    return null;
  }

  let client = deps.messagesClient;
  if (!client) {
    const { default: Anthropic } = await import("@anthropic-ai/sdk");
    client = new Anthropic() as unknown as MessagesClient;
  }

  try {
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: maxTokens,
      system,
      messages: [{ role: "user", content: userContent }],
    });

    await recordUsage({
      purpose: "newsletter_intro",
      model: MODEL,
      // No discovery pipeline — this call summarizes already-approved
      // events for the digest, not a new-candidate curation run.
      pipeline: null,
      usage: {
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
        cacheCreationInputTokens: response.usage.cache_creation_input_tokens ?? 0,
        cacheReadInputTokens: response.usage.cache_read_input_tokens ?? 0,
      },
    });

    const text = response.content.find((b) => b.type === "text")?.text?.trim();
    return text || null;
  } catch (err) {
    console.error(`${callerName}: Haiku call failed — sending the digest without an intro`, err);
    return null;
  }
}

// Intro + one paragraph per day (Daniel, 2026-10-18: a short general
// intro for the whole Thursday-Sunday, then a few lines over each day's
// cards). One call for all of it, so the day paragraphs don't repeat what
// the intro already said and the model sees the whole edition at once.
// Same anti-fabrication posture as the single intro above: titles, venues
// and comunas only, the day each opening falls on, nothing else.
export interface DigestTexts {
  intro: string | null;
  // Keyed by the day's date, YYYY-MM-DD in Santiago.
  days: Record<string, string>;
}

const WEEKDAYS_ES = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];

function santiagoDateOf(iso: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Santiago" }).format(new Date(iso));
}

function dayName(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  return `${WEEKDAYS_ES[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]} ${d}`;
}

function itemLine(e: DigestSection["events"][number]): string {
  return `- ${e.title} (${e.placeName}${e.comunaName ? `, ${e.comunaName}` : ""})`;
}

// The openings grouped by their day, plus what's already on display as a
// separate block the intro may draw on but never call an opening.
export function buildDaysInput(sections: DigestSection[], regionTotal: number): { content: string; dates: string[] } | null {
  const openings = sections.find((s) => s.label === OPENINGS_LABEL)?.events ?? [];
  const byDay = new Map<string, typeof openings>();
  for (const e of openings) {
    if (!e.openingDatetime) continue;
    const date = santiagoDateOf(e.openingDatetime);
    if (!byDay.has(date)) byDay.set(date, []);
    byDay.get(date)!.push(e);
  }
  const dates = [...byDay.keys()].sort();
  const running = sections.find((s) => s.label === "Expos para visitar de jueves a domingo")?.events ?? [];
  if (dates.length === 0 && running.length === 0) return null;

  const lines = [`Número real de exposiciones activas de jueves a domingo en la región: ${regionTotal}.`, ""];
  lines.push("Inauguraciones, por día:");
  for (const date of dates) {
    lines.push(`${date} (${dayName(date)}):`);
    for (const e of byDay.get(date)!) lines.push(itemLine(e));
  }
  if (dates.length === 0) lines.push("(ninguna)");
  if (running.length > 0) {
    lines.push("", "Ya en exhibición (no inauguran):");
    for (const e of running) lines.push(itemLine(e));
  }
  return { content: lines.join("\n"), dates };
}

const DAYS_SYSTEM_PROMPT = `Eres un investigador de arte que escribe los textos del boletín de Caldearte, una guía de exposiciones de arte visual en Chile, que cada jueves en la mañana cuenta qué inaugura de jueves a domingo en una región.
Te entregan las inauguraciones de jueves a domingo agrupadas por día (con su fecha), y aparte lo que ya está en exhibición.

Escribe, en español:
1. "intro": una introducción general de los cuatro días, de una o dos frases y como máximo 35 palabras. Da el panorama o un hilo real entre lo que inaugura, sin nombrar títulos. Si en total hay una sola inauguración, la intro no la nombra: habla de lo que ya está en exhibición.
2. "dias": un párrafo por cada fecha que trae inauguraciones, de una o dos frases y como máximo 30 palabras. Nombra como máximo DOS inauguraciones de ese día, con su espacio, y da un gancho basado solo en el título y el lugar; si hay más, no las enumeres (las tarjetas del boletín ya las muestran todas). Si ese día hay una sola, basta una frase.

El tono es académico pero cercano: como un amigo que sabe muchísimo de arte y te cuenta qué vale la pena ver, nunca un comunicado de prensa ni una lista promocional. Al elegir qué destacar, prioriza lo que parezca tener más peso discursivo y postura crítica por sobre lo decorativo; desconfía de imaginería bélica o religiosa sin postura crítica declarada; evita títulos que sugieran estetizar el trauma o la violencia. Ese criterio nunca se nombra en el texto.

Reglas estrictas:
- Usa ÚNICAMENTE la información entregada. No inventes horas, artistas, técnicas, temáticas ni descripciones de obra.
- No menciones ninguna comuna o ciudad que no venga junto a ese ítem.
- Solo lo que aparece bajo "Inauguraciones" puede decirse que inaugura o abre; lo que está "Ya en exhibición" sigue abierto, nunca inaugura.
- Copia cada título letra por letra, tal como aparece en la lista.
- No escribas fechas ni días de la semana ("jueves", "el sábado", "esta semana") en ningún texto: el boletín ya pone cada día como título.
- El gancho sale del título y el lugar, no de suposiciones: no le atribuyas a una muestra intenciones, preguntas ni apuestas que su título no dice.
- Nada de markdown, signos de exclamación, superlativos ("imperdible", "increíble") ni lenguaje publicitario.
- Responde SOLO con un objeto JSON, sin texto antes ni después: {"intro": "...", "dias": {"AAAA-MM-DD": "...", ...}}, con exactamente las fechas que traen inauguraciones.`;

// Strict parse: only the requested dates survive, every text trimmed and
// non-empty. Anything off → no texts at all, the digest still sends.
// Haiku doesn't keep to the prompt's word limits (first real test,
// 2026-10-18: a 50-word Saturday against "max 30"), so a text past
// MAX_WORDS is dropped rather than shown — that day goes without one.
const MAX_WORDS = 60;
const withinLimit = (text: string) => text.split(/\s+/).length <= MAX_WORDS;
export function parseDigestTexts(raw: string, dates: string[]): DigestTexts | null {
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    const parsed = JSON.parse(raw.slice(start, end + 1)) as { intro?: unknown; dias?: unknown };
    const intro = typeof parsed.intro === "string" && parsed.intro.trim() && withinLimit(parsed.intro.trim()) ? parsed.intro.trim() : null;
    const days: Record<string, string> = {};
    if (parsed.dias && typeof parsed.dias === "object") {
      for (const date of dates) {
        const text = (parsed.dias as Record<string, unknown>)[date];
        if (typeof text === "string" && text.trim() && withinLimit(text.trim())) days[date] = text.trim();
      }
    }
    return { intro, days };
  } catch {
    return null;
  }
}

export async function generateDigestTexts(sections: DigestSection[], regionTotal: number, deps: GenerateIntroDeps = {}): Promise<DigestTexts> {
  const input = buildDaysInput(sections, regionTotal);
  if (!input) return { intro: null, days: {} };
  const raw = await callHaikuForIntro(DAYS_SYSTEM_PROMPT, input.content, 900, deps, "generateDigestTexts");
  return (raw && parseDigestTexts(raw, input.dates)) ?? { intro: null, days: {} };
}
