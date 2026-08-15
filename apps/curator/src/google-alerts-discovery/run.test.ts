import { test } from "node:test";
import assert from "node:assert/strict";
import type { GoogleAlertsRunSummary } from "../lib/notify.js";
import type { GoogleAlertEntry } from "../lib/google-alerts.js";
import type { MessagesClient } from "../event-discovery/discover.js";

// Integration test against local Supabase — same convention as
// headless-discovery/run.test.ts. Run `supabase start`, then export
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY before running this suite.
// Anthropic and Resend are always stubbed via GoogleAlertsRunDeps — no
// real API calls, no ANTHROPIC_API_KEY/RESEND_API_KEY needed.
const hasLocalSupabase = Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);

const SOURCE_KEY = "google-alerts://inauguracion-de-arte";
const NOW = new Date(2026, 7, 14);

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

// Sequential t.test() sub-tests sharing one bright_source_fetch_state row
// — same reasoning as headless-discovery/run.test.ts's own comment (avoid
// Node's default concurrent top-level test execution racing on the same
// DB row).
test(
  "google-alerts-discovery run integration (requires local Supabase)",
  { skip: !hasLocalSupabase && "SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY not set" },
  async (t) => {
    const { getSupabaseClient } = await import("../lib/supabase-client.js");
    const { run } = await import("./run.js");
    const client = getSupabaseClient();

    await t.test("not due yet — skips the fetch entirely and still sends a summary", async () => {
      await client.from("bright_source_fetch_state").delete().eq("url", SOURCE_KEY);
      await client.from("bright_source_fetch_state").upsert({ url: SOURCE_KEY, last_fetched_at: NOW.toISOString() });

      let fetchCalled = false;
      let sentSummary: GoogleAlertsRunSummary | undefined;

      try {
        await run({
          now: NOW,
          fetchGoogleAlertEntriesFn: async () => {
            fetchCalled = true;
            return [];
          },
          sendGoogleAlertsRunSummaryEmailFn: async (summary) => {
            sentSummary = summary;
          },
        });

        assert.equal(fetchCalled, false, "not due — fetchGoogleAlertEntries must never be called");
        assert.equal(sentSummary?.dueThisRun, false);
      } finally {
        await client.from("bright_source_fetch_state").delete().eq("url", SOURCE_KEY);
      }
    });

    await t.test("due — fetches, fetches the real article page, curates, inserts, and records the fetch state", async () => {
      await client.from("bright_source_fetch_state").delete().eq("url", SOURCE_KEY);

      const entry: GoogleAlertEntry = {
        title: "__test_google_alerts_expo__",
        url: "https://example.cl/__test_google_alerts_expo__",
        snippet: "Un fragmento corto...",
        publishedDate: "2026-08-13",
      };

      const candidateJson = {
        index: 0,
        status: "approved",
        artist: "Artista de Prueba",
        runStartDate: "2026-08-01",
        runEndDate: "2026-09-30",
        openingDatetime: null,
        openingTimeConfirmed: false,
        location: "Santiago",
        placeName: "Galería de Prueba",
        mediumType: "tradicional",
        sensitivityTags: [],
        curationReasoning: "test",
      };

      let sentSummary: GoogleAlertsRunSummary | undefined;

      const realArticleHtml = "<html><body><img src=\"https://example.cl/foto.jpg\"><p>Texto real completo del artículo, con la fecha de la exposición.</p></body></html>";

      try {
        await client.from("events").delete().eq("title", entry.title);

        await run({
          now: NOW,
          fetchGoogleAlertEntriesFn: async () => [entry],
          messagesClient: stubMessagesClient([candidateJson]),
          pageFetchFn: (async (url: string) => {
            if (url === entry.url) return new Response(realArticleHtml, { status: 200 });
            return new Response("", { status: 404 });
          }) as typeof fetch,
          sendGoogleAlertsRunSummaryEmailFn: async (summary) => {
            sentSummary = summary;
          },
        });

        assert.equal(sentSummary?.dueThisRun, true);
        assert.equal(sentSummary?.candidates.total, 1);
        assert.equal(sentSummary?.candidates.insertedCount, 1);
        assert.equal(sentSummary?.eventGroups[0]?.label, "Google Alerts");

        const { data: inserted } = await client.from("events").select("title, source_url, artist, freeform_location, pipeline").eq("title", entry.title);
        assert.equal(inserted?.length, 1);
        assert.equal(inserted?.[0].source_url, entry.url);
        assert.equal(inserted?.[0].artist, "Artista de Prueba");
        assert.equal(inserted?.[0].pipeline, "google_alerts", "a Google Alerts-derived event is attributed to the google_alerts pipeline");

        const { data: fetchState } = await client.from("bright_source_fetch_state").select("url").eq("url", SOURCE_KEY);
        assert.equal(fetchState?.length, 1, "fetch state recorded so the next run doesn't re-fetch for 7 days");
      } finally {
        await client.from("events").delete().eq("title", entry.title);
        await client.from("bright_source_fetch_state").delete().eq("url", SOURCE_KEY);
      }
    });

    // Same pre-curation dedup as every other bright-source loop
    // (docs/region-discovery.md) — an entry whose real (unwrapped) URL
    // already has an approved event must never reach Haiku or even get
    // its article page fetched.
    await t.test("an entry whose URL already has an approved event is skipped BEFORE fetching its page or curating", async () => {
      await client.from("bright_source_fetch_state").delete().eq("url", SOURCE_KEY);
      const entry: GoogleAlertEntry = {
        title: "__test_google_alerts_dedup__",
        url: "https://example.cl/__test_google_alerts_dedup__",
        snippet: "...",
        publishedDate: "2026-08-13",
      };

      await client.from("events").insert({
        title: "__test_google_alerts_dedup__ (ya aprobado)",
        freeform_location: "Santiago",
        run_start_date: "2026-08-01",
        run_end_date: "2026-09-30",
        medium_type: "tradicional",
        sensitivity_tags: [],
        source: "discovered",
        source_url: entry.url,
        curation_status: "approved",
        curation_reasoning: "seed",
      });

      let haikuCallCount = 0;
      let pageFetchCallCount = 0;
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
          fetchGoogleAlertEntriesFn: async () => [entry],
          messagesClient: countingMessagesClient,
          pageFetchFn: (async () => {
            pageFetchCallCount += 1;
            return new Response("", { status: 404 });
          }) as typeof fetch,
        });

        assert.equal(haikuCallCount, 0, "the entry was excluded before ever building a Haiku call");
        assert.equal(pageFetchCallCount, 0, "the entry was excluded before ever fetching its article page");
      } finally {
        await client.from("events").delete().eq("source_url", entry.url);
        await client.from("bright_source_fetch_state").delete().eq("url", SOURCE_KEY);
      }
    });
  },
);
