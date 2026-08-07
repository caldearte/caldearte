// AI-generated intro for the weekly digest — one short, grounded teaser
// per macro-región (shared across every subscriber in that región, not
// generated per-subscriber), summarizing what's on this week. Real risk
// to guard against here, confirmed by this project's own history
// (docs/data-model.md / the 2026-07-22 fabrication incident): Haiku
// invented whole events when given loose freedom over event text. This
// module is deliberately narrow — it only ever sees titles/venues/comunas
// already curated and approved, is instructed never to add facts beyond
// that list, and any failure (budget exceeded, API error) degrades to no
// intro at all rather than blocking the digest.
import type { DigestSection } from "../lib/notify.js";
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

// Only titles + venue + comuna, deliberately no dates/hours/descriptions
// — the less the model has to work with, the less it can embellish.
// Excludes "En otras regiones" (not this subscriber's own región's news).
//
// Grouped under each section's own label (real bug found 2026-07-31: a
// flat, uncategorized list let Haiku call an already-running show an
// "inauguración" just because its title echoed one that really was
// opening this week — it had no way to tell the two apart). Only
// "Inauguraciones de esta semana" may ever be described as opening;
// everything else is already on display.
function buildEventList(sections: DigestSection[]): string {
  const lines: string[] = [];
  for (const section of sections) {
    if (section.label === "En otras regiones") continue;
    if (section.events.length === 0) continue;
    lines.push(`${section.label}:`);
    for (const e of section.events) {
      lines.push(`- ${e.title} (${e.placeName}${e.comunaName ? `, ${e.comunaName}` : ""})`);
    }
  }
  return lines.join("\n");
}

// Style modeled on how independent art-world editorial newsletters (e-flux
// announcements, gallery weeklies) actually write their intros: understated,
// specific, curatorial rather than promotional — never listicle-y ad copy
// ("¡no te lo pierdas!"). Three short paragraphs (2026-08-08, was two —
// user feedback: the old version leaned on logistics — dates, how many
// shows, spread across comunas — instead of what's actually interesting
// to go see, especially openings).
//
// The "curatorial weight" framing below is a real, deliberate choice, not
// a stray adjective: Caldearte's own published criteria
// (esCL.curatoriaPage — "El peso de la hegemonía," "La estetización del
// trauma," etc.) are summarized here so Haiku has an actual rubric for
// WHICH of the real, given titles is worth spotlighting — this is a
// selection/framing judgment over facts already in the list, not a new
// avenue for invention. It never gets new data to reason from (still only
// titles/venue/comuna, nothing else) — the anti-fabrication posture from
// the 2026-07-22 incident is unchanged, only the angle of the prose is.
const SYSTEM_PROMPT = `Eres el redactor editorial de Caldearte, un boletín semanal que reúne exposiciones de arte visual en Chile.
Te entregan el número real de exposiciones activas esta semana en una región, y una lista de esas exposiciones agrupada bajo los mismos encabezados que usa el boletín.
Escribe la introducción del boletín de esa región: tres párrafos breves, en español, con voz curatorial — precisa y algo evocadora, nunca publicitaria ni de listicle.

El foco de esta introducción es QUÉ HAY DE INTERESANTE PARA VER esta semana — sobre todo las inauguraciones — no la logística (fechas, cuántas comunas, cuántas exposiciones hay en total). Los números y el panorama pasan a segundo plano; lo que se destaca es lo que vale la pena ir a ver y por qué.

Al elegir qué exposiciones destacar (siempre solo por su título, lugar y encabezado — nunca por una sinopsis que no tienes), prioriza las que parezcan más alineadas con el criterio editorial real de Caldearte: obras con peso discursivo y postura crítica por sobre lo meramente decorativo o pasivo; sospecha de imaginería bélica o religiosa sin postura crítica declarada; nada que estetice el trauma o la violencia de forma explícita. Esto es un criterio de ÉNFASIS narrativo, no un filtro — la lista que recibes ya fue curada, así que toda ella es válida; simplemente dale más protagonismo en el texto a lo que mejor encarna esa postura.

Estructura:
- Párrafo 1: entra directo en lo más interesante de la semana, con énfasis en inauguraciones si las hay — nómbralas, junto a su espacio, y da un gancho basado solo en el título y el lugar.
- Párrafo 2: una o dos exposiciones más (inauguración u otra) que valgan la pena destacar, con el mismo criterio.
- Párrafo 3: cierre breve que abra el apetito por explorar el resto de la guía, sin resumir lo ya dicho ni volver a la logística.

Reglas estrictas:
- Usa ÚNICAMENTE la información entregada. No inventes fechas, horas, artistas, técnicas, temáticas ni descripciones de obra que no estén en la lista.
- Solo puedes decir que una exposición "inaugura" o "abre" esta semana si aparece bajo el encabezado "Inauguraciones de esta semana". Cualquier exposición bajo otro encabezado (por ejemplo "Expos para visitar esta semana") ya está en exhibición — descríbela como tal ("sigue en exhibición", "se puede visitar"), nunca como algo que inaugura o abre, aunque su título lo sugiera.
- Si mencionas una cifra de cuántas exposiciones hay en la región, usa EXACTAMENTE el número entregado al inicio del mensaje — nunca cuentes tú mismo los ítems de la lista, que puede estar incompleta respecto del total real.
- No repitas la lista completa ni cites más de tres o cuatro títulos en total entre los tres párrafos, escritos tal como aparecen.
- No prometas nada que la lista no respalde (nada de "y mucho más").
- Evita signos de exclamación, superlativos ("imperdible", "increíble") y lenguaje publicitario.
- Cada párrafo debe tener entre 2 y 3 frases.
- Responde solo con el texto de los tres párrafos, separados por una línea en blanco cada uno — sin títulos, comillas ni explicaciones adicionales.`;

