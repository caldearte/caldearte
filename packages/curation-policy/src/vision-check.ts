import { VISION_AXIS5_POLICY } from "./policy";
import { isSafeExternalUrl } from "./url-safety";

export interface ImageFetcher {
  fetch(url: string): Promise<{ base64: string; mediaType: string }>;
}

export const defaultImageFetcher: ImageFetcher = {
  async fetch(url: string) {
    // SSRF guard, 2026-08-17 — url is a candidate's chosen imageUrl,
    // itself derived from arbitrary scraped HTML (see url-safety.ts's doc
    // comment).
    if (!isSafeExternalUrl(url)) {
      throw new Error(`defaultImageFetcher: refusing to fetch unsafe URL: ${url}`);
    }
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`defaultImageFetcher: ${url} responded ${response.status}`);
    }
    // Some servers append parameters to Content-Type on binary responses
    // (e.g. "image/jpeg;charset=UTF-8", seen on artes.uchile.cl) — the
    // Anthropic API rejects anything but the bare mime type, so strip
    // everything after the first ";" before using it.
    const mediaType = (response.headers.get("content-type") ?? "image/jpeg").split(";")[0].trim();
    const buffer = Buffer.from(await response.arrayBuffer());
    return { base64: buffer.toString("base64"), mediaType };
  },
};

interface VisionResponseContentBlock {
  type: string;
  text?: string;
}

// Minimal shape the vision call needs — event-discovery/discover.ts's
// richer MessagesClient interface already satisfies this structurally, no
// adapter needed.
export interface VisionMessagesClient {
  messages: {
    create(params: Record<string, unknown>): Promise<{
      content: VisionResponseContentBlock[];
      usage: {
        input_tokens: number;
        output_tokens: number;
        cache_creation_input_tokens?: number | null;
        cache_read_input_tokens?: number | null;
      };
    }>;
  };
}

export interface VisionUsage {
  inputTokens: number;
  outputTokens: number;
  cacheCreationInputTokens?: number;
  cacheReadInputTokens?: number;
}

// Haiku 5.5 at low effort (2026-11-20), the same model and effort as the
// text curation since PR #712. It thinks by default and thinking counts
// toward max_tokens: the old 16-token ceiling would end every call inside
// the thinking block with no text at all, hence the headroom.
const MODEL = "claude-haiku-5-5";
const MAX_TOKENS = 2000;

export class VisionCheckUnparseableError extends Error {}

function extractText(content: VisionResponseContentBlock[]): string {
  let text = "";
  for (const block of content) {
    if (block.type === "text" && block.text) {
      text += block.text;
    }
  }
  return text;
}

// Axis 5 (explicit aggression) only — a separate call from the text-based
// axes 1-4, since it needs the actual image. Called only when a candidate
// would otherwise be included and has a real chosen image, so vision cost
// is paid only when it matters.
export async function runVisionCheck(
  client: VisionMessagesClient,
  imageFetcher: ImageFetcher,
  imageUrl: string,
): Promise<{ status: "approved" | "rejected"; usage: VisionUsage }> {
  const { base64, mediaType } = await imageFetcher.fetch(imageUrl);

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: MAX_TOKENS,
    output_config: { effort: "low" },
    messages: [
      {
        role: "user",
        content: [
          { type: "image", source: { type: "base64", media_type: mediaType, data: base64 } },
          { type: "text", text: VISION_AXIS5_POLICY },
        ],
      },
    ],
  });

  // An answer that says neither word (empty because thinking used up
  // max_tokens, or anything else) is an error, never an approval: this
  // used to read as APPROVE, so a check that never ran passed the image.
  const text = extractText(response.content).trim().toUpperCase();
  let status: "approved" | "rejected";
  if (text.includes("REJECT")) status = "rejected";
  else if (text.includes("APPROVE")) status = "approved";
  else throw new VisionCheckUnparseableError(`vision check: no APPROVE/REJECT in answer ${JSON.stringify(text.slice(0, 80))}`);

  const usage: VisionUsage = {
    inputTokens: response.usage.input_tokens,
    outputTokens: response.usage.output_tokens,
    cacheCreationInputTokens: response.usage.cache_creation_input_tokens ?? undefined,
    cacheReadInputTokens: response.usage.cache_read_input_tokens ?? undefined,
  };

  return { status, usage };
}
