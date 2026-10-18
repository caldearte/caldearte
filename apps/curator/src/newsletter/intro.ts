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
// "Inauguraciones de este fin de semana" may ever be described as opening;
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
// ("¡no te lo pierdas!"). One short paragraph, two sentences at most
// (2026-10-18, Daniel: newsletters where the AI writes a lot read as a
// wall of text — was three paragraphs since 2026-08-08). Still about
// what's interesting to go see, not logistics.
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
// Tone and "find a thread" instruction added 2026-08-08 (user request):
// academic-but-warm — a knowledgeable friend, not a press release — and
// permission (not a requirement) to name a real thematic/content/
// technique connection across two or more of the GIVEN titles, if one
// genuinely stands out; never invented, never forced. Also explicit now:
// the curatorial rubric shapes what gets emphasized, but the text itself
// must never name it ("nuestra curaduría", "nuestro criterio editorial")
// — it should read as one person's take, not a policy statement.
const SYSTEM_PROMPT = `Eres un investigador de arte que escribe la introducción del boletín de fin de semana de Caldearte, una guía de exposiciones de arte visual en Chile.
Te entregan el número real de exposiciones activas este fin de semana en una región, y una lista de esas exposiciones agrupada bajo los mismos encabezados que usa el boletín.
Escribe un solo párrafo muy breve, en español: como máximo dos frases y 45 palabras. El tono es académico pero cercano: como el mensaje de un amigo que sabe muchísimo de arte y te cuenta, con entusiasmo genuino y criterio propio, qué vale la pena ver este fin de semana — nunca como un comunicado de prensa ni una lista promocional.

El foco de esta introducción es QUÉ HAY DE INTERESANTE PARA VER este fin de semana — sobre todo las inauguraciones, pero también lo que sigue en exhibición — no la logística (fechas, cuántas comunas, cuántas exposiciones hay en total). Los números y el panorama pasan a segundo plano; lo que se destaca es lo que vale la pena ir a ver y por qué.

Al elegir qué exposiciones destacar (siempre solo por su título, lugar y encabezado — nunca por una sinopsis que no tienes), prioriza las que parezcan tener más peso discursivo y postura crítica por sobre lo meramente decorativo o pasivo; desconfía de imaginería bélica o religiosa sin postura crítica declarada; evita cualquier título que sugiera estetizar el trauma o la violencia de forma explícita. Este criterio guía qué se destaca y cómo se enmarca, pero NUNCA debe nombrarse en el texto — nada de "nuestra curaduría", "nuestro criterio editorial" ni frases equivalentes. El texto debe leerse como la mirada de una sola persona, no como una declaración de políticas.

Si al mirar la lista completa (títulos, espacios, comunas) aparece con naturalidad un hilo real entre dos o más exposiciones — un tema, un tipo de contenido, una técnica, un diálogo entre espacios o comunas — puedes tejerlo en el texto. Es una posibilidad, no una obligación: si no hay ningún hilo genuino, no lo inventes ni lo fuerces.

Contenido: entra directo en lo más interesante del fin de semana, con énfasis en inauguraciones si las hay — nombra una o dos, junto a su espacio, con un gancho basado solo en el título y el lugar. Nada de cierre ni invitación a explorar la guía: las tarjetas vienen justo debajo.

Reglas estrictas:
- Usa ÚNICAMENTE la información entregada. No inventes fechas, horas, artistas, técnicas, temáticas ni descripciones de obra que no estén en la lista.
- No menciones ninguna región, comuna o ciudad que no aparezca explícitamente junto a ese ítem en la lista — si un ítem no trae comuna, no le asignes una tú, ni la infieras del nombre del espacio o del título.
- No uses markdown ni ningún otro formato (nada de asteriscos, guiones bajos, numerales) — el texto se muestra tal cual, sin renderizar.
- Solo puedes decir que una exposición "inaugura" o "abre" este fin de semana si aparece bajo el encabezado "Inauguraciones de este fin de semana". Cualquier exposición bajo otro encabezado (por ejemplo "Expos para visitar este fin de semana") ya está en exhibición — descríbela como tal ("sigue en exhibición", "se puede visitar"), nunca como algo que inaugura o abre, aunque su título lo sugiera.
- Si mencionas una cifra de cuántas exposiciones hay en la región, usa EXACTAMENTE el número entregado al inicio del mensaje — nunca cuentes tú mismo los ítems de la lista, que puede estar incompleta respecto del total real.
- No cites más de dos títulos, escritos tal como aparecen.
- No prometas nada que la lista no respalde (nada de "y mucho más").
- Evita signos de exclamación, superlativos ("imperdible", "increíble") y lenguaje publicitario.
- Nunca nombres textualmente el criterio editorial, la curaduría o las políticas de Caldearte — el criterio se nota en qué eliges destacar, no se declara.
- Responde solo con el texto del párrafo — sin títulos, comillas ni explicaciones adicionales.`;

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

export async function generateRegionIntro(
  sections: DigestSection[],
  regionTotalThisWeek: number,
  deps: GenerateIntroDeps = {},
): Promise<string | null> {
  const eventList = buildEventList(sections);
  if (!eventList) return null;
  const userContent = `Número real de exposiciones activas este fin de semana en la región: ${regionTotalThisWeek}.\n\n${eventList}`;
  return callHaikuForIntro(SYSTEM_PROMPT, userContent, 200, deps, "generateRegionIntro");
}
