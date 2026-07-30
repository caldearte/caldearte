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
function buildEventList(sections: DigestSection[]): string {
  const lines: string[] = [];
  for (const section of sections) {
    if (section.label === "En otras regiones") continue;
    for (const e of section.events) {
      lines.push(`- ${e.title} (${e.placeName}${e.comunaName ? `, ${e.comunaName}` : ""})`);
    }
  }
  return lines.join("\n");
}

const SYSTEM_PROMPT = `Eres el redactor de un newsletter semanal de arte en Chile (Caldearte).
Te entregan una lista de exposiciones reales, ya verificadas, que hay esta semana en una región.
Escribe una introducción breve (máximo 2 frases, en español, tono cálido pero directo) invitando a revisar el boletín.

Reglas estrictas:
- Usa ÚNICAMENTE la información de la lista entregada. No inventes fechas, horas, artistas ni exposiciones que no estén en la lista.
- Puedes mencionar el número de exposiciones y, como máximo, dos títulos de la lista, escritos tal como aparecen.
- No prometas nada que no esté en la lista (por ejemplo, no digas "y mucho más" si la lista no da para eso).
- No uses signos de exclamación en exceso ni lenguaje publicitario exagerado.
- Responde solo con el texto de la introducción, sin comillas ni explicaciones adicionales.`;

export interface GenerateIntroDeps {
  messagesClient?: MessagesClient;
}

export async function generateRegionIntro(sections: DigestSection[], deps: GenerateIntroDeps = {}): Promise<string | null> {
  const eventList = buildEventList(sections);
  if (!eventList) return null;

  // Cost governance: same ceiling that gates new-region activation
  // (docs/region-discovery.md#cost-governance) — if the month's already
  // over budget, skip the intro rather than push further over. The
  // digest still sends fine without one.
  try {
    const [spend, budget] = await Promise.all([getCurrentMonthSpend(), getConfigNumber("monthly_budget_usd")]);
    if (spend >= budget) {
      console.warn("generateRegionIntro: monthly budget already exceeded — skipping AI intro this week.");
      return null;
    }
  } catch (err) {
    console.warn("generateRegionIntro: failed to check budget, skipping AI intro", err);
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
      max_tokens: 200,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: eventList }],
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
    console.error("generateRegionIntro: Haiku call failed — sending the digest without an intro", err);
    return null;
  }
}
