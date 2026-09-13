// Shadow-mode model comparison (2026-09-04, Daniel's request): runs a
// second OpenRouter model alongside the real Anthropic curation call
// on the exact same input, purely to measure how often it would agree with
// Haiku — the real call's result is the only one ever inserted into
// `events`. Silently disabled (no-op) unless OPENROUTER_API_KEY is set, so
// this ships dark until Daniel adds the GitHub Actions secret himself.
// Persisted to `shadow_curation_comparisons` (see its own migration's doc
// comment) so /admin can show aggregate metrics, plus a plain console.log
// ([event-discovery][shadow-mode] tag, same bracketed-module convention as
// the rest of this codebase) for immediate visibility in the GitHub
// Actions run log. Pilot-phase table — if the experiment concludes the
// shadow model isn't worth adopting, both this file and the table can
// simply be dropped.
//
// Model note (2026-09-10): started on the free `minimax/minimax-m3:free`
// slug; OpenRouter retired that free tier on ~2026-09-09 ("This model is
// unavailable for free... use minimax/minimax-m3 instead"), which silently
// turned every subsequent shadow call into a logged "disagree" (the
// error path hardcodes agree:false) — not a real drop in model
// agreement. Daniel approved moving to the paid slug (~$0.30/$1.20 per
// MTok in/out, cheaper than Haiku's own $1/$5) given the pilot's very low
// call volume (once per bright_source run, not per event).
import type { CurateResult, EventCandidate, MessagesClient } from "../event-discovery/discover.js";
import { getSupabaseClient } from "./supabase-client.js";

const DEFAULT_SHADOW_MODEL = "minimax/minimax-m3";

// Reasoning budget for the shadow model, in tokens (SHADOW_REASONING_BUDGET_TOKENS
// overrides; 0 disables reasoning outright). MiniMax M3 is a reasoning
// model, and on the 2026-09-13 Instagram run (22 chunks of 20 posts) it
// exhausted the real call's `max_tokens: 16000` on 8 of them — 5 came
// back with no text at all, 3 with the JSON cut off mid-string — and
// OpenRouter's bill ($0.45 at $1.20/MTok output) works out to ~14k
// output tokens per chunk, thinking included. Haiku's own JSON for a
// 20-post chunk is ~5-6k tokens, so a few thousand tokens of thinking is
// plenty; uncapped it ate the whole ceiling. Sent as Anthropic-shaped
// `thinking` (this is the /messages endpoint), which OpenRouter maps onto
// its unified `reasoning` parameter for non-Anthropic models. Anthropic's
// own floor for an enabled budget is 1024, kept here so the same request
// stays valid if SHADOW_MODEL_ID is ever pointed at a Claude model.
const DEFAULT_SHADOW_REASONING_BUDGET_TOKENS = 4000;

export function shadowReasoningBudgetTokens(env: NodeJS.ProcessEnv = process.env): number {
  const raw = env.SHADOW_REASONING_BUDGET_TOKENS;
  const parsed = raw === undefined ? NaN : Number(raw);
  if (!Number.isFinite(parsed) || parsed < 0) return DEFAULT_SHADOW_REASONING_BUDGET_TOKENS;
  return parsed === 0 ? 0 : Math.max(1024, Math.floor(parsed));
}

// The shadow request is the real request plus the model swap and the
// reasoning cap. `max_tokens` is raised by the budget so the JSON itself
// keeps the full ceiling the real call was designed around — otherwise
// even a capped thinking phase would still be carved out of the text's
// own budget.
export function shadowRequestParams(params: Record<string, unknown>, model: string, reasoningBudgetTokens: number): Record<string, unknown> {
  const baseMaxTokens = typeof params.max_tokens === "number" ? params.max_tokens : 0;
  return {
    ...params,
    model,
    max_tokens: baseMaxTokens + reasoningBudgetTokens,
    thinking: reasoningBudgetTokens === 0 ? { type: "disabled" } : { type: "enabled", budget_tokens: reasoningBudgetTokens },
  };
}

export type ShadowPipeline = "bright_source" | "instagram";

export interface ShadowClient {
  client: MessagesClient;
  model: string;
}

// OpenRouter's /api/v1/messages endpoint accepts the Anthropic Messages
// request shape almost as-is and returns the same {content, usage}
// envelope curate()/curateBrightSourceItems() already expect — same glue
// as scripts/compare-haiku-qwen.ts, factored out here so production and
// that comparison script share one implementation instead of drifting.
function openRouterMessagesClient(apiKey: string, model: string, reasoningBudgetTokens: number): MessagesClient {
  return {
    messages: {
      create: async (params) => {
        const res = await fetch("https://openrouter.ai/api/v1/messages", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify(shadowRequestParams(params, model, reasoningBudgetTokens)),
        });
        if (!res.ok) {
          throw new Error(`OpenRouter request failed: ${res.status} ${await res.text()}`);
        }
        return res.json() as ReturnType<MessagesClient["messages"]["create"]>;
      },
    },
  };
}

export function createShadowClient(): ShadowClient | null {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) return null;
  const model = process.env.SHADOW_MODEL_ID ?? DEFAULT_SHADOW_MODEL;
  return { client: openRouterMessagesClient(apiKey, model, shadowReasoningBudgetTokens()), model };
}

