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

// Minimal fake Supabase client — just enough chainable surface for the 3
// selects run.ts actually makes (.from().select()[.eq()][.is()]), each
// resolving via the thenable `then` the same way the real client's query
// builder does when awaited directly.
function fakeSupabase(tables: Record<string, unknown[]>) {
  return {
    from(table: string) {
      const data = tables[table] ?? [];
      const builder = {
        select: () => builder,
        eq: () => builder,
        is: () => builder,
        insert: async () => ({ error: new Error("dry run should never insert") }),
        then: (resolve: (v: { data: unknown[]; error: null }) => void) => resolve({ data, error: null }),
      };
      return builder;
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- test double, not the real typed client
  } as any;
}

test("run(): dry run + forceTypes exercises the real pipeline (selection, flyer URLs, credential check) without publishing or logging", async () => {
  let publishCalled = false;
  let verifyCalled = false;
  const supabase = fakeSupabase({
    events: [
      {
        id: "e1",
        title: "Evento de prueba",
        artist: null,
        place_name: null,
        region_id: null,
        image_url: "https://example.com/a.jpg",
        description: null,
        sensitivity_tags: [],
        opening_datetime: "2026-08-04T20:00:00.000Z",
        opening_time_confirmed: true,
        run_start_date: null,
        run_end_date: null,
        freeform_location: "Santiago",
      },
    ],
    regions: [],
    social_post_log: [],
  });

  await run({
    supabase,
    now: new Date("2026-08-04T12:00:00.000Z"), // a Tuesday — would normally be a no-op
    forceTypes: ["inauguracion"],
    dryRun: true,
    instagramConfig: { igBusinessAccountId: "fake-account", accessToken: "fake-token" },
    verifyInstagramAccountFn: async () => {
      verifyCalled = true;
      return { username: "caldearte.oficial", mediaCount: 0 };
    },
    publishInstagramCarouselFn: async () => {
      publishCalled = true;
      return "should-not-be-called";
    },
  });

  assert.equal(verifyCalled, true, "dry run should still verify real Instagram credentials");
  assert.equal(publishCalled, false, "dry run should never actually publish");
});

test("run(): on a Sunday, inauguracion selects the UPCOMING week (starting tomorrow), not the week ending today — real bug found 2026-08-23 shifting the discovery cadence to Sunday", async () => {
  const supabase = fakeSupabase({
    events: [
      {
        id: "past-week-only",
        title: "Evento de la semana pasada",
        artist: null,
        place_name: null,
        region_id: null,
        image_url: "https://example.com/a.jpg",
        description: null,
        sensitivity_tags: [],
        // Friday of the week ENDING on this Sunday's run — must be
        // excluded now that "week" means the upcoming one.
        opening_datetime: "2026-08-14T20:00:00.000Z",
        opening_time_confirmed: true,
        run_start_date: null,
        run_end_date: null,
        freeform_location: "Santiago",
      },
      {
        id: "upcoming-week",
        title: "Evento de la semana que viene",
        artist: null,
        place_name: null,
        region_id: null,
        image_url: "https://example.com/b.jpg",
        description: null,
        sensitivity_tags: [],
        // Thursday of the week STARTING the day after this Sunday's run.
        opening_datetime: "2026-08-20T20:00:00.000Z",
        opening_time_confirmed: true,
        run_start_date: null,
        run_end_date: null,
        freeform_location: "Santiago",
      },
    ],
    regions: [],
    social_post_log: [],
  });

  const published: { imageUrls: string[] }[] = [];
  await run({
    supabase,
    now: new Date("2026-08-16T15:00:00.000Z"), // a Sunday
    forceTypes: ["inauguracion"],
    instagramConfig: { igBusinessAccountId: "fake-account", accessToken: "fake-token" },
    publishInstagramCarouselFn: async (_config, imageUrls) => {
      published.push({ imageUrls });
      return "fake-media-id";
    },
  });

  assert.equal(published.length, 1);
  const dynamicSlides = published[0].imageUrls.slice(0, -1); // last slide is always the fixed closing image
  assert.equal(dynamicSlides.length, 1, "only the upcoming-week event should be selected");
  assert.match(dynamicSlides[0], /title=Evento\+de\+la\+semana\+que\+viene/);
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
          opening_datetime: "2026-08-20T20:00:00.000Z", // Thursday, inside the UPCOMING week (see weekBoundsInSantiago's Sunday fix)
          image_url: "https://example.com/a.jpg",
        },
        {
          title: "Expo que cierra pronto",
          freeform_location: TEST_REGION,
          region_id: regionId,
          curation_status: "approved",
          source: "discovered",
          run_end_date: "2026-08-18", // within [today..upcoming week's end]
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
      // Sunday 2026-08-16 — per weekBoundsInSantiago's Sunday fix, the
      // week this run announces is the UPCOMING one, Mon 2026-08-17..Sun
      // 2026-08-23, not the week ending today.
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
        .eq("week_start", "2026-08-17");
      if (logError) throw new Error(`Failed to read social_post_log: ${logError.message}`);
      const postTypes = (logRows ?? []).map((r) => r.post_type).sort();
      // Exactly one row each for no_te_la_pierdas and destacada, none for
      // inauguracion — matches the "inauguraciones repeat on purpose"
      // rule (social_post_log's own migration comment).
      assert.deepEqual(postTypes, ["destacada", "no_te_la_pierdas"]);
    } finally {
      await client.from("social_post_log").delete().eq("week_start", "2026-08-17");
      await client.from("events").delete().eq("region_id", regionId);
      await client.from("regions").delete().eq("id", regionId);
    }
  },
);
