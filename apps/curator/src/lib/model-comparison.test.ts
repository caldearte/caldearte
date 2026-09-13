import { test } from "node:test";
import assert from "node:assert/strict";
import { shadowReasoningBudgetTokens, shadowRequestParams, startShadowCuration, type ShadowClient } from "./model-comparison.js";

// 2026-09-13: the shadow model (a reasoning model) exhausted the real
// call's max_tokens on 8 of 22 chunks, thinking included. The shadow
// request now carries an explicit thinking budget and a max_tokens
// raised by that same budget, so the JSON keeps its full ceiling.
test("shadowRequestParams swaps the model, caps thinking, and raises max_tokens by the budget", () => {
  const params = { model: "claude-haiku-4-5", max_tokens: 16000, messages: [] };
  const out = shadowRequestParams(params, "minimax/minimax-m3", 4000);
  assert.equal(out.model, "minimax/minimax-m3");
  assert.equal(out.max_tokens, 20000);
  assert.deepEqual(out.thinking, { type: "enabled", budget_tokens: 4000 });
  assert.deepEqual(out.messages, []);
});

test("shadowRequestParams disables thinking outright for a zero budget and leaves max_tokens alone", () => {
  const out = shadowRequestParams({ max_tokens: 16000 }, "minimax/minimax-m3", 0);
  assert.equal(out.max_tokens, 16000);
  assert.deepEqual(out.thinking, { type: "disabled" });
});

test("shadowReasoningBudgetTokens: default, explicit, zero, floor at Anthropic's 1024 minimum, garbage → default", () => {
  assert.equal(shadowReasoningBudgetTokens({}), 4000);
  assert.equal(shadowReasoningBudgetTokens({ SHADOW_REASONING_BUDGET_TOKENS: "6000" }), 6000);
  assert.equal(shadowReasoningBudgetTokens({ SHADOW_REASONING_BUDGET_TOKENS: "0" }), 0);
  assert.equal(shadowReasoningBudgetTokens({ SHADOW_REASONING_BUDGET_TOKENS: "500" }), 1024);
  assert.equal(shadowReasoningBudgetTokens({ SHADOW_REASONING_BUDGET_TOKENS: "abc" }), 4000);
  assert.equal(shadowReasoningBudgetTokens({ SHADOW_REASONING_BUDGET_TOKENS: "-1" }), 4000);
});

const fakeShadow: ShadowClient = { client: { messages: { create: async () => ({ content: [], usage: { input_tokens: 0, output_tokens: 0 } }) } }, model: "fake" };

test("startShadowCuration starts the call immediately and hands the same result to whoever awaits the thunk", async () => {
  let started = false;
  const run = startShadowCuration(fakeShadow, async () => {
    started = true;
    return { candidates: [], usage: { inputTokens: 1, outputTokens: 1 } };
  });
  assert.equal(started, true, "the shadow call must be in flight before the real call is awaited");
  const result = await run();
  assert.equal(result.usage.inputTokens, 1);
});

test("startShadowCuration: a shadow failure while nobody is awaiting it yet is not an unhandled rejection, and still surfaces to the eventual awaiter", async () => {
  const unhandled: unknown[] = [];
  const onUnhandled = (reason: unknown) => unhandled.push(reason);
  process.on("unhandledRejection", onUnhandled);
  try {
    const run = startShadowCuration(fakeShadow, async () => {
      throw new Error("OpenRouter request failed: 429");
    });
    // Let the rejection settle with no awaiter attached — this is the
    // window in which the real call is still running.
    await new Promise((resolve) => setTimeout(resolve, 10));
    assert.deepEqual(unhandled, []);
    await assert.rejects(run(), /429/);
  } finally {
    process.off("unhandledRejection", onUnhandled);
  }
});
