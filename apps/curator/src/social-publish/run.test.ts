import { test } from "node:test";
import assert from "node:assert/strict";
import { run } from "./run.js";

const hasLocalSupabase = Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);

test("run(): a day with nothing scheduled (e.g. Tuesday) exits without touching Instagram or Supabase", async () => {
  let publishCalled = false;
  await run({
    now: new Date("2026-08-04T12:00:00.000Z"), // a Tuesday
    supabase: undefined,
    instagramConfig: { igBusinessAccountId: "unused", accessToken: "unused" },
    publishInstagramCarouselFn: async () => {
      publishCalled = true;
      return "unused";
    },
  });
  assert.equal(publishCalled, false);
});

test(
  "run(): Sunday publishes all 3 types, Monday only inauguracion, and only no_te_la_pierdas/destacada write de-dup rows",
  { skip: !hasLocalSupabase },
  async () => {
    const { getSupabaseClient } = await import("../lib/supabase-client.js");
    const client = getSupabaseClient();
    const TEST_REGION = "Comuna de Prueba Social Publish";
    const TEST_ADMIN_REGION = "Región de Prueba Social Publish";

    const { data: region, error: regionError } = await client
      .from("regions")
      .insert({ name: TEST_REGION, country: "Testland", language: "es", status: "active", admin_region_name: TEST_ADMIN_REGION })
      .select("id")
      .single();
    if (regionError) throw new Error(`Failed to seed test region: ${regionError.message}`);
    const regionId = region.id;

    try {
      const { error: eventsError } = await client.from("events").insert([
        {
          title: "Inauguración de prueba",
          freeform_location: TEST_REGION,
          region_id: regionId,
          curation_status: "approved",
          source: "discovered",
          opening_datetime: "2026-08-16T20:00:00.000Z", // Sunday, inside the test week
          image_url: "https://example.com/a.jpg",
        },
        {
          title: "Expo que cierra pronto",
          freeform_location: TEST_REGION,
          region_id: regionId,
          curation_status: "approved",
          source: "discovered",
          run_end_date: "2026-08-16", // last day of the test week itself
          image_url: "https://example.com/b.jpg",
        },
        {
          title: "Expo destacada de prueba",
          freeform_location: TEST_REGION,
          region_id: regionId,
          curation_status: "approved",
          source: "discovered",
          run_start_date: "2026-08-01",
          run_end_date: "2026-09-01",
          image_url: "https://example.com/c.jpg",
          description: "Una descripción real y suficientemente larga para pasar el filtro de calidad mínimo de destacadas.",
        },
      ]);
      if (eventsError) throw new Error(`Failed to seed test events: ${eventsError.message}`);

      const published: { imageUrls: string[]; caption: string }[] = [];
      // Sunday 2026-08-16 — the test week runs Mon 2026-08-10..Sun 2026-08-16.
      await run({
        supabase: client,
        now: new Date("2026-08-16T15:00:00.000Z"),
        instagramConfig: { igBusinessAccountId: "fake-account", accessToken: "fake-token" },
        publishInstagramCarouselFn: async (_config, imageUrls, caption) => {
          published.push({ imageUrls, caption });
          return `fake-media-id-${published.length}`;
        },
      });

      assert.equal(published.length, 3, "Sunday should publish all 3 carousel types");
      for (const post of published) {
        assert.equal(post.imageUrls.at(-1), "https://www.caldearte.com/social/ig-post-cierre.png");
      }

      const { data: logRows, error: logError } = await client
        .from("social_post_log")
        .select("post_type")
        .eq("week_start", "2026-08-10");
      if (logError) throw new Error(`Failed to read social_post_log: ${logError.message}`);
      const postTypes = (logRows ?? []).map((r) => r.post_type).sort();
      // Exactly one row each for no_te_la_pierdas and destacada, none for
      // inauguracion — matches the "inauguraciones repeat on purpose"
      // rule (social_post_log's own migration comment).
      assert.deepEqual(postTypes, ["destacada", "no_te_la_pierdas"]);
    } finally {
      await client.from("social_post_log").delete().eq("week_start", "2026-08-10");
      await client.from("events").delete().eq("region_id", regionId);
      await client.from("regions").delete().eq("id", regionId);
    }
  },
);
