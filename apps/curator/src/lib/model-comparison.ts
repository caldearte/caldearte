// Shadow-mode model comparison (2026-09-04, Daniel's request): runs a
// second, free OpenRouter model alongside the real Anthropic curation call
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
import type { CurateResult, EventCandidate, MessagesClient } from "../event-discovery/discover.js";
import { getSupabaseClient } from "./supabase-client.js";

const DEFAULT_SHADOW_MODEL = "minimax/minimax-m3:free";

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

export function createShadowClient(): ShadowClient | null {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) return null;
  const model = process.env.SHADOW_MODEL_ID ?? DEFAULT_SHADOW_MODEL;
  return { client: openRouterMessagesClient(apiKey, model), model };
}

function statusOf(candidates: EventCandidate[]): "approved" | "rejected" | "empty" {
  if (candidates.length === 0) return "empty";
  return candidates.some((c) => c.status === "approved") ? "approved" : "rejected";
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
      error: row.error,
    });
    if (error) console.error(`[event-discovery][shadow-mode] failed to persist comparison: ${error.message}`);
  } catch (err) {
    console.error(`[event-discovery][shadow-mode] failed to persist comparison: ${(err as Error).message}`);
  }
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
  try {
    const { candidates: shadowCandidates } = await shadowFn(shadow.client);
    const shadowStatus = statusOf(shadowCandidates);
    const shadowTags = shadowCandidates.flatMap((c) => c.sensitivityTags);
    const agree = realStatus === shadowStatus;
    console.log(
      `[event-discovery][shadow-mode] pipeline=${pipeline} label=${JSON.stringify(label)} model=${shadow.model} ` +
        `real=${realStatus} shadow=${shadowStatus} agree=${agree} realTags=${JSON.stringify(realTags)} shadowTags=${JSON.stringify(shadowTags)}`,
    );
    await persistComparison({ pipeline, label, model: shadow.model, realStatus, shadowStatus, agree, realTags, shadowTags, error: null });
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
      error: message,
    });
  }
}
