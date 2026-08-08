import { test } from "node:test";
import assert from "node:assert/strict";
import type { Tables } from "@caldearte/shared-types";
import { buildDigestSections, run } from "./run.js";

type EventRow = Tables<"events">;
type EventWithRegion = EventRow & { adminRegionName: string | null; comunaName: string | null };

const WEEK = { start: "2026-08-03", end: "2026-08-09" }; // a Mon..Sun

const REGION_A = "Región Metropolitana de Santiago";
const REGION_B = "Región de Valparaíso";

let idCounter = 0;
function makeEvent(overrides: Partial<EventWithRegion> = {}): EventWithRegion {
  idCounter++;
  return {
    id: `event-${idCounter}`,
    title: `Evento ${idCounter}`,
    artist: null,
    description: null,
    freeform_location: "Santiago",
    place_name: "Galería de prueba",
    region_id: "11111111-1111-1111-1111-111111111111",
    adminRegionName: REGION_A,
    comunaName: "Santiago",
    opening_datetime: null,
    opening_date_confidence: "alta",
    opening_time_confirmed: true,
    run_start_date: null,
    run_end_date: null,
    medium_type: null,
    sensitivity_tags: [],
    source: "discovered",
    image_storage_path: null,
    image_url: null,
    source_url: `https://example.com/${idCounter}`,
    curation_status: "approved",
    curation_reasoning: null,
    public_explanation: null,
    created_at: "2026-07-01T00:00:00.000Z",
    ...overrides,
  };
}

test("buildDigestSections: an event opening inside the week goes in 'Inauguraciones de esta semana', not also elsewhere", () => {
  const event = makeEvent({ opening_datetime: "2026-08-05T20:00:00.000Z", created_at: "2026-07-01T00:00:00.000Z" });
  const { sections } = buildDigestSections([event], REGION_A, WEEK);
  assert.equal(sections[0].label, "Inauguraciones de esta semana");
  assert.equal(sections[0].events.length, 1);
  assert.equal(sections[0].events[0].isOpeningThisWeek, true);
  assert.equal(sections[0].emptyMessage, undefined);
});

test("buildDigestSections: 'Inauguraciones de esta semana' still renders with an explicit emptyMessage when there are none this week — not silently omitted", () => {
  const event = makeEvent({ run_end_date: "2026-08-20" }); // lands in "Expos para visitar", not an opening
  const { sections } = buildDigestSections([event], REGION_A, WEEK);
  const inauguraciones = sections.find((s) => s.label === "Inauguraciones de esta semana");
  assert.ok(inauguraciones);
  assert.equal(inauguraciones.events.length, 0);
  assert.match(inauguraciones.emptyMessage ?? "", /No hemos encontrado ninguna inauguración/);
});

test("buildDigestSections: an event whose run actually STARTS this week (run_start_date) is NOT split into its own 'new' section — it's treated the same as any other non-opening event, in 'Expos para visitar esta semana' — removed 2026-08-08 (user feedback: a separate 'nuevas' bucket read as confusing, since an inauguración already IS how a new exhibition starts)", () => {
  const event = makeEvent({ created_at: "2026-06-01T00:00:00.000Z", run_start_date: "2026-08-04", opening_datetime: null });
  const { sections } = buildDigestSections([event], REGION_A, WEEK);
  assert.equal(sections.find((s) => s.label === "Expos nuevas esta semana"), undefined);
  const paraVisitar = sections.find((s) => s.label === "Expos para visitar esta semana");
  assert.ok(paraVisitar);
  assert.equal(paraVisitar.events.length, 1);
});

test("buildDigestSections: 'Expos para visitar esta semana' renders with an explicit emptyMessage when there's nothing to show — not silently omitted", () => {
  const event = makeEvent({ opening_datetime: "2026-08-05T20:00:00.000Z" }); // only an opening this week
  const { sections } = buildDigestSections([event], REGION_A, WEEK);
  const paraVisitar = sections.find((s) => s.label === "Expos para visitar esta semana");
  assert.ok(paraVisitar);
  assert.equal(paraVisitar.events.length, 0);
  assert.match(paraVisitar.emptyMessage ?? "", /No hemos encontrado exposiciones para visitar/);
});

