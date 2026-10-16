import { test } from "node:test";
import assert from "node:assert/strict";
import { run } from "./run.js";

const hasLocalSupabase = Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);

test("run(): a Saturday-evening run (target Sunday, already covered by Friday's weekend post) exits without touching Instagram or Supabase", async () => {
  let publishCalled = false;
  await run({
    now: new Date("2026-08-08T22:30:00.000Z"), // Saturday 18:30 in Santiago
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
        gte: () => builder,
        insert: async () => ({ error: new Error("dry run should never insert") }),
        then: (resolve: (v: { data: unknown[]; error: null }) => void) => resolve({ data, error: null }),
      };
      return builder;
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- test double, not the real typed client
  } as any;
}

// A table's first select() fails `failCount` times (e.g. simulating the
// real "JWT issued at future" transient Supabase error seen 2026-09-02)
// before succeeding, to exercise run()'s retry loop.
function flakySupabase(tables: Record<string, unknown[]>, failingTable: string, failCount: number) {
  let calls = 0;
  return {
    from(table: string) {
      const data = tables[table] ?? [];
      const builder = {
        select: () => builder,
        eq: () => builder,
        is: () => builder,
        gte: () => builder,
        insert: async () => ({ error: new Error("dry run should never insert") }),
        then: (resolve: (v: { data: unknown[] | null; error: Error | null }) => void) => {
          if (table === failingTable && calls < failCount) {
            calls++;
            resolve({ data: null, error: new Error("JWT issued at future") });
            return;
          }
          resolve({ data, error: null });
        },
      };
      return builder;
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- test double, not the real typed client
  } as any;
}

test("run(): retries a transient Supabase read failure and still publishes", async () => {
  let publishCalled = false;
  const supabase = flakySupabase(
    {
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
          source_type: "web",
          curation_status: "approved",
          removed_at: null,
        },
      ],
      regions: [],
      social_post_log: [],
    },
    "events",
    2,
  );
  await run({
    now: new Date("2026-08-04T12:00:00.000Z"),
    supabase,
    forceWindow: { start: "2026-08-04", end: "2026-08-04" },
    instagramConfig: { igBusinessAccountId: "unused", accessToken: "unused" },
    publishInstagramCarouselFn: async () => {
      publishCalled = true;
      return "unused";
    },
  });
  assert.equal(publishCalled, true);
});

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

test("run(): an evening run covers only the next day — Sunday evening posts Monday, excluding Sunday (before) and Tuesday/Wednesday (after)", async () => {
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
    now: new Date("2026-08-30T22:30:00.000Z"), // Sunday 18:30 in Santiago
    instagramConfig: { igBusinessAccountId: "fake-account", accessToken: "fake-token" },
    publishInstagramCarouselFn: async (_config, imageUrls) => {
      published.push({ imageUrls });
      return "fake-media-id";
    },
  });

  assert.equal(published.length, 1);
  const dynamicSlides = published[0].imageUrls.slice(0, -1); // last slide is always the fixed closing image
  assert.equal(dynamicSlides.length, 1, "only Monday's event should be selected");
  assert.match(dynamicSlides[0], /title=Evento\+del\+lunes/);
  assert.match(dynamicSlides[0], /type=inauguracion/);
});

test("run(): a Friday-evening run covers Saturday and Sunday", async () => {
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
    now: new Date("2026-09-04T23:00:00.000Z"), // Friday 19:00 in Santiago
    instagramConfig: { igBusinessAccountId: "fake-account", accessToken: "fake-token" },
    publishInstagramCarouselFn: async (_config, imageUrls) => {
      published.push({ imageUrls });
      return "fake-media-id";
    },
  });

  assert.equal(published.length, 1);
  const dynamicSlides = published[0].imageUrls.slice(0, -1);
  assert.equal(dynamicSlides.length, 1, "only the Sunday event falls inside the weekend window (Sat-Sun)");
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
        opening_datetime: "2026-08-31T21:00:00.000Z",
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

