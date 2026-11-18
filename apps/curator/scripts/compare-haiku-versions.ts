// One-off quality check before moving curation from claude-haiku-4-5 to
// claude-haiku-5-5 (2026-11-18): ~10x cheaper per token, so the only real
// question is whether its verdicts hold. Runs the SAME curate() call (same
// system prompt, same deterministic filter chain) over the same
// re-scraped input with each model variant and diffs the verdicts against
// what production decided.
//
// The sample is a local JSON file (gitignored .scratch/, built from
// production by hand — the anon key can't read rejected_candidates) with
// three groups: `approved` (on the calendar), `rejected` (Haiku 4.5 said
// no) and `vetoed` (Haiku 4.5 approved, the MiniMax safety net vetoed —
// the scope-creep cases Haiku is known to miss). Web URLs only: a plain
// fetch can't read Instagram (see compare-haiku-qwen.ts).
//
// Run: pnpm --filter @caldearte/curator compare-haiku-versions
//   COMPARE_SAMPLE_FILE   default ../../.scratch/haiku-compare-sample.json
//   COMPARE_VARIANTS      default claude-haiku-4-5,claude-haiku-5-5:low,claude-haiku-5-5:medium
// No writes to Supabase. Every run spends real Anthropic credit.
import { readFileSync, writeFileSync } from "node:fs";
import Anthropic from "@anthropic-ai/sdk";
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
import { estimateCostUsd, hasPricing } from "../src/lib/pricing.js";

type Expected = "approved" | "rejected" | "vetoed";

interface SampleItem {
  expected: Expected;
  title: string;
  source_url: string;
}

interface Variant {
  label: string;
  model: string;
  effort: string | null;
}

const SAMPLE_FILE = process.env.COMPARE_SAMPLE_FILE ?? new URL("../../../.scratch/haiku-compare-sample.json", import.meta.url).pathname;
const REPORT_FILE = new URL("../../../.scratch/haiku-compare-report.md", import.meta.url).pathname;

function parseVariants(raw: string): Variant[] {
  return raw.split(",").map((spec) => {
    const [model, effort] = spec.trim().split(":");
    return { label: spec.trim(), model, effort: effort ?? null };
  });
}

const VARIANTS = parseVariants(process.env.COMPARE_VARIANTS ?? "claude-haiku-4-5,claude-haiku-5-5:low,claude-haiku-5-5:medium");

// Same regex-only strip as compare-haiku-qwen.ts — good enough for a
// same-input comparison, every variant sees the identical string.
function htmlToBlockContent(html: string): string {
  const stripped = html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return decodeHtmlEntities(stripped).slice(0, 6000);
}

async function fetchAsRawResult(item: SampleItem): Promise<RawResult | null> {
  if (!isSafeExternalUrl(item.source_url)) return null;
  try {
    const res = await fetch(item.source_url);
    if (!res.ok) return null;
    const content = htmlToBlockContent(await res.text());
    if (content.length < 100) return null;
    return { title: item.title, url: item.source_url, content, score: 1, images: [] };
  } catch {
    return null;
  }
}

// Swaps the model and, for models that take it, adds the effort level —
// curate() itself stays exactly the production code path.
function variantClient(anthropic: Anthropic, variant: Variant): MessagesClient {
  return {
    messages: {
      create: (params) =>
        anthropic.messages.create({
          ...params,
          model: variant.model,
          ...(variant.effort ? { output_config: { effort: variant.effort } } : {}),
        } as never) as unknown as ReturnType<MessagesClient["messages"]["create"]>,
    },
  };
}

interface VariantResult {
  verdict: "approved" | "rejected" | "error";
  candidate: EventCandidate | null;
  costUsd: number;
  outputTokens: number;
}

async function runVariant(client: MessagesClient, variant: Variant, systemPrompt: string, block: string): Promise<VariantResult> {
  try {
    const { candidates, usage } = await curate(client, systemPrompt, block);
    const candidate = candidates.find((c) => c.status === "approved") ?? candidates[0] ?? null;
    const costUsd = hasPricing(variant.model) ? estimateCostUsd(variant.model, usage) : 0;
    return { verdict: candidate?.status === "approved" ? "approved" : "rejected", candidate, costUsd, outputTokens: usage.outputTokens };
  } catch (err) {
    console.error(`  [error] ${variant.label}: ${(err as Error).message}`);
    return { verdict: "error", candidate: null, costUsd: 0, outputTokens: 0 };
  }
}

