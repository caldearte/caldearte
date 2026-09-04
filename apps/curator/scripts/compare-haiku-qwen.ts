// Throwaway one-off comparison: claude-haiku-4-5 vs. qwen/qwen3.8-flash
// (via OpenRouter) on the event-discovery curation task. Takes ~20 already
// -approved events from Supabase, re-fetches each one's source_url to
// reconstruct a fresh input block (the original raw Tavily `block` isn't
// persisted anywhere), runs the SAME systemPrompt + the SAME deterministic
// filter chain (both live inside curate()) through both models, and diffs
// the verdicts. Not wired into index.ts, no writes to Supabase. Run with
// `pnpm --filter @caldearte/curator compare-models` (loads .env via Node's
// --env-file, no dotenv dependency needed).
import { writeFileSync } from "node:fs";
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@supabase/supabase-js";
import { isSafeExternalUrl } from "@caldearte/curation-policy";
import {
  buildBlock,
  buildSystemPrompt,
  currentMonthLabel,
  curate,
  type EventCandidate,
  type MessagesClient,
  type RawResult,
} from "../src/event-discovery/discover.js";
import { decodeHtmlEntities } from "../src/event-discovery/extractors.js";

// Reads via the PUBLIC anon key (apps/web's own NEXT_PUBLIC_* values, not a
// secret — same key already shipped to every browser) rather than
// getSupabaseClient()'s service-role key: RLS already exposes exactly what
// this script needs (curation_status = 'approved' events, see
// 20260711171717_create_core_schema.sql's "Public can read approved
// events" policy), and it points at PRODUCTION data (the local
// SUPABASE_URL/SERVICE_ROLE_KEY in root .env deliberately points at a
// schema-only local instance with no real curated events — the whole
// point of this comparison is real production content). No local .env
// edits needed: NEXT_PUBLIC_SUPABASE_URL/ANON_KEY already live in
// apps/web/.env.local.
function getPublicSupabaseClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY must be set (see apps/web/.env.local)");
  }
  return createClient(url, anonKey);
}

const SAMPLE_SIZE = Number(process.env.COMPARE_SAMPLE_SIZE ?? 20);
// Overridable so this same script/harness can compare Haiku against any
// OpenRouter model, not just Qwen — e.g. COMPARE_MODEL="inclusionai/ling-3.0-flash-fin:free"
const QWEN_MODEL = process.env.COMPARE_MODEL ?? "qwen/qwen3.8-flash";

interface SampleEvent {
  id: string;
  title: string;
  source_url: string;
  run_start_date: string | null;
  run_end_date: string | null;
  sensitivity_tags: string[];
}

// events_public already filters to curation_status = 'approved' (see
// 20260717050000_restrict_public_columns_via_views.sql) and doesn't expose
// curation_status/curation_reasoning/created_at at all (internal pipeline
// bookkeeping, kept off the anon-readable view on purpose) — ordering by
// opening_datetime instead, since that's the closest available proxy for
// "recent" and it's a real column on the view.
// Excludes social-media source_urls — a plain `fetch` can't recover real
// content from Instagram/Facebook/TikTok (JS-rendered, login-walled), so
// re-scraping those just feeds both models a login-wall page. Confirmed
// with a real 3-event sample (2026-09-03): 2 of 3 were Instagram URLs, one
// produced unparseable garbage from BOTH models, the other was skipped for
// too-short content — neither told us anything about curation quality.
// Only web bright sources (plain HTML, fetchable without JS) give a fair
// same-input comparison.
const SOCIAL_DOMAINS = ["instagram.com", "facebook.com", "tiktok.com", "twitter.com", "x.com"];

async function fetchSample(): Promise<SampleEvent[]> {
  const supabase = getPublicSupabaseClient();
  const { data, error } = await supabase
    .from("events_public")
    .select("id, title, source_url, run_start_date, run_end_date, sensitivity_tags")
    .not("source_url", "is", null)
    .order("opening_datetime", { ascending: false })
    .limit(SAMPLE_SIZE * 5); // over-fetch, then filter out social URLs client-side
  if (error) throw new Error(`Supabase query failed: ${error.message}`);
  return ((data ?? []) as SampleEvent[])
    .filter((e) => !SOCIAL_DOMAINS.some((d) => e.source_url.includes(d)))
    .slice(0, SAMPLE_SIZE);
}

// Regex-only tag strip, same convention page-fetch.ts's own comment
// documents for this workspace (no HTML-parsing dependency) — good enough
// for a one-off comparison, not meant as a general readability extractor.
function htmlToBlockContent(html: string): string {
  const stripped = html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return decodeHtmlEntities(stripped).slice(0, 6000);
}