test("buildDigestSections: an event whose opening was WEEKS AGO (still running) is NOT marked isOpeningThisWeek, even though openingDatetime is set — it belongs in 'Expos para visitar', not 'Inauguraciones'", () => {
  const event = makeEvent({ opening_datetime: "2026-07-02T19:00:00.000Z", run_end_date: "2026-08-20" });
  const { sections } = buildDigestSections([event], REGION_A, WEEK);
  assert.equal(sections.find((s) => s.label === "Inauguraciones de esta semana")?.events.length, 0);
  const paraVisitar = sections.find((s) => s.label === "Expos para visitar esta semana");
  assert.equal(paraVisitar?.events.length, 1);
  assert.equal(paraVisitar?.events[0].isOpeningThisWeek, false);
});

test("buildDigestSections: 'Expos para visitar esta semana' shows up to 10 already-running events, ending-soonest first, with no 'ver todas' link at exactly the cap", () => {
  const events = [
    makeEvent({ run_end_date: "2026-08-20" }),
    makeEvent({ run_end_date: "2026-08-10" }),
    makeEvent({ run_end_date: "2026-09-01" }),
    makeEvent({ run_end_date: "2026-08-12" }),
  ];
  const { sections } = buildDigestSections(events, REGION_A, WEEK);
  const paraVisitar = sections.find((s) => s.label === "Expos para visitar esta semana");
  assert.ok(paraVisitar);
  assert.equal(paraVisitar.events.length, 4);
  assert.deepEqual(
    paraVisitar.events.map((e) => e.runEndDate),
    ["2026-08-10", "2026-08-12", "2026-08-20", "2026-09-01"],
  );
  assert.equal(paraVisitar.moreLink, undefined);
});

test("buildDigestSections: 'Expos para visitar esta semana' diversifies across comunas when capping at 10 (2026-08-08 user request: 'ojalá de distintas comunas') — round-robins one event per comuna per pass, instead of letting one comuna's closing-soon cluster crowd out the rest", () => {
  const events = [
    // Comuna A has 8 closing-soon events — a flat soonest-first cut would
    // fill the whole cap with just this one comuna.
    ...Array.from({ length: 8 }, (_, i) => makeEvent({ comunaName: "Comuna A", run_end_date: `2026-08-${10 + i}` })),
    makeEvent({ comunaName: "Comuna B", run_end_date: "2026-08-25" }),
    makeEvent({ comunaName: "Comuna C", run_end_date: "2026-08-26" }),
    makeEvent({ comunaName: "Comuna D", run_end_date: "2026-08-27" }),
  ];
  const { sections } = buildDigestSections(events, REGION_A, WEEK);
  const paraVisitar = sections.find((s) => s.label === "Expos para visitar esta semana");
  assert.ok(paraVisitar);
  assert.equal(paraVisitar.events.length, 10);
  const comunas = new Set(paraVisitar.events.map((e) => e.comunaName));
  assert.equal(comunas.size, 4, "expected all 4 comunas represented, not just Comuna A's closing-soon cluster");
});

test("buildDigestSections: 'Expos para visitar esta semana' caps cards at 10 and adds a 'ver todas' link naming the región's TRUE total (including openings/new, not just the para-visitar pool) when there's more", () => {
  const events = [
    makeEvent({ opening_datetime: "2026-08-05T20:00:00.000Z" }), // +1 opening
    ...Array.from({ length: 14 }, (_, i) => makeEvent({ run_end_date: `2026-08-${10 + i}` })), // 14 para-visitar
  ];
  const { sections, regionTotalThisWeek } = buildDigestSections(events, REGION_A, WEEK);
  assert.equal(regionTotalThisWeek, 15);
  const paraVisitar = sections.find((s) => s.label === "Expos para visitar esta semana");
  assert.ok(paraVisitar);
  assert.equal(paraVisitar.events.length, 10);
  assert.equal(paraVisitar.moreLink?.label, `Ver todas las 15 exposiciones en ${REGION_A}`);
  assert.equal(paraVisitar.moreLink?.url, "https://www.caldearte.com");
});