// Same anti-fabrication posture as the main intro above, condensed to one
// paragraph — this runs once per región per week too (see run.ts), not
// per subscriber. Only ever sees the SAME deterministic "En otras
// regiones" sample every subscriber in the región is shown as cards (see
// run.ts's buildDigestSections — no longer randomized per subscriber,
// 2026-08-08, specifically so this text and the cards below it always
// agree on which shows it's talking about).
const OTHER_REGIONS_SYSTEM_PROMPT = `Eres el redactor editorial de Caldearte, un boletín semanal que reúne exposiciones de arte visual en Chile.
Te entregan una muestra de exposiciones activas esta semana FUERA de la región del lector (distintas regiones de Chile).
Escribe un solo párrafo breve, en español, con voz curatorial — precisa y algo evocadora, nunca publicitaria — que invite a mirar hacia el resto del país.

El foco es de CONTENIDO, no de geografía ni logística: nombra una o dos exposiciones de la lista (con su lugar) que mejor encarnen el criterio editorial de Caldearte — obras con peso discursivo y postura crítica por sobre lo decorativo o pasivo — y da un gancho basado solo en el título y el lugar, nunca en una sinopsis que no tienes.

Reglas estrictas:
- Usa ÚNICAMENTE la información entregada. No inventes fechas, horas, artistas, técnicas, temáticas ni descripciones de obra.
- No repitas la lista completa ni cites más de dos títulos, escritos tal como aparecen.
- Evita signos de exclamación, superlativos y lenguaje publicitario.
- Entre 2 y 3 frases en total.
- Responde solo con el texto del párrafo — sin título, comillas ni explicaciones adicionales.`;

export interface GenerateIntroDeps {
  messagesClient?: MessagesClient;
}

// Shared by generateRegionIntro and generateOtherRegionsIntro — budget
// check, client creation, the actual call, and usage recording. Both
// callers degrade to null on any failure (budget exceeded, API error) —
// the digest always sends fine without an intro.
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

export async function generateRegionIntro(
  sections: DigestSection[],
  regionTotalThisWeek: number,
  deps: GenerateIntroDeps = {},
): Promise<string | null> {
  const eventList = buildEventList(sections);
  if (!eventList) return null;
  const userContent = `Número real de exposiciones activas esta semana en la región: ${regionTotalThisWeek}.\n\n${eventList}`;
  return callHaikuForIntro(SYSTEM_PROMPT, userContent, 500, deps, "generateRegionIntro");
}

// One paragraph, region-agnostic teaser for "En otras regiones" — takes a
// flat event list (that section's own deterministic sample, see run.ts),
// not grouped DigestSections, since there's no "inauguración vs. ya
// abierta" distinction to preserve here the way the main intro needs
// (every event here is simply "elsewhere, active this week").
export async function generateOtherRegionsIntro(events: DigestSection["events"], deps: GenerateIntroDeps = {}): Promise<string | null> {
  if (events.length === 0) return null;
  const userContent = events.map((e) => `- ${e.title} (${e.placeName}${e.comunaName ? `, ${e.comunaName}` : ""})`).join("\n");
  return callHaikuForIntro(OTHER_REGIONS_SYSTEM_PROMPT, userContent, 250, deps, "generateOtherRegionsIntro");
}