async function fetchAsRawResult(event: SampleEvent): Promise<RawResult | null> {
  if (!isSafeExternalUrl(event.source_url)) {
    console.error(`  [skip] unsafe URL, refusing to fetch: ${event.source_url}`);
    return null;
  }
  try {
    const res = await fetch(event.source_url);
    if (!res.ok) {
      console.error(`  [skip] ${event.source_url} -> HTTP ${res.status}`);
      return null;
    }
    const html = await res.text();
    const content = htmlToBlockContent(html);
    if (content.length < 100) {
      console.error(`  [skip] ${event.source_url} -> content too short after stripping (${content.length} chars)`);
      return null;
    }
    return { title: event.title, url: event.source_url, content, score: 1, images: [] };
  } catch (err) {
    console.error(`  [skip] fetch failed for ${event.source_url}: ${(err as Error).message}`);
    return null;
  }
}

function anthropicMessagesClient(anthropic: Anthropic): MessagesClient {
  return {
    messages: {
      create: (params) => anthropic.messages.create(params as never) as unknown as ReturnType<MessagesClient["messages"]["create"]>,
    },
  };
}

// Real finding (2026-09-03): Qwen3.8-flash emits a genuine hidden
// "thinking" content block (separate from "text", billed via
// usage.output_tokens_details.thinking_tokens) before its final JSON — 10
// -20x more output tokens than Haiku for the identical task. Confirmed
// this can't be suppressed: OpenRouter's `reasoning: {enabled: false}` had
// zero effect (the thinking block appeared anyway), and an explicit
// system-prompt instruction ("no razones paso a paso, responde directo")
// also had zero effect — the model's own thinking block that time
// literally acknowledged the instruction while ignoring it. Accepted as an
// intrinsic, unconfigurable property of this model via this endpoint —
// still cheaper in real $ than Haiku despite the extra tokens (see
// compare-haiku-qwen-report.md's cost summary), just not something we can
// tune down further.
//
// OpenRouter's /api/v1/messages endpoint accepts the Anthropic Messages
// request shape almost as-is (see OpenRouter's Qwen3.8-flash quick-start
// docs) and returns the same {content, usage} envelope curate() already
// expects — the only glue needed is overriding `model` and adding the
// OpenRouter auth header, no request/response reshaping. curate() itself
// already filters content blocks to `type === "text"` before parsing, so
// the hidden "thinking" block is correctly ignored for JSON extraction —
// it only shows up in usage.output_tokens (and therefore in cost).
function openRouterMessagesClient(apiKey: string, model: string): MessagesClient {
  return {
    messages: {
      create: async (params) => {
        const res = await fetch("https://openrouter.ai/api/v1/messages", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({ ...params, model }),
        });
        if (!res.ok) {
          throw new Error(`OpenRouter request failed: ${res.status} ${await res.text()}`);
        }
        return res.json() as ReturnType<MessagesClient["messages"]["create"]>;
      },
    },
  };
}

interface ModelRun {
  candidate: EventCandidate | null; // first candidate from that single-event block, if any survived
  raw: EventCandidate[]; // full candidates array (normally length <= 1 for a single-event block)
  inputTokens: number;
  outputTokens: number;
  cacheCreationInputTokens: number;
  cacheReadInputTokens: number;
}

const EMPTY_USAGE = { inputTokens: 0, outputTokens: 0, cacheCreationInputTokens: 0, cacheReadInputTokens: 0 };

async function runModel(client: MessagesClient, systemPrompt: string, block: string): Promise<ModelRun> {
  try {
    const { candidates, usage } = await curate(client, systemPrompt, block);
    return {
      candidate: candidates.find((c) => c.status === "approved") ?? candidates[0] ?? null,
      raw: candidates,
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
      cacheCreationInputTokens: usage.cacheCreationInputTokens ?? 0,
      cacheReadInputTokens: usage.cacheReadInputTokens ?? 0,
    };
  } catch (err) {
    console.error(`  [error] curate() failed: ${(err as Error).message}`);
    return { candidate: null, raw: [], ...EMPTY_USAGE };
  }
}

// claude-haiku-4-5 published pricing (per million tokens): $1 input, $5
// output, $1.25 for a cache write, $0.10 for a cache read.
function haikuCostUsd(run: Pick<ModelRun, "inputTokens" | "outputTokens" | "cacheCreationInputTokens" | "cacheReadInputTokens">): number {
  return (
    (run.inputTokens / 1_000_000) * 1 +
    (run.outputTokens / 1_000_000) * 5 +
    (run.cacheCreationInputTokens / 1_000_000) * 1.25 +
    (run.cacheReadInputTokens / 1_000_000) * 0.1
  );
}

function summarizeCandidate(c: EventCandidate | null): string {
  if (!c) return "(sin candidato / error)";
  return `[${c.status}] runStartDate=${c.runStartDate ?? "null"} runEndDate=${c.runEndDate ?? "null"} sensitivityTags=${JSON.stringify(c.sensitivityTags)}`;
}