function oneEventSupabase(id: string) {
  return fakeSupabase({
    events: [
      {
        id,
        title: "Evento de prueba",
        artist: null,
        place_name: null,
        region_id: null,
        image_url: "https://example.com/a.jpg",
        description: null,
        sensitivity_tags: [],
        opening_datetime: "2026-08-31T20:00:00.000Z", // Monday
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
}

test("run(): dry run verifies Facebook credentials too when configured, alongside Instagram", async () => {
  let facebookVerifyCalled = false;
  await run({
    supabase: oneEventSupabase("e1"),
    now: new Date("2026-08-31T12:00:00.000Z"), // a Monday
    dryRun: true,
    instagramConfig: { igBusinessAccountId: "fake-account", accessToken: "fake-token" },
    verifyInstagramAccountFn: async () => ({ username: "caldearte.oficial", mediaCount: 0 }),
    facebookConfig: { pageId: "fake-page", accessToken: "fake-token" },
    verifyFacebookPageFn: async () => {
      facebookVerifyCalled = true;
      return { name: "Caldearte" };
    },
  });
  assert.equal(facebookVerifyCalled, true);
});

test("run(): dry run skips Facebook verification entirely when no Facebook config is present — stays backwards-compatible", async () => {
  let facebookVerifyCalled = false;
  await run({
    supabase: oneEventSupabase("e1"),
    now: new Date("2026-08-31T12:00:00.000Z"),
    dryRun: true,
    instagramConfig: { igBusinessAccountId: "fake-account", accessToken: "fake-token" },
    verifyInstagramAccountFn: async () => ({ username: "caldearte.oficial", mediaCount: 0 }),
    verifyFacebookPageFn: async () => {
      facebookVerifyCalled = true;
      return { name: "Caldearte" };
    },
  });
  assert.equal(facebookVerifyCalled, false);
});

test("run(): publishes the same images to Facebook right after Instagram, when configured", async () => {
  let facebookImageUrls: string[] = [];
  let instagramImageUrls: string[] = [];
  await run({
    supabase: oneEventSupabase("e1"),
    now: new Date("2026-08-31T12:00:00.000Z"),
    instagramConfig: { igBusinessAccountId: "fake-account", accessToken: "fake-token" },
    publishInstagramCarouselFn: async (_config, imageUrls) => {
      instagramImageUrls = imageUrls;
      return "fake-media-id";
    },
    facebookConfig: { pageId: "fake-page", accessToken: "fake-token" },
    publishFacebookPostFn: async (_config, imageUrls) => {
      facebookImageUrls = imageUrls;
      return "fake-facebook-post-id";
    },
  });
  assert.deepEqual(facebookImageUrls, instagramImageUrls);
});

// Daniel 2026-09-25, right after the first real Facebook post: the "Con:
// @handle" line names Instagram accounts (venue/artist) that don't exist
// on Facebook — posting it there would just be inert, unlinked "@handle"
// text with no real account behind it.
test("run(): Facebook's caption never includes Instagram's venue/artist @mentions, even when Instagram's does", async () => {
  const supabase = fakeSupabase({
    events: [
      {
        id: "e1",
        title: "Evento con fuente de Instagram",
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
    ],
    regions: [],
    social_post_log: [],
  });

  let instagramCaption = "";
  let facebookCaption = "";
  await run({
    supabase,
    now: new Date("2026-08-31T12:00:00.000Z"),
    instagramConfig: { igBusinessAccountId: "fake-account", accessToken: "fake-token" },
    publishInstagramCarouselFn: async (_config, _imageUrls, caption) => {
      instagramCaption = caption;
      return "fake-media-id";
    },
    facebookConfig: { pageId: "fake-page", accessToken: "fake-token" },
    publishFacebookPostFn: async (_config, _imageUrls, caption) => {
      facebookCaption = caption;
      return "fake-facebook-post-id";
    },
  });

  assert.match(instagramCaption, /Con: @galeria_uno/);
  assert.doesNotMatch(facebookCaption, /@galeria_uno/);
  assert.doesNotMatch(facebookCaption, /Con:/);
});

test("run(): a Facebook posting failure is logged, not thrown — Instagram already published by that point and must not be undone", async () => {
  let instagramPublished = false;
  await assert.doesNotReject(
    run({
      supabase: oneEventSupabase("e1"),
      now: new Date("2026-08-31T12:00:00.000Z"),
      instagramConfig: { igBusinessAccountId: "fake-account", accessToken: "fake-token" },
      publishInstagramCarouselFn: async () => {
        instagramPublished = true;
        return "fake-media-id";
      },
      facebookConfig: { pageId: "fake-page", accessToken: "fake-token" },
      publishFacebookPostFn: async () => {
        throw new Error("Facebook Graph API error: something went wrong");
      },
    }),
  );
  assert.equal(instagramPublished, true);
});

test(
  "run(): publishes a mixed carousel for Monday, logs every published event (including what used to be exempt as 'inauguracion'), and a second run the same day doesn't repeat it",
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
          opening_datetime: "2026-08-31T20:00:00.000Z", // Monday — inside Monday's window (posted Sunday evening)
          image_url: "https://example.com/a.jpg",
        },
        {
          title: "Visita guiada de prueba",
          freeform_location: TEST_REGION,
          region_id: regionId,
          curation_status: "approved",
          source: "discovered",
          event_type: "visita_guiada",
          opening_datetime: "2026-08-31T15:00:00.000Z", // Monday noon — inside Monday's window
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
      const now = new Date("2026-08-30T22:30:00.000Z"); // Sunday evening — posts Monday
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

function eventRow(id: string, openingDatetime: string, eventType = "inauguracion", extra: Record<string, unknown> = {}) {
  return {
    id,
    title: `Evento ${id}`,
    artist: null,
    place_name: null,
    region_id: null,
    image_url: `https://example.com/${id}.jpg`,
    description: null,
    sensitivity_tags: [],
    opening_datetime: openingDatetime,
    opening_time_confirmed: true,
    run_start_date: null,
    run_end_date: null,
    freeform_location: "Santiago",
    event_type: eventType,
    ...extra,
  };
}

async function publishOnce(supabase: unknown, now: Date) {
  const published: { imageUrls: string[]; caption: string }[] = [];
  await run({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- test double
    supabase: supabase as any,
    now,
    instagramConfig: { igBusinessAccountId: "fake-account", accessToken: "fake-token" },
    publishInstagramCarouselFn: async (_config, imageUrls, caption) => {
      published.push({ imageUrls, caption });
      return "fake-media-id";
    },
  });
  return published;
}

test("run(): a carousel already published in the last 12h makes a second run a no-op — a retry must never post the leftovers as a 2nd carousel", async () => {
  const supabase = fakeSupabase({
    events: [eventRow("e1", "2026-10-16T22:30:00.000Z")],
    regions: [],
    social_post_log: [],
    instagram_posts: [{ published_at: "2026-10-15T22:31:00.000Z" }],
  });
  const published = await publishOnce(supabase, new Date("2026-10-15T23:30:00.000Z")); // Thursday 20:30
  assert.equal(published.length, 0);
});

test("run(): a morning catch-up run targets today and drops events that already started", async () => {
  const supabase = fakeSupabase({
    events: [
      eventRow("mediodia", "2026-10-16T15:00:00.000Z"), // Friday 12:00 Santiago — already started at 13:00
      eventRow("tarde", "2026-10-16T22:30:00.000Z"), // Friday 19:30
    ],
    regions: [],
    social_post_log: [],
  });
  const published = await publishOnce(supabase, new Date("2026-10-16T16:00:00.000Z")); // Friday 13:00
  assert.equal(published.length, 1);
  const dynamicSlides = published[0].imageUrls.slice(0, -1);
  assert.equal(dynamicSlides.length, 1);
  assert.match(dynamicSlides[0], /title=Evento\+tarde/);
  assert.match(published[0].caption, /^Hoy hay arte en Chile/);
});

test("run(): more than 9 events → the closing slide becomes 'y N más', counting every left-out event the site shows (no photo, sensitive, already posted too)", async () => {
  const saturday = (i: number) => `2026-10-17T${String(12 + i).padStart(2, "0")}:00:00.000Z`;
  const supabase = fakeSupabase({
    events: [
      ...Array.from({ length: 11 }, (_, i) => eventRow(`s${i}`, saturday(i), "inauguracion", { freeform_location: `Comuna ${i}` })),
      eventRow("sin-foto", "2026-10-18T18:00:00.000Z", "visita_guiada", { image_url: null }),
      eventRow("sensible", "2026-10-18T19:00:00.000Z", "inauguracion", { sensitivity_tags: ["memoria_dictadura"] }),
      eventRow("ya-posteado", "2026-10-18T20:00:00.000Z"),
      eventRow("lunes", "2026-10-19T22:00:00.000Z"), // outside the weekend window — not counted
      eventRow("expo", "2026-10-17T22:00:00.000Z", "exposicion"), // not an opening/visita — not counted
    ],
    regions: [],
    social_post_log: [{ event_id: "ya-posteado" }],
  });
  const published = await publishOnce(supabase, new Date("2026-10-16T22:30:00.000Z")); // Friday 19:30
  assert.equal(published.length, 1);
  assert.equal(published[0].imageUrls.length, 10);
  // 11 Saturday events − 9 shown = 2, + sin-foto + sensible + ya-posteado = 5
  assert.equal(published[0].imageUrls.at(-1), "https://www.caldearte.com/api/social/cierre?mas=5&cuando=finde");
  assert.match(published[0].caption, /^Este fin de semana hay arte en Chile/);
});

test("run(): an event at 21:00 Santiago (00:00Z next day) belongs to its Santiago day", async () => {
  const supabase = fakeSupabase({
    events: [
      eventRow("jueves-21h", "2026-10-16T00:00:00.000Z"), // Thursday 21:00 Santiago
      eventRow("viernes-21h", "2026-10-17T00:00:00.000Z"), // Friday 21:00 Santiago
    ],
    regions: [],
    social_post_log: [],
  });
  const published = await publishOnce(supabase, new Date("2026-10-15T22:30:00.000Z")); // Thursday 19:30 → posts Friday
  assert.equal(published.length, 1);
  const dynamicSlides = published[0].imageUrls.slice(0, -1);
  assert.equal(dynamicSlides.length, 1);
  assert.match(dynamicSlides[0], /title=Evento\+viernes-21h/);
  assert.match(published[0].caption, /^Mañana hay arte en Chile/);
  assert.equal(published[0].imageUrls.at(-1), "https://www.caldearte.com/social/ig-post-cierre.png");
});
