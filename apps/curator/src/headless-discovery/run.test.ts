import { test } from "node:test";
import assert from "node:assert/strict";
import type { HeadlessRunSummary } from "../lib/notify.js";
import type { MaviActivity } from "../lib/mavi-headless.js";
import type { MessagesClient } from "../event-discovery/discover.js";

// Integration test against local Supabase — same convention as
// event-discovery/run.test.ts. Run `supabase start`, then export
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY before running this suite.
// Anthropic and Resend are always stubbed via HeadlessRunDeps — no real
// API calls, no ANTHROPIC_API_KEY/RESEND_API_KEY needed.
const hasLocalSupabase = Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);

const MAVI_SOURCE_URL = "https://mavi.uc.cl/exposiciones-actuales/";
const NOW = new Date(2026, 6, 20);

function stubMessagesClient(candidatesJson: unknown[]): MessagesClient {
  return {
    messages: {
      create: async () => ({
        content: [{ type: "text", text: "```json\n" + JSON.stringify(candidatesJson) + "\n```" }],
        usage: { input_tokens: 100, output_tokens: 50 },
      }),
    },
  };
}

// Both scenarios below share the exact same bright_source_fetch_state row
// (MAVI_SOURCE_URL) — run as sequential t.test() sub-tests inside one
// outer test, not two independent top-level tests, since Node's test
// runner runs sibling top-level tests concurrently by default and two
// tests racing to set up/tear down the same DB row is exactly the kind of
// cross-test interference event-discovery/run.test.ts's own region-
// exclusion dance exists to avoid.
test(
  "headless-discovery run integration (requires local Supabase)",
  { skip: !hasLocalSupabase && "SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY not set" },
  async (t) => {
    const { getSupabaseClient } = await import("../lib/supabase-client.js");
    const { run } = await import("./run.js");
    const client = getSupabaseClient();

    // No "not due yet" case anymore, 2026-08-24 — this pipeline has no
    // cadence gate, it always fetches when its own weekly cron fires
    // (see run.ts's own doc comment).
    await t.test("fetches, curates, inserts a real event, and records the fetch state", async () => {
      await client.from("bright_source_fetch_state").delete().eq("url", MAVI_SOURCE_URL);

      const activity: MaviActivity = {
        title: "__test_mavi_headless_expo__",
        content: "Desde el 1 de agosto de 2026 hasta el 30 de septiembre de 2026, sala principal, Santiago.",
        detailUrl: "https://www.uc.cl/agenda/actividad/__test_mavi_headless_expo__",
        imageUrl: "https://agendauc-prod.s3.amazonaws.com/test-image.jpg",
        placeName: "Museo de Artes Visuales MAVI UC",
      };
      // Row shape for curateBrightSourceItems (2026-07-24, index-keyed,
      // curatorial fields only) — title/sourceUrl/imageUrl/location/
      // placeName are never sent by Haiku for MAVI at all (MAVI_FIXED_LOCATION
      // in run.ts), they come from the activity itself deterministically.
      const candidateJson = {
        index: 0,
        status: "approved",
        artist: null,
        runStartDate: "2026-08-01",
        runEndDate: "2026-09-30",
        openingDatetime: null,
        openingTimeConfirmed: false,
        location: null,
        placeName: null,
        mediumType: "tradicional",
        sensitivityTags: [],
        curationReasoning: "test",
      };

      let sentSummary: HeadlessRunSummary | undefined;

      try {
        await client.from("events").delete().eq("title", activity.title);

        await run({
          now: NOW,
          fetchMaviActivitiesFn: async () => [activity],
          messagesClient: stubMessagesClient([candidateJson]),
          pageFetchFn: (async () => new Response("", { status: 404 })) as typeof fetch,
          sendHeadlessRunSummaryEmailFn: async (summary) => {
            sentSummary = summary;
          },
        });

        assert.deepEqual(sentSummary?.sourcesFetched, [MAVI_SOURCE_URL]);
        assert.equal(sentSummary?.candidates.total, 1);
        assert.equal(sentSummary?.candidates.insertedCount, 1);
        assert.equal(sentSummary?.eventGroups.length, 1);
        assert.equal(sentSummary?.eventGroups[0]?.label, MAVI_SOURCE_URL);
        assert.equal(sentSummary?.eventGroups[0]?.candidates[0]?.title, activity.title);
        assert.equal(sentSummary?.eventGroups[0]?.candidates[0]?.status, "approved");

        const { data: inserted } = await client
          .from("events")
          .select("title, source_url, opening_datetime, pipeline")
          .eq("title", activity.title);
        assert.equal(inserted?.length, 1);
        assert.equal(inserted?.[0].source_url, activity.detailUrl);
        assert.equal(inserted?.[0].opening_datetime, null, "MAVI/uc.cl sources never get an openingDatetime, even if Haiku somehow set one");
        assert.equal(inserted?.[0].pipeline, "headless", "a MAVI-headless-derived event is attributed to the headless pipeline");

        const { data: fetchState } = await client.from("bright_source_fetch_state").select("url").eq("url", MAVI_SOURCE_URL);
        assert.equal(fetchState?.length, 1, "fetch state recorded so the next run doesn't re-fetch for 7 days");
      } finally {
        await client.from("events").delete().eq("title", activity.title);
        await client.from("bright_source_fetch_state").delete().eq("url", MAVI_SOURCE_URL);
      }
    });

    // 2026-07-28: same pre-curation dedup as event-discovery/run.ts's
    // bright-source loop (docs/region-discovery.md) — an activity whose
    // detailUrl already has an approved event must never reach Haiku.
    await t.test("an activity whose detailUrl already has an approved event is skipped BEFORE curation", async () => {
      await client.from("bright_source_fetch_state").delete().eq("url", MAVI_SOURCE_URL);
      const activity: MaviActivity = {
        title: "__test_mavi_dedup__",
        content: "Desde el 1 de agosto de 2026 hasta el 30 de septiembre de 2026, sala principal, Santiago.",
        detailUrl: "https://www.uc.cl/agenda/actividad/__test_mavi_dedup__",
        imageUrl: null,
        placeName: "Museo de Artes Visuales MAVI UC",
      };

      await client.from("events").insert({
        title: "__test_mavi_dedup__ (ya aprobado)",
        freeform_location: "Santiago",
        run_start_date: "2026-08-01",
        run_end_date: "2026-09-30",
        medium_type: "tradicional",
        sensitivity_tags: [],
        source: "discovered",
        source_url: activity.detailUrl,
        curation_status: "approved",
        curation_reasoning: "seed",
      });

      let haikuCallCount = 0;
      const countingMessagesClient: MessagesClient = {
        messages: {
          create: async () => {
            haikuCallCount += 1;
            return { content: [{ type: "text", text: "```json\n[]\n```" }], usage: { input_tokens: 0, output_tokens: 0 } };
          },
        },
      };

      try {
        await run({
          now: NOW,
          fetchMaviActivitiesFn: async () => [activity],
          messagesClient: countingMessagesClient,
          pageFetchFn: (async () => new Response("", { status: 404 })) as typeof fetch,
        });

        assert.equal(haikuCallCount, 0, "the activity was excluded before ever building a Haiku call");
      } finally {
        await client.from("events").delete().eq("source_url", activity.detailUrl);
        await client.from("bright_source_fetch_state").delete().eq("url", MAVI_SOURCE_URL);
      }
    });
  },
);