async function main() {
  const openRouterApiKey = process.env.OPENROUTER_API_KEY;
  if (!openRouterApiKey) throw new Error("OPENROUTER_API_KEY not set");

  console.log(`Fetching up to ${SAMPLE_SIZE} recent approved events with a source_url...`);
  const sample = await fetchSample();
  console.log(`Got ${sample.length} events.`);

  const anthropic = anthropicMessagesClient(new Anthropic());
  const openRouter = openRouterMessagesClient(openRouterApiKey, QWEN_MODEL);
  const systemPrompt = buildSystemPrompt(currentMonthLabel(new Date()));

  const lines: string[] = [
    "# Comparación Haiku vs Qwen3.8-flash — curación de eventos",
    "",
    `Muestra: ${sample.length} eventos ya aprobados. Cada uno se re-scrapeó desde su \`source_url\` para reconstruir un input equivalente (no idéntico al original) y se corrió por \`curate()\` con ambos modelos.`,
    "",
  ];

  let bothApproved = 0;
  let onlyHaiku = 0;
  let onlyQwen = 0;
  let neither = 0;
  let skipped = 0;
  let haikuCostTotal = 0;
  let qwenInputTokensTotal = 0;
  let qwenOutputTokensTotal = 0;

  for (const event of sample) {
    console.log(`\n=== "${event.title}" (${event.source_url}) ===`);
    const rawResult = await fetchAsRawResult(event);
    if (!rawResult) {
      skipped++;
      lines.push(`## ${event.title}`, "", `_Omitido: no se pudo reconstruir el input desde ${event.source_url}._`, "");
      continue;
    }
    const block = buildBlock(event.title, [rawResult]);

    const [haikuRun, qwenRun] = await Promise.all([
      runModel(anthropic, systemPrompt, block),
      runModel(openRouter, systemPrompt, block),
    ]);

    const haikuApproved = haikuRun.candidate?.status === "approved";
    const qwenApproved = qwenRun.candidate?.status === "approved";
    if (haikuApproved && qwenApproved) bothApproved++;
    else if (haikuApproved) onlyHaiku++;
    else if (qwenApproved) onlyQwen++;
    else neither++;

    const haikuCost = haikuCostUsd(haikuRun);
    haikuCostTotal += haikuCost;
    qwenInputTokensTotal += qwenRun.inputTokens;
    qwenOutputTokensTotal += qwenRun.outputTokens;

    console.log(`  DB actual: approved, runStartDate=${event.run_start_date} runEndDate=${event.run_end_date}`);
    console.log(`  Haiku:     ${summarizeCandidate(haikuRun.candidate)} (~$${haikuCost.toFixed(5)}, in=${haikuRun.inputTokens} out=${haikuRun.outputTokens})`);
    console.log(`  Qwen:      ${summarizeCandidate(qwenRun.candidate)} (in=${qwenRun.inputTokens} out=${qwenRun.outputTokens} tokens — costo real en tu dashboard de OpenRouter)`);

    lines.push(
      `## ${event.title}`,
      "",
      `- **Fuente**: ${event.source_url}`,
      `- **En base de datos (aprobado)**: runStartDate=${event.run_start_date ?? "null"}, runEndDate=${event.run_end_date ?? "null"}, sensitivityTags=${JSON.stringify(event.sensitivity_tags)}`,
      `- **Haiku (re-evaluado)**: ${summarizeCandidate(haikuRun.candidate)}`,
      `  - reasoning: ${haikuRun.candidate?.curationReasoning ?? "-"}`,
      `- **Qwen3.8-flash (re-evaluado)**: ${summarizeCandidate(qwenRun.candidate)}`,
      `  - reasoning: ${qwenRun.candidate?.curationReasoning ?? "-"}`,
      "",
    );
  }

  lines.push(
    "## Resumen",
    "",
    `- Ambos aprueban: ${bothApproved}`,
    `- Solo Haiku aprueba: ${onlyHaiku}`,
    `- Solo Qwen aprueba: ${onlyQwen}`,
    `- Ninguno aprueba: ${neither}`,
    `- Omitidos (fetch falló): ${skipped}`,
    "",
    `- **Costo Haiku (Anthropic), calculado de tokens reales**: ~$${haikuCostTotal.toFixed(4)}`,
    `- **Tokens Qwen (OpenRouter)**: ${qwenInputTokensTotal} input / ${qwenOutputTokensTotal} output — revisa el costo real en tu dashboard de OpenRouter (activity log), el precio por token de este modelo no está hardcodeado acá`,
    "",
    "_Nota: el input reconstruido no es idéntico al que vio Haiku originalmente (la página pudo cambiar desde entonces), así que un desacuerdo con la base de datos no es necesariamente un error de Qwen — puede reflejar contenido distinto. Comparar Haiku-re-evaluado vs Qwen-re-evaluado (mismo input, mismo momento) es la comparación justa._",
  );

  console.log("\n=== Resumen ===");
  console.log(`Ambos aprueban: ${bothApproved} | Solo Haiku: ${onlyHaiku} | Solo Qwen: ${onlyQwen} | Ninguno: ${neither} | Omitidos: ${skipped}`);
  console.log(`Costo Haiku (calculado): ~$${haikuCostTotal.toFixed(4)} | Tokens Qwen: in=${qwenInputTokensTotal} out=${qwenOutputTokensTotal}`);

  const reportPath = new URL("../compare-haiku-qwen-report.md", import.meta.url).pathname;
  writeFileSync(reportPath, lines.join("\n"));
  console.log(`\nReporte escrito en ${reportPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
