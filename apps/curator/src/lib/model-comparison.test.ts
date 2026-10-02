import { test } from "node:test";
import assert from "node:assert/strict";
import { shadowReasoningBudgetTokens, shadowRequestParams } from "./model-comparison.js";

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