function statusOf(candidates: EventCandidate[]): "approved" | "rejected" | "empty" {
  if (candidates.length === 0) return "empty";
  return candidates.some((c) => c.status === "approved") ? "approved" : "rejected";
}

// One line per candidate ("title: reasoning") so a batch of several items
// under one source URL stays legible instead of collapsing into a single
// run-on paragraph.
function reasoningOf(candidates: EventCandidate[]): string {
  return candidates.map((c) => `${c.title}: ${c.curationReasoning}`).join("\n");
}

// Best-effort insert — a logging failure must never take down the real
// curation pipeline that already succeeded. Errors are swallowed after a
// console.error, same defensive posture as recordUsage's own callers.
async function persistComparison(row: {
  pipeline: ShadowPipeline;
  label: string;
  model: string;
  realStatus: "approved" | "rejected" | "empty";
  shadowStatus: "approved" | "rejected" | "empty" | "error";
  agree: boolean;
  realTags: string[];
  shadowTags: string[];
  realReasoning: string;
  shadowReasoning: string;
  error: string | null;
}): Promise<void> {
  try {
    const { error } = await getSupabaseClient().from("shadow_curation_comparisons").insert({
      pipeline: row.pipeline,
      label: row.label,
      model: row.model,
      real_status: row.realStatus,
      shadow_status: row.shadowStatus,
      agree: row.agree,
      real_tags: row.realTags,
      shadow_tags: row.shadowTags,
      real_reasoning: row.realReasoning,
      shadow_reasoning: row.shadowReasoning,
      error: row.error,
    });
    if (error) console.error(`[event-discovery][shadow-mode] failed to persist comparison: ${error.message}`);
  } catch (err) {
    console.error(`[event-discovery][shadow-mode] failed to persist comparison: ${(err as Error).message}`);
  }
}

// Kicks the shadow call off NOW, before the real call is awaited, so the
// two run concurrently instead of back to back — on the 2026-09-13
// Instagram run the shadow pass alone added 37 minutes after Haiku's 17,
// for a result that never affects production output. Returns a thunk
// with runShadowCuration's `shadowFn` shape, so the call site stays the
// same: start it, await the real call, then hand the thunk over. The
// no-op catch matters: without it a shadow failure that lands while the
// real call is still in flight is an unhandled rejection, which Node
// turns into a process crash — the real pipeline would die because of
// the experiment. The original promise still rejects for whoever awaits
// it (runShadowCuration), which records the failure as its own outcome.
export function startShadowCuration(
  shadow: ShadowClient,
  shadowFn: (client: MessagesClient) => Promise<CurateResult>,
): () => Promise<CurateResult> {
  const pending = shadowFn(shadow.client);
  pending.catch(() => {});
  return () => pending;
}

// Runs `shadowFn` (a curate()/curateBrightSourceItems() call against the
// shadow client, built by the caller so this module doesn't need to know
// which of the two shapes applies), logs a comparison against the real
// result already produced, and persists it for /admin. Never throws — a
// shadow-call failure (rate limit, malformed JSON, network error) is
// exactly the kind of thing this pilot needs to measure, so it's recorded
// as its own outcome rather than crashing the real pipeline that already
// succeeded.
export async function runShadowCuration(
  pipeline: ShadowPipeline,
  label: string,
  shadow: ShadowClient,
  realCandidates: EventCandidate[],
  shadowFn: (client: MessagesClient) => Promise<CurateResult>,
): Promise<void> {
  const realStatus = statusOf(realCandidates);
  const realTags = realCandidates.flatMap((c) => c.sensitivityTags);
  const realReasoning = reasoningOf(realCandidates);
  try {
    const { candidates: shadowCandidates } = await shadowFn(shadow.client);
    const shadowStatus = statusOf(shadowCandidates);
    const shadowTags = shadowCandidates.flatMap((c) => c.sensitivityTags);
    const shadowReasoning = reasoningOf(shadowCandidates);
    const agree = realStatus === shadowStatus;
    console.log(
      `[event-discovery][shadow-mode] pipeline=${pipeline} label=${JSON.stringify(label)} model=${shadow.model} ` +
        `real=${realStatus} shadow=${shadowStatus} agree=${agree} realTags=${JSON.stringify(realTags)} shadowTags=${JSON.stringify(shadowTags)}`,
    );
    await persistComparison({
      pipeline,
      label,
      model: shadow.model,
      realStatus,
      shadowStatus,
      agree,
      realTags,
      shadowTags,
      realReasoning,
      shadowReasoning,
      error: null,
    });
  } catch (err) {
    const message = (err as Error).message;
    console.log(
      `[event-discovery][shadow-mode] pipeline=${pipeline} label=${JSON.stringify(label)} model=${shadow.model} ` +
        `real=${realStatus} shadow=error error=${JSON.stringify(message)}`,
    );
    await persistComparison({
      pipeline,
      label,
      model: shadow.model,
      realStatus,
      shadowStatus: "error",
      agree: false,
      realTags,
      shadowTags: [],
      realReasoning,
      shadowReasoning: "",
      error: message,
    });
  }
}
