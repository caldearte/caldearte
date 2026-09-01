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

test("run(): dry run + forceWindow exercises the real pipeline (selection, flyer URLs, credential check) without publishing or logging", async () => {
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
        event_type: "inauguracion",
      },
    ],
    regions: [],
    social_post_log: [],
  });

  await run({
    supabase,
    now: new Date("2026-08-04T12:00:00.000Z"), // a Tuesday — would normally be a no-op
    forceWindow: { start: "2026-08-04", end: "2026-08-04" },
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

test("run(): Monday's window covers Monday+Tuesday only — excludes Sunday (before) and Wednesday (after)", async () => {
  const supabase = fakeSupabase({
    events: [
      {
        id: "sunday-before",
        title: "Evento del domingo anterior",
        artist: null,
        place_name: null,
        region_id: null,
        image_url: "https://example.com/a.jpg",
        description: null,
        sensitivity_tags: [],
        opening_datetime: "2026-08-30T20:00:00.000Z", // Sunday
        opening_time_confirmed: true,
        run_start_date: null,
        run_end_date: null,
        freeform_location: "Santiago",
        event_type: "inauguracion",
      },
      {
        id: "monday-in-window",
        title: "Evento del lunes",
        artist: null,
        place_name: null,
        region_id: null,
        image_url: "https://example.com/b.jpg",
        description: null,
        sensitivity_tags: [],
        opening_datetime: "2026-08-31T20:00:00.000Z", // Monday
        opening_time_confirmed: true,
        run_start_date: null,
        run_end_date: null,
        freeform_location: "Santiago",
        event_type: "inauguracion",
      },
      {
        id: "tuesday-in-window",
        title: "Recorrido del martes",
        artist: null,
        place_name: null,
        region_id: null,
        image_url: "https://example.com/c.jpg",
        description: null,
        sensitivity_tags: [],
        opening_datetime: "2026-09-01T20:00:00.000Z", // Tuesday
        opening_time_confirmed: true,
        run_start_date: null,
        run_end_date: null,
        freeform_location: "Santiago",
        event_type: "visita_guiada",
      },
      {
        id: "wednesday-after",
        title: "Evento del miércoles siguiente",
        artist: null,
        place_name: null,
        region_id: null,
        image_url: "https://example.com/d.jpg",
        description: null,
        sensitivity_tags: [],
        opening_datetime: "2026-09-02T20:00:00.000Z", // Wednesday
        opening_time_confirmed: true,
        run_start_date: null,
        run_end_date: null,
        freeform_location: "Santiago",
        event_type: "inauguracion",
      },
    ],
    regions: [],
    social_post_log: [],
  });

  const published: { imageUrls: string[] }[] = [];
  await run({
    supabase,
    now: new Date("2026-08-31T12:00:00.000Z"), // a Monday
    instagramConfig: { igBusinessAccountId: "fake-account", accessToken: "fake-token" },
    publishInstagramCarouselFn: async (_config, imageUrls) => {
      published.push({ imageUrls });
      return "fake-media-id";
    },
  });

  assert.equal(published.length, 1);
  const dynamicSlides = published[0].imageUrls.slice(0, -1); // last slide is always the fixed closing image
  assert.equal(dynamicSlides.length, 2, "only Monday+Tuesday events should be selected");
  assert.match(dynamicSlides[0], /title=Evento\+del\+lunes/);
  // Each slide carries its OWN event's flyer type now — a mixed carousel,
  // not one type for the whole post.
  assert.match(dynamicSlides[0], /type=inauguracion/);
  assert.match(dynamicSlides[1], /title=Recorrido\+del\+martes/);
  assert.match(dynamicSlides[1], /type=visita_guiada/);
});

test("run(): Friday's window covers Friday through Sunday", async () => {
  const supabase = fakeSupabase({
    events: [
      {
        id: "thursday-before",
        title: "Evento del jueves anterior",
        artist: null,
        place_name: null,
        region_id: null,
        image_url: "https://example.com/a.jpg",
        description: null,
        sensitivity_tags: [],
        opening_datetime: "2026-09-03T20:00:00.000Z", // Thursday
        opening_time_confirmed: true,
        run_start_date: null,
        run_end_date: null,
        freeform_location: "Santiago",
        event_type: "inauguracion",
      },
      {
        id: "sunday-in-window",
        title: "Evento del domingo",
        artist: null,
        place_name: null,
        region_id: null,
        image_url: "https://example.com/b.jpg",
        description: null,
        sensitivity_tags: [],
        opening_datetime: "2026-09-06T20:00:00.000Z", // Sunday
        opening_time_confirmed: true,
        run_start_date: null,
        run_end_date: null,
        freeform_location: "Santiago",
        event_type: "inauguracion",
      },
    ],
    regions: [],
    social_post_log: [],
  });

  const published: { imageUrls: string[] }[] = [];
  await run({
    supabase,
    now: new Date("2026-09-04T12:00:00.000Z"), // a Friday
    instagramConfig: { igBusinessAccountId: "fake-account", accessToken: "fake-token" },
    publishInstagramCarouselFn: async (_config, imageUrls) => {
      published.push({ imageUrls });
      return "fake-media-id";
    },
  });

  assert.equal(published.length, 1);
  const dynamicSlides = published[0].imageUrls.slice(0, -1);
  assert.equal(dynamicSlides.length, 1, "only the Sunday event falls inside Friday's window (Fri-Sun)");
  assert.match(dynamicSlides[0], /title=Evento\+del\+domingo/);
});

test("run(): @mentions each distinct Instagram-sourced venue in the caption, deduped, in first-seen order — Daniel 2026-08-23: gives the venue a direct incentive to reshare", async () => {
  const supabase = fakeSupabase({
    events: [
      {
        id: "e1",
        title: "Evento uno",
        artist: null,
        place_name: null,
        region_id: null,
        image_url: "https://example.com/a.jpg",
        description: null,
        sensitivity_tags: [],
        opening_datetime: "2026-08-31T20:00:00.000Z",
        opening_time_confirmed: true,
        run_start_date: null,
        run_end_date: null,
        freeform_location: "Santiago",
        source_account: "galeria_uno",
        event_type: "inauguracion",
      },
      {
        id: "e2",
        title: "Evento dos",
        artist: null,
        place_name: null,
        region_id: null,
        image_url: "https://example.com/b.jpg",
        description: null,
        sensitivity_tags: [],
        opening_datetime: "2026-09-01T20:00:00.000Z",
        opening_time_confirmed: true,
        run_start_date: null,
        run_end_date: null,
        freeform_location: "Providencia",
        source_account: null, // bright_source event — no Instagram handle at all
        event_type: "inauguracion",
      },
      {
        id: "e3",
        title: "Evento tres",
        artist: null,
        place_name: null,
        region_id: null,
        image_url: "https://example.com/c.jpg",
        description: null,
        sensitivity_tags: [],
        opening_datetime: "2026-08-31T20:00:00.000Z",
        opening_time_confirmed: true,
        run_start_date: null,
        run_end_date: null,
        freeform_location: "Valparaíso",
        source_account: "galeria_uno", // same account as e1 — must not be mentioned twice
        event_type: "inauguracion",
      },
    ],
    regions: [],
    social_post_log: [],
  });

  let capturedCaption = "";
  await run({
    supabase,
    now: new Date("2026-08-31T12:00:00.000Z"), // a Monday
    instagramConfig: { igBusinessAccountId: "fake-account", accessToken: "fake-token" },
    publishInstagramCarouselFn: async (_config, _imageUrls, caption) => {
      capturedCaption = caption;
      return "fake-media-id";
    },
  });

  assert.match(capturedCaption, /Con: @galeria_uno$/);
  assert.equal(capturedCaption.match(/@galeria_uno/g)?.length, 1, "same account mentioned only once");
});

// Real signal, 2026-08-25: a tagged venue resshared and got a real reply,
// and the post's ARTIST (never tagged) still liked and thanked it
// publicly, unprompted, on their own — extended venue tagging to artists.
test("run(): @mentions the artist too when the source caption named one, combined with venue mentions in one deduped list", async () => {
  const supabase = fakeSupabase({
    events: [
      {
        id: "e1",
        title: "Evento uno",
        artist: "Artista Uno",
        place_name: null,
        region_id: null,
        image_url: "https://example.com/a.jpg",
        description: null,
        sensitivity_tags: [],
        opening_datetime: "2026-08-31T20:00:00.000Z",
        opening_time_confirmed: true,
        run_start_date: null,
        run_end_date: null,
        freeform_location: "Santiago",
        source_account: "galeria_uno",
        artist_instagram_handle: "artistauno",
        event_type: "inauguracion",
      },
      {
        id: "e2",
        title: "Evento dos",
        artist: "Artista Dos",
        place_name: null,
        region_id: null,
        image_url: "https://example.com/b.jpg",
        description: null,
        sensitivity_tags: [],
        opening_datetime: "2026-09-01T20:00:00.000Z",
        opening_time_confirmed: true,
        run_start_date: null,
        run_end_date: null,
        freeform_location: "Providencia",
        source_account: "galeria_dos",
        artist_instagram_handle: "galeria_dos", // same handle as the venue — must not repeat
        event_type: "inauguracion",
      },
    ],
    regions: [],
    social_post_log: [],
  });

  let capturedCaption = "";
  await run({
    supabase,
    now: new Date("2026-08-31T12:00:00.000Z"), // a Monday
    instagramConfig: { igBusinessAccountId: "fake-account", accessToken: "fake-token" },
    publishInstagramCarouselFn: async (_config, _imageUrls, caption) => {
      capturedCaption = caption;
      return "fake-media-id";
    },
  });

  assert.match(capturedCaption, /@artistauno/);
  assert.match(capturedCaption, /@galeria_uno/);
  assert.match(capturedCaption, /@galeria_dos/);
  assert.equal(capturedCaption.match(/@galeria_dos/g)?.length, 1, "handle shared by venue and artist mentioned only once");
});

test(
  "run(): publishes a mixed carousel on Monday, logs every published event (including what used to be exempt as 'inauguracion'), and a second run the same day doesn't repeat it",
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
          event_type: "inauguracion",
          opening_datetime: "2026-08-31T20:00:00.000Z", // Monday — inside Monday's window
          image_url: "https://example.com/a.jpg",
        },
        {
          title: "Visita guiada de prueba",
          freeform_location: TEST_REGION,
          region_id: regionId,
          curation_status: "approved",
          source: "discovered",
          event_type: "visita_guiada",
          opening_datetime: "2026-09-01T20:00:00.000Z", // Tuesday — inside Monday's window
          image_url: "https://example.com/b.jpg",
        },
        {
          title: "Exposición fuera de alcance",
          freeform_location: TEST_REGION,
          region_id: regionId,
          curation_status: "approved",
          source: "discovered",
          event_type: "exposicion",
          run_start_date: "2026-08-01",
          run_end_date: "2026-09-01",
          image_url: "https://example.com/c.jpg",
        },
      ]);
      if (eventsError) throw new Error(`Failed to seed test events: ${eventsError.message}`);

      const published: { imageUrls: string[]; caption: string }[] = [];
      const now = new Date("2026-08-31T12:00:00.000Z"); // Monday
      await run({
        supabase: client,
        now,
        instagramConfig: { igBusinessAccountId: "fake-account", accessToken: "fake-token" },
        publishInstagramCarouselFn: async (_config, imageUrls, caption) => {
          published.push({ imageUrls, caption });
          return `fake-media-id-${published.length}`;
        },
      });

      assert.equal(published.length, 1, "exactly one carousel, mixing both eligible event types");
      const dynamicSlides = published[0].imageUrls.slice(0, -1);
      assert.equal(dynamicSlides.length, 2, "inauguracion + visita_guiada, exposicion excluded");
      assert.equal(published[0].imageUrls.at(-1), "https://www.caldearte.com/social/ig-post-cierre.png");

      const { data: logRows, error: logError } = await client.from("social_post_log").select("post_type").eq("week_start", "2026-08-31");
      if (logError) throw new Error(`Failed to read social_post_log: ${logError.message}`);
      // Both events logged now, unlike the old scheme's "inauguracion never
      // logs, so it can repeat weekly" carve-out — that's exactly the
      // behavior this redesign removes.
      assert.deepEqual((logRows ?? []).map((r) => r.post_type).sort(), ["agenda", "agenda"]);

      // Running again the same day must not re-publish the same events —
      // permanent de-dup, not scoped to a single run.
      const secondRunPublished: unknown[] = [];
      await run({
        supabase: client,
        now,
        instagramConfig: { igBusinessAccountId: "fake-account", accessToken: "fake-token" },
        publishInstagramCarouselFn: async (_config, imageUrls, caption) => {
          secondRunPublished.push({ imageUrls, caption });
          return "should-not-happen";
        },
      });
      assert.equal(secondRunPublished.length, 0, "both events already logged — nothing left to post");
    } finally {
      await client.from("social_post_log").delete().eq("week_start", "2026-08-31");
      await client.from("instagram_posts").delete().eq("week_start", "2026-08-31");
      await client.from("events").delete().eq("region_id", regionId);
      await client.from("regions").delete().eq("id", regionId);
    }
  },
);