// What a correct verdict looks like for each group. `vetoed` items are
// ones the editorial line says should stay OUT (the safety net was right
// on these — they're documented misses), so the target is "rejected".
const TARGET: Record<Expected, "approved" | "rejected"> = { approved: "approved", rejected: "rejected", vetoed: "rejected" };

async function main() {
  const sample = JSON.parse(readFileSync(SAMPLE_FILE, "utf8")) as SampleItem[];
  const anthropic = new Anthropic();
  const clients = VARIANTS.map((v) => variantClient(anthropic, v));
  const systemPrompt = buildSystemPrompt(currentMonthLabel(new Date()));

  const hits = VARIANTS.map(() => ({ approved: 0, rejected: 0, vetoed: 0 }));
  const totals = VARIANTS.map(() => ({ costUsd: 0, outputTokens: 0, errors: 0 }));
  const groupSizes = { approved: 0, rejected: 0, vetoed: 0 };
  const rows: string[] = [];
  let skipped = 0;

  for (const item of sample) {
    const raw = await fetchAsRawResult(item);
    if (!raw) {
      skipped++;
      console.log(`[skip] ${item.title}`);
      continue;
    }
    groupSizes[item.expected]++;
    const block = buildBlock(item.title, [raw]);
    const results = await Promise.all(VARIANTS.map((v, i) => runVariant(clients[i], v, systemPrompt, block)));

    results.forEach((r, i) => {
      totals[i].costUsd += r.costUsd;
      totals[i].outputTokens += r.outputTokens;
      if (r.verdict === "error") totals[i].errors++;
      if (r.verdict === TARGET[item.expected]) hits[i][item.expected]++;
    });

    const cells = results.map((r) => (r.verdict === TARGET[item.expected] ? `✓ ${r.verdict}` : `✗ ${r.verdict}`));
    console.log(`${item.expected.padEnd(8)} ${cells.join(" | ")}  ${item.title}`);
    rows.push(`| ${item.expected} | ${item.title.replace(/\|/g, "/")} | ${cells.join(" | ")} |`);
    const disagreements = results.filter((r) => r.verdict !== results[0].verdict);
    if (disagreements.length > 0) {
      for (const [i, r] of results.entries()) {
        rows.push(`|  | ↳ ${VARIANTS[i].label}: ${(r.candidate?.curationReasoning ?? "-").replace(/\|/g, "/")} |${" |".repeat(VARIANTS.length)}`);
      }
    }
  }

  const header = `| grupo | evento | ${VARIANTS.map((v) => v.label).join(" | ")} |`;
  const sep = `|---|---|${VARIANTS.map(() => "---").join("|")}|`;
  const summary = VARIANTS.map((v, i) => {
    const h = hits[i];
    return `| ${v.label} | ${h.approved}/${groupSizes.approved} | ${h.rejected}/${groupSizes.rejected} | ${h.vetoed}/${groupSizes.vetoed} | ${totals[i].errors} | $${totals[i].costUsd.toFixed(4)} | ${totals[i].outputTokens} |`;
  });

  const report = [
    "# Haiku 4.5 vs Haiku 5.5 — curación (mismo input re-scrapeado)",
    "",
    `Muestra: ${sample.length - skipped} ítems (${skipped} omitidos por fetch). ✓ = el veredicto que la línea editorial espera (aprobado / rechazado; los vetados por MiniMax deberían quedar fuera).`,
    "",
    "| variante | aprobados ok | rechazados ok | vetados ok | errores | costo | tokens salida |",
    "|---|---|---|---|---|---|---|",
    ...summary,
    "",
    header,
    sep,
    ...rows,
    "",
  ].join("\n");
  writeFileSync(REPORT_FILE, report);
  console.log(`\n${summary.join("\n")}\n\nReporte: ${REPORT_FILE}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
