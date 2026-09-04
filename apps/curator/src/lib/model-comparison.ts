// Shadow-mode model comparison (2026-09-04, Daniel's request): runs a
// second, free OpenRouter model alongside the real Anthropic curation call
// on the exact same input, purely to log how often it would agree with
// Haiku — the real call's result is the only one ever inserted into
// Supabase. Silently disabled (no-op) unless OPENROUTER_API_KEY is set, so
// this ships dark until Daniel adds the GitHub Actions secret himself.
// Logged via plain console.log ([event-discovery][shadow-mode] tag, same
// bracketed-module convention as the rest of this codebase) rather than a
// new Supabase table — this is a temporary pilot-phase observability tool,
// not permanent infrastructure; promote to a real table only if the pilot
// concludes this is worth keeping.
import type { CurateResult, EventCandidate, MessagesClient } from "../event-discovery/discover.js";

const DEFAULT_SHADOW_MODEL = "minimax/minimax-m3:free";

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

// Runs `shadowFn` (a curate()/curateBrightSourceItems() call against the
// shadow client, built by the caller so this module doesn't need to know
// which of the two shapes applies) and logs a comparison against the real
// result already produced. Never throws — a shadow-call failure (rate
// limit, malformed JSON, network error) is exactly the kind of thing this
// pilot needs to measure, so it's logged as its own outcome rather than
// crashing the real pipeline that already succeeded.
export async function runShadowCuration(
  pipeline: string,
  label: string,
  shadow: ShadowClient,
  realCandidates: EventCandidate[],
  shadowFn: (client: MessagesClient) => Promise<CurateResult>,
): Promise<void> {
  const realStatus = statusOf(realCandidates);
  try {
    const { candidates: shadowCandidates } = await shadowFn(shadow.client);
    const shadowStatus = statusOf(shadowCandidates);
    console.log(
      `[event-discovery][shadow-mode] pipeline=${pipeline} label=${JSON.stringify(label)} model=${shadow.model} ` +
        `real=${realStatus} shadow=${shadowStatus} agree=${realStatus === shadowStatus} ` +
        `realTags=${JSON.stringify(realCandidates.flatMap((c) => c.sensitivityTags))} ` +
        `shadowTags=${JSON.stringify(shadowCandidates.flatMap((c) => c.sensitivityTags))}`,
    );
  } catch (err) {
    console.log(
      `[event-discovery][shadow-mode] pipeline=${pipeline} label=${JSON.stringify(label)} model=${shadow.model} ` +
        `real=${realStatus} shadow=error error=${JSON.stringify((err as Error).message)}`,
    );
  }
}
