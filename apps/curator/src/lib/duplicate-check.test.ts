import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildDuplicateCheckBlock,
  checkDuplicates,
  findLlmDuplicates,
  parseDuplicateCheckResponse,
  poolFor,
  type DuplicateCheckEvent,
  type LiveEvent,
} from "./duplicate-check.js";
import type { MessagesClient } from "../event-discovery/discover.js";

const EVENT: DuplicateCheckEvent = {
  title: "Canto libre",
  placeName: "Flach Galería",
  location: "Santiago",
  sourceAccount: "flachgaleria",
  runStartDate: "2026-11-13",
  runEndDate: "2026-12-12",
  openingDatetime: null,
  description: "Muestra colectiva",
};

function live(id: string, overrides: Partial<LiveEvent> = {}): LiveEvent {
  return { id, regionId: "r-santiago", ...EVENT, ...overrides };
}

function stubClient(answer: string | Error): MessagesClient & { calls: Array<Record<string, unknown>> } {
  const calls: Array<Record<string, unknown>> = [];
  return {
    calls,
    messages: {
      async create(params) {
        calls.push(params);
        if (answer instanceof Error) throw answer;
        return { content: [{ type: "text", text: answer }], usage: { input_tokens: 100, output_tokens: 10 } };
      },
    },
  };
}

test("parseDuplicateCheckResponse keeps the model's answer and marks only 'alta' as confident", () => {
  const parsed = parseDuplicateCheckResponse(
    `[{"candidate":"C1","reason":"mismo título","duplicate_of":"E2","confidence":"alta"},
      {"candidate":"C2","reason":"mismo lugar y fechas","duplicate_of":"E1","confidence":"media"},
      {"candidate":"C3","reason":"otra muestra","duplicate_of":null,"confidence":"alta"}]`,
    3,
    2,
  );
  assert.deepEqual(parsed.get(0), { existingIndex: 1, confident: true, reason: "mismo título" });
  assert.deepEqual(parsed.get(1), { existingIndex: 0, confident: false, reason: "mismo lugar y fechas" });
  assert.deepEqual(parsed.get(2), { existingIndex: null, confident: true, reason: "otra muestra" });
});

test("parseDuplicateCheckResponse drops references to rows that don't exist and survives garbage", () => {
  assert.equal(parseDuplicateCheckResponse(`[{"candidate":"C1","duplicate_of":"E9","confidence":"alta"}]`, 1, 2).size, 0);
  assert.equal(parseDuplicateCheckResponse(`[{"candidate":"C4","duplicate_of":"E1","confidence":"alta"}]`, 1, 2).size, 0);
  assert.equal(parseDuplicateCheckResponse("no es JSON", 1, 2).size, 0);
  assert.equal(parseDuplicateCheckResponse(`[{"candidate":"C1",`, 1, 2).size, 0);
});

test("buildDuplicateCheckBlock never splits an emoji when clipping a description", () => {
  const description = `${"a".repeat(399)}🤔 y más texto`;
  const block = buildDuplicateCheckBlock([{ ...EVENT, description }], []);
  assert.ok(block.includes(`${"a".repeat(399)}🤔…`));
  assert.doesNotThrow(() => JSON.stringify(block));
  assert.ok(!/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/.test(block), "no lone high surrogate");
});

test("checkDuplicates acts on a confident match only", async () => {
  const existing = [{ id: "e-1", ...EVENT }];
  const confident = await checkDuplicates(stubClient(`[{"candidate":"C1","reason":"x","duplicate_of":"E1","confidence":"alta"}]`), [
    { candidates: [{ ref: "c", event: EVENT }], existing },
  ]);
  assert.deepEqual(confident.matches.get("c"), { existingId: "e-1", reason: "x" });

  const guess = await checkDuplicates(stubClient(`[{"candidate":"C1","reason":"x","duplicate_of":"E1","confidence":"media"}]`), [
    { candidates: [{ ref: "c", event: EVENT }], existing },
  ]);
  assert.equal(guess.matches.size, 0);
  assert.equal(guess.decisions[0].existingId, "e-1");
});

test("checkDuplicates keeps every candidate when the call fails", async () => {
  const result = await checkDuplicates(stubClient(new Error("overloaded")), [
    { candidates: [{ ref: "c", event: EVENT }], existing: [{ id: "e-1", ...EVENT }] },
  ]);
  assert.equal(result.matches.size, 0);
});

test("poolFor takes the candidate's comuna or its account, nothing else", () => {
  const events = [
    live("same-comuna"),
    live("same-account-elsewhere", { regionId: "r-providencia" }),
    live("unrelated", { regionId: "r-valpo", sourceAccount: "otra" }),
  ];
  assert.deepEqual(
    poolFor(events, "r-santiago", "flachgaleria").map((e) => e.id),
    ["same-comuna", "same-account-elsewhere"],
  );
  assert.deepEqual(poolFor(events, null, null), []);
});

test("findLlmDuplicates asks only about the candidates shouldCheck lets through, with a non-empty pool", async () => {
  const client = stubClient(`[{"candidate":"C1","reason":"mismo título","duplicate_of":"E1","confidence":"alta"}]`);
  const candidates = ["new-here", "already-matched", "new-nowhere"];
  const { matches, checked } = await findLlmDuplicates(client, candidates, {
    shouldCheck: (c) => c !== "already-matched",
    toEvent: (c) => ({ ...EVENT, regionId: c === "new-nowhere" ? "r-empty" : "r-santiago", sourceAccount: c === "new-nowhere" ? null : EVENT.sourceAccount }),
    loadLive: async () => [live("e-1")],
  });
  assert.equal(checked, 1);
  assert.equal(client.calls.length, 1);
  assert.deepEqual(matches.get("new-here"), { existingId: "e-1", existingTitle: "Canto libre", reason: "mismo título" });
  assert.equal(matches.has("new-nowhere"), false);
});

test("findLlmDuplicates leaves everything as it was when the live events can't be loaded", async () => {
  const client = stubClient("[]");
  const { matches, checked } = await findLlmDuplicates(client, ["c"], {
    shouldCheck: () => true,
    toEvent: () => ({ ...EVENT, regionId: "r-santiago" }),
    loadLive: async () => {
      throw new Error("db down");
    },
  });
  assert.equal(matches.size, 0);
  assert.equal(checked, 0);
  assert.equal(client.calls.length, 0);
});
