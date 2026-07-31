import { test } from "node:test";
import assert from "node:assert/strict";
import { generateRegionIntro, type MessagesClient } from "./intro.js";
import type { DigestSection } from "../lib/notify.js";

const hasLocalSupabase = Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);

const fixtureSections: DigestSection[] = [
  {
    label: "Inauguraciones de esta semana",
    events: [
      {
        id: "e1",
        title: "Estrella distante",
        placeName: "MAC Quinta Normal",
        comunaName: "Quinta Normal",
        openingDatetime: "2026-08-05T20:00:00.000Z",
        openingTimeConfirmed: true,
        runEndDate: "2026-09-01",
        imageUrl: null,
      },
    ],
  },
  {
    label: "En otras regiones",
    events: [
      {
        id: "e2",
        title: "Evento de otra región — nunca debería llegar al prompt",
        placeName: "Sala X",
        comunaName: null,
        openingDatetime: null,
        openingTimeConfirmed: true,
        runEndDate: null,
        imageUrl: null,
      },
    ],
  },
];

function stubClient(text: string): MessagesClient {
  return {
    messages: {
      create: async () => ({
        content: [{ type: "text", text }],
        usage: { input_tokens: 100, output_tokens: 20, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 },
      }),
    },
  };
}

test("generateRegionIntro: returns null immediately when there are no events to summarize (nothing running this region this week)", async () => {
  const intro = await generateRegionIntro([], {});
  assert.equal(intro, null);
});

test(
  "generateRegionIntro: returns the model's text and records usage under the newsletter_intro purpose",
  { skip: !hasLocalSupabase },
  async () => {
    const { getSupabaseClient } = await import("../lib/supabase-client.js");
    const client = getSupabaseClient();
    const { getCurrentMonthSpend } = await import("../lib/usage-tracking.js");

    const spendBefore = await getCurrentMonthSpend();
    const intro = await generateRegionIntro(fixtureSections, { messagesClient: stubClient("Esta semana hay una inauguración imperdible.") });
    assert.equal(intro, "Esta semana hay una inauguración imperdible.");

    const spendAfter = await getCurrentMonthSpend();
    assert.ok(spendAfter > spendBefore, "expected recordUsage to add a newsletter_intro row with nonzero cost");

    const { data } = await client.from("api_usage_log").select("purpose").order("created_at", { ascending: false }).limit(1);
    assert.equal(data?.[0]?.purpose, "newsletter_intro");
  },
);

// Both remaining tests need real events to summarize, which means
// generateRegionIntro reaches its budget check (getCurrentMonthSpend/
// getConfigNumber) before ever touching the stub client — that needs
// local Supabase, same as the usage-recording test above.
test(
  "generateRegionIntro: excludes the 'En otras regiones' section from what's sent to the model — only this subscriber's own región's news gets summarized",
  { skip: !hasLocalSupabase },
  async () => {
    let capturedPrompt = "";
    const client: MessagesClient = {
      messages: {
        create: async (params) => {
          capturedPrompt = String((params.messages as Array<{ content: string }>)[0].content);
          return {
            content: [{ type: "text", text: "ok" }],
            usage: { input_tokens: 1, output_tokens: 1, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 },
          };
        },
      },
    };
    await generateRegionIntro(fixtureSections, { messagesClient: client });
    assert.match(capturedPrompt, /Estrella distante/);
    assert.doesNotMatch(capturedPrompt, /Evento de otra región/);
  },
);

test(
  "generateRegionIntro: degrades to null (not a thrown error) when the model call fails",
  { skip: !hasLocalSupabase },
  async () => {
    const client: MessagesClient = {
      messages: {
        create: async () => {
          throw new Error("simulated API failure");
        },
      },
    };
    const intro = await generateRegionIntro(fixtureSections, { messagesClient: client });
    assert.equal(intro, null);
  },
);