test("buildDigestSections: an event that already closed before the week's end is excluded entirely — a región with truly nothing anywhere yields zero sections", () => {
  const event = makeEvent({ run_end_date: "2026-07-20" });
  const { sections } = buildDigestSections([event], REGION_A, WEEK);
  assert.equal(sections.length, 0);
});

test("buildDigestSections: an event in a different región appears only in 'En otras regiones', sampled up to 10, with an always-present nationwide explore link", () => {
  const events = [
    makeEvent({ adminRegionName: REGION_B }),
    makeEvent({ adminRegionName: REGION_B }),
    makeEvent({ adminRegionName: REGION_B }),
    makeEvent({ adminRegionName: REGION_B }),
  ];
  const { sections } = buildDigestSections(events, REGION_A, WEEK);
  const otras = sections.find((s) => s.label === "En otras regiones");
  assert.ok(otras);
  assert.equal(otras.events.length, 4);
  assert.equal(otras.moreLink?.label, "Si deseas puedes explorar las 4 exposiciones activas esta semana a lo largo de Chile");
  assert.equal(otras.moreLink?.url, "https://www.caldearte.com");
});

test("buildDigestSections: 'En otras regiones' samples at most 10 even with more available — bumped 5 -> 10, 2026-08-08 user request", () => {
  const events = Array.from({ length: 14 }, () => makeEvent({ adminRegionName: REGION_B }));
  const { sections } = buildDigestSections(events, REGION_A, WEEK);
  const otras = sections.find((s) => s.label === "En otras regiones");
  assert.equal(otras?.events.length, 10);
});

test("buildDigestSections: 'En otras regiones' is sorted soonest-closing-first and deterministic — no longer randomized (2026-08-08), since it now also feeds a shared per-región AI intro that must agree with whichever cards are actually shown", () => {
  const events = [
    makeEvent({ adminRegionName: REGION_B, run_end_date: "2026-09-01" }),
    makeEvent({ adminRegionName: REGION_B, run_end_date: "2026-08-10" }),
    makeEvent({ adminRegionName: REGION_B, run_end_date: "2026-08-20" }),
  ];
  const runTwice = () => buildDigestSections(events, REGION_A, WEEK).sections.find((s) => s.label === "En otras regiones")!.events.map((e) => e.id);
  const first = runTwice();
  const second = runTwice();
  assert.deepEqual(first, second, "expected the same order every call, not a random shuffle");
  assert.deepEqual(
    first,
    [events[1].id, events[2].id, events[0].id],
    "expected soonest-closing-first, same convention as 'Expos para visitar esta semana'",
  );
});

test("buildDigestSections: an empty event pool yields zero sections (subscriber gets skipped, not an empty email)", () => {
  assert.deepEqual(buildDigestSections([], REGION_A, WEEK), { sections: [], regionTotalThisWeek: 0 });
});

test("buildDigestSections: toDigestEvent carries comuna, image, and opening_time_confirmed through for the email builders", () => {
  const event = makeEvent({
    opening_datetime: "2026-08-05T20:00:00.000Z",
    opening_time_confirmed: false,
    comunaName: "Providencia",
    image_url: "https://example.com/img.jpg",
  });
  const { sections } = buildDigestSections([event], REGION_A, WEEK);
  const [e] = sections[0].events;
  assert.equal(e.comunaName, "Providencia");
  assert.equal(e.imageUrl, "https://example.com/img.jpg");
  assert.equal(e.openingTimeConfirmed, false);
  assert.equal(e.id, event.id);
});

// Integration test against local Supabase. Run `supabase start`, then export
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY before running this suite.
// Resend is always stubbed via RunDeps.sendDigestEmailFn — no real
// RESEND_API_KEY needed.
const hasLocalSupabase = Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);

const TEST_REGION = "__test_newsletter_region__";
// Must be one of the 16 real admin_region_name values — newsletter_subscribers
// now has a CHECK constraint against that exact list (security audit,
// 2026-07-31), so a synthetic placeholder like "__test_admin_region__" would
// fail the insert. Picked a rarely-used real región to keep collision risk
// with other fixtures low.
const TEST_ADMIN_REGION = "Región de Magallanes y de la Antártica Chilena";

