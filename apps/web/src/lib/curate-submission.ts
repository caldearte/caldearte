import Anthropic from "@anthropic-ai/sdk";
import {
  ART_SCOPE_POLICY,
  TEXT_CURATION_POLICY,
  INSTITUTIONAL_EXCLUSION_POLICY,
  EVENT_TYPE_POLICY,
  runVisionCheck,
  type ImageFetcher,
  type VisionMessagesClient,
} from "@caldearte/curation-policy";

// Same model + same editorial policy text as apps/curator's Event
// Discovery (see @caldearte/curation-policy) — but a single self-reported
// candidate, not a batch of scraped text, so this is deliberately its own
// small prompt rather than a call into discover.ts's curate(): that
// function's grounded-quote verification ("cite the exact phrase from the
// source text") doesn't make sense for a submitter describing their own
// event directly, and its JSON schema is shaped for many candidates at
// once.
const MODEL = "claude-haiku-4-5";

export interface SubmissionInput {
  title: string;
  description: string;
  artist: string | null;
  galleryName: string;
  comunaName: string;
  openingDatetime: string; // "YYYY-MM-DDTHH:mm", Chile local time
  runEndDate: string | null; // "YYYY-MM-DD"
}

export interface CurationDecision {
  status: "approved" | "rejected";
  sensitivityTags: string[];
  curationReasoning: string;
  publicMessage: string;
}

const RESPONSE_SCHEMA_INSTRUCTION = `Responde ÚNICAMENTE con un bloque de código JSON (\`\`\`json ... \`\`\`) con este formato exacto, sin texto fuera del bloque:
{ "status": "approved" | "rejected", "sensitivityTags": string[] (subconjunto de ["desnudo_erotismo", "guerra_violencia", "memoria_dictadura"]), "curationReasoning": string, "publicMessage": string }

- "curationReasoning": explicación breve e interna de tu decisión (nunca se muestra al público).
- "publicMessage": el mensaje que SÍ verá quien envió el formulario. Debe ser educado, cercano y claro sobre el motivo — nunca genérico ("no cumple los requisitos") ni confrontacional. Si apruebas, agradece y confirma brevemente que la expo ya está publicada. Si rechazas, explica con respeto y en un tono educativo (no acusatorio) cuál de los criterios editoriales de Caldearte no se cumplió, en 2-3 frases. Escribe SIEMPRE en español de Chile, registro "tú" — NUNCA voseo rioplatense: usa "tienes"/"puedes"/"escríbenos", nunca "tenés"/"podés"/"escribinos".`;

const SCOPE_INSTRUCTION = `Este formulario es solo para una EXPOSICIÓN CON INAUGURACIÓN (la fiesta de apertura de una muestra). Si lo descrito es en cambio una visita guiada a una muestra ya abierta, un taller, o una exposición sin una fecha de inauguración real, responde "rejected" y explica en publicMessage que este formulario es específicamente para inauguraciones — puede reenviar cuando tenga la fecha de su inauguración, o escribir por el formulario de contacto para otro tipo de actividad.`;

function buildPrompt(input: SubmissionInput): string {
  return `${ART_SCOPE_POLICY}

${TEXT_CURATION_POLICY}

${INSTITUTIONAL_EXCLUSION_POLICY}

${EVENT_TYPE_POLICY}

${SCOPE_INSTRUCTION}

Este es un dato AUTOREPORTADO directamente por la galería/espacio a través de un formulario público (no un texto extraído de una fuente externa) — no hay "cita textual" que verificar, evalúa el contenido tal como se describe a continuación:

Título: ${input.title}
Galería/espacio: ${input.galleryName}
Comuna: ${input.comunaName}
Artista: ${input.artist ?? "(no especificado)"}
Fecha de inauguración: ${input.openingDatetime}
Fecha de término de la muestra: ${input.runEndDate ?? "(no especificada)"}
Descripción: ${input.description}

${RESPONSE_SCHEMA_INSTRUCTION}`;
}

function extractFencedJson(text: string): unknown {
  const match = text.match(/```json\s*([\s\S]*?)```/) ?? text.match(/```\s*([\s\S]*?)```/);
  const raw = match ? match[1] : text;
  return JSON.parse(raw);
}

function isValidTags(value: unknown): value is string[] {
  const allowed = new Set(["desnudo_erotismo", "guerra_violencia", "memoria_dictadura"]);
  return Array.isArray(value) && value.every((t) => typeof t === "string" && allowed.has(t));
}

// Text axes 1-4 + scope. Axis 5 (image) is a separate call — see
// curateSubmissionImage below, only run when this approves.
export async function curateSubmissionText(input: SubmissionInput): Promise<CurationDecision> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not set");

  const client = new Anthropic({ apiKey });
  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 700,
    messages: [{ role: "user", content: buildPrompt(input) }],
  });

  const text = response.content.map((b) => (b.type === "text" ? b.text : "")).join("");
  let parsed: unknown;
  try {
    parsed = extractFencedJson(text);
  } catch {
    throw new Error(`curate-submission: could not parse Haiku response: ${text}`);
  }

  const row = parsed as Partial<CurationDecision>;
  if (row.status !== "approved" && row.status !== "rejected") {
    throw new Error(`curate-submission: invalid status in response: ${text}`);
  }

  return {
    status: row.status,
    sensitivityTags: isValidTags(row.sensitivityTags) ? row.sensitivityTags : [],
    curationReasoning: typeof row.curationReasoning === "string" ? row.curationReasoning : "",
    publicMessage: typeof row.publicMessage === "string" ? row.publicMessage : "",
  };
}

// Axis 5, reusing runVisionCheck as-is (see @caldearte/curation-policy) —
// the image isn't hosted anywhere public yet at this point in the
// request, so the injected ImageFetcher just hands back the bytes already
// in memory instead of actually fetching a URL.
export async function curateSubmissionImage(base64: string, mediaType: string): Promise<"approved" | "rejected"> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not set");

  const client = new Anthropic({ apiKey });
  // Anthropic's own SDK types `messages.create`'s params more narrowly
  // than VisionMessagesClient's generic `Record<string, unknown>` — that
  // makes the client structurally incompatible by TS's contravariance
  // rules even though it satisfies the interface at runtime (same object
  // shape apps/curator's own MessagesClient already relies on). A thin
  // adapter is simpler than loosening either type.
  const visionClient: VisionMessagesClient = { messages: { create: (params) => client.messages.create(params as never) } };
  const inMemoryFetcher: ImageFetcher = { fetch: async () => ({ base64, mediaType }) };
  const { status } = await runVisionCheck(visionClient, inMemoryFetcher, "in-memory");
  return status;
}
