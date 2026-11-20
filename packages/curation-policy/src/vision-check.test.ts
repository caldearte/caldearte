import { test } from "node:test";
import assert from "node:assert/strict";
import { runVisionCheck, type ImageFetcher, type VisionMessagesClient } from "./vision-check";

const fetcher: ImageFetcher = { fetch: async () => ({ base64: "AAAA", mediaType: "image/jpeg" }) };

function clientAnswering(content: { type: string; text?: string }[], seen: Record<string, unknown>[] = []): VisionMessagesClient {
  return {
    messages: {
      create: async (params) => {
        seen.push(params);
        return { content, usage: { input_tokens: 100, output_tokens: 10 } };
      },
    },
  };
}

test("APPROVE approves, REJECT rejects", async () => {
  assert.equal((await runVisionCheck(clientAnswering([{ type: "text", text: "APPROVE" }]), fetcher, "x")).status, "approved");
  assert.equal((await runVisionCheck(clientAnswering([{ type: "text", text: "REJECT" }]), fetcher, "x")).status, "rejected");
});

test("An answer with only a thinking block (max_tokens spent thinking) throws instead of approving", async () => {
  await assert.rejects(runVisionCheck(clientAnswering([{ type: "thinking" }]), fetcher, "x"));
});

test("An answer saying neither word throws", async () => {
  await assert.rejects(runVisionCheck(clientAnswering([{ type: "text", text: "No estoy seguro" }]), fetcher, "x"));
});

test("Calls Haiku 5.5 at low effort with room for thinking", async () => {
  const seen: Record<string, unknown>[] = [];
  await runVisionCheck(clientAnswering([{ type: "text", text: "APPROVE" }], seen), fetcher, "x");
  assert.equal(seen[0].model, "claude-haiku-5-5");
  assert.deepEqual(seen[0].output_config, { effort: "low" });
  assert.ok((seen[0].max_tokens as number) >= 1000);
});