test(
  "run(): sends a digest only to confirmed, active subscribers with at least one eligible section, skips the rest",
  { skip: !hasLocalSupabase },
  async () => {
    const { getSupabaseClient } = await import("../lib/supabase-client.js");
    const client = getSupabaseClient();

    const { data: region, error: regionError } = await client
      .from("regions")
      .insert({ name: TEST_REGION, country: "Testland", language: "es", status: "active", admin_region_name: TEST_ADMIN_REGION })
      .select("id")
      .single();
    if (regionError) throw new Error(`Failed to seed test region: ${regionError.message}`);
    const regionId = region.id;

    try {
      const { error: eventError } = await client.from("events").insert({
        title: "Evento de prueba del newsletter",
        freeform_location: TEST_REGION,
        region_id: regionId,
        curation_status: "approved",
        source: "discovered",
        opening_datetime: "2026-08-05T20:00:00.000Z",
      });
      if (eventError) throw new Error(`Failed to seed test event: ${eventError.message}`);

      const { error: subscribersError } = await client.from("newsletter_subscribers").insert([
        {
          email: "confirmado-con-eventos@example.com",
          admin_region_name: TEST_ADMIN_REGION,
          confirm_token: "tok-with-events",
          confirmed_at: new Date().toISOString(),
        },
        {
          email: "no-confirmado@example.com",
          admin_region_name: TEST_ADMIN_REGION,
          confirm_token: "tok-unconfirmed",
          confirmed_at: null,
        },
        {
          email: "dado-de-baja@example.com",
          admin_region_name: TEST_ADMIN_REGION,
          confirm_token: "tok-unsubscribed",
          confirmed_at: new Date().toISOString(),
          unsubscribed_at: new Date().toISOString(),
        },
      ]);
      if (subscribersError) throw new Error(`Failed to seed test subscribers: ${subscribersError.message}`);

      const sentTo: string[] = [];
      await run({
        supabase: client,
        now: new Date("2026-08-05T12:00:00.000Z"),
        sendDigestEmailFn: async (email) => {
          sentTo.push(email);
        },
        // Stubbed here so this test never hits the real Anthropic API —
        // the intro-generation behavior itself has its own dedicated test
        // below, plus intro.test.ts.
        generateRegionIntroFn: async () => null,
        generateOtherRegionsIntroFn: async () => null,
      });

      assert.deepEqual(sentTo, ["confirmado-con-eventos@example.com"]);
    } finally {
      await client.from("newsletter_subscribers").delete().eq("admin_region_name", TEST_ADMIN_REGION);
      await client.from("events").delete().eq("region_id", regionId);
      await client.from("regions").delete().eq("id", regionId);
    }
  },
);

test(
  "run(): excludes an event soft-removed via the admin 'Quitar' action (events.removed_at set) even though curation_status is still 'approved' — real bug found 2026-08-08: the newsletter's own events query was missing the removed_at filter that events_public (what the site itself reads) already applies, so a removed event kept appearing in the digest with a permalink that 404s",
  { skip: !hasLocalSupabase },
  async () => {
    const { getSupabaseClient } = await import("../lib/supabase-client.js");
    const client = getSupabaseClient();

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
          title: "Evento vigente",
          freeform_location: TEST_REGION,
          region_id: regionId,
          curation_status: "approved",
          source: "discovered",
          opening_datetime: "2026-08-05T20:00:00.000Z",
        },
        {
          title: "Evento quitado por el admin",
          freeform_location: TEST_REGION,
          region_id: regionId,
          curation_status: "approved",
          source: "discovered",
          opening_datetime: "2026-08-06T20:00:00.000Z",
          // removed_at isn't in the generated Database types yet (the
          // schema has it, the checked-in types file is stale) — `as any`
          // here, not in production code, just to seed the fixture.
          ...({ removed_at: new Date().toISOString(), removed_reason: "prueba" } as any),
        },
      ]);
      if (eventsError) throw new Error(`Failed to seed test events: ${eventsError.message}`);

      const { error: subscriberError } = await client
        .from("newsletter_subscribers")
        .insert({ email: "removido@example.com", admin_region_name: TEST_ADMIN_REGION, confirm_token: "tok-removed", confirmed_at: new Date().toISOString() });
      if (subscriberError) throw new Error(`Failed to seed test subscriber: ${subscriberError.message}`);

      let sentTitles: string[] = [];
      await run({
        supabase: client,
        now: new Date("2026-08-05T12:00:00.000Z"),
        sendDigestEmailFn: async (_email, _token, sections) => {
          sentTitles = sections.flatMap((s) => s.events.map((e) => e.title));
        },
        generateRegionIntroFn: async () => null,
        generateOtherRegionsIntroFn: async () => null,
      });

      // Checks presence/absence rather than the exact full list — this
      // shared local dev DB can carry unrelated leftover fixture events
      // under the same real admin_region_name from other test files, and
      // this test only cares about the removed/not-removed distinction.
      assert.ok(sentTitles.includes("Evento vigente"), "expected the non-removed event to still appear");
      assert.ok(!sentTitles.includes("Evento quitado por el admin"), "expected the removed event to be excluded");
    } finally {
      await client.from("newsletter_subscribers").delete().eq("admin_region_name", TEST_ADMIN_REGION);
      await client.from("events").delete().eq("region_id", regionId);
      await client.from("regions").delete().eq("id", regionId);
    }
  },
);

test(
  "run(): generates the AI intro once per región and reuses it across every subscriber in that región — never once per subscriber",
  { skip: !hasLocalSupabase },
  async () => {
    const { getSupabaseClient } = await import("../lib/supabase-client.js");
    const client = getSupabaseClient();

    const { data: region, error: regionError } = await client
      .from("regions")
      .insert({ name: TEST_REGION, country: "Testland", language: "es", status: "active", admin_region_name: TEST_ADMIN_REGION })
      .select("id")
      .single();
    if (regionError) throw new Error(`Failed to seed test region: ${regionError.message}`);
    const regionId = region.id;

    try {
      const { error: eventError } = await client.from("events").insert({
        title: "Evento de prueba del newsletter",
        freeform_location: TEST_REGION,
        region_id: regionId,
        curation_status: "approved",
        source: "discovered",
        opening_datetime: "2026-08-05T20:00:00.000Z",
      });
      if (eventError) throw new Error(`Failed to seed test event: ${eventError.message}`);

      const { error: subscribersError } = await client.from("newsletter_subscribers").insert([
        { email: "sub1@example.com", admin_region_name: TEST_ADMIN_REGION, confirm_token: "tok-1", confirmed_at: new Date().toISOString() },
        { email: "sub2@example.com", admin_region_name: TEST_ADMIN_REGION, confirm_token: "tok-2", confirmed_at: new Date().toISOString() },
      ]);
      if (subscribersError) throw new Error(`Failed to seed test subscribers: ${subscribersError.message}`);

      let introCalls = 0;
      let otherRegionsIntroCalls = 0;
      const introsUsed: Array<string | null> = [];
      const otherRegionsIntrosUsed: Array<string | null> = [];
      await run({
        supabase: client,
        now: new Date("2026-08-05T12:00:00.000Z"),
        sendDigestEmailFn: async (_email, _token, _sections, intro, _week, otherRegionsIntro) => {
          introsUsed.push(intro ?? null);
          otherRegionsIntrosUsed.push(otherRegionsIntro ?? null);
        },
        generateRegionIntroFn: async () => {
          introCalls++;
          return "Intro compartida para toda la región.";
        },
        generateOtherRegionsIntroFn: async () => {
          otherRegionsIntroCalls++;
          return "Intro de otras regiones compartida.";
        },
      });

      assert.equal(introCalls, 1, "expected exactly one intro generation call for two subscribers in the same región");
      assert.deepEqual(introsUsed, ["Intro compartida para toda la región.", "Intro compartida para toda la región."]);
      assert.equal(otherRegionsIntroCalls, 1, "expected exactly one otherRegionsIntro generation call for two subscribers in the same región");
      assert.deepEqual(otherRegionsIntrosUsed, ["Intro de otras regiones compartida.", "Intro de otras regiones compartida."]);
    } finally {
      await client.from("newsletter_subscribers").delete().eq("admin_region_name", TEST_ADMIN_REGION);
      await client.from("events").delete().eq("region_id", regionId);
      await client.from("regions").delete().eq("id", regionId);
    }
  },
);
