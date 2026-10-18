import { test } from "node:test";
import assert from "node:assert/strict";
import type { Tables } from "@caldearte/shared-types";
import { buildDigestSections, run, editionBoundsInSantiago } from "./run.js";

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
    // Defaults to "inauguracion" — matches the pre-event_type behavior
    // these existing tests were written against (any confirmed
    // opening_datetime treated as an inauguración); tests specifically
    // about event_type/visita_guiada override this explicitly.
    event_type: "inauguracion",
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

// An exhibition that started before WEEK and closes on `end` — the
// realistic "Expos para visitar" shape. Both dates matter: under the
// site's activeRange rule (mirrored in run.ts), an event with ONLY a
// run_end_date is a one-day event on that date, not a run up to it.
function runningUntil(end: string): Partial<EventWithRegion> {
  return { run_start_date: "2026-07-15", run_end_date: end };
}

test("buildDigestSections: an event opening inside the week goes in 'Inauguraciones de jueves a domingo', not also elsewhere", () => {
  const event = makeEvent({ opening_datetime: "2026-08-05T20:00:00.000Z", created_at: "2026-07-01T00:00:00.000Z" });
  const { sections } = buildDigestSections([event], REGION_A, WEEK);
  assert.equal(sections[0].label, "Inauguraciones de jueves a domingo");
  assert.equal(sections[0].events.length, 1);
  assert.equal(sections[0].events[0].isOpeningThisWeek, true);
  assert.equal(sections[0].emptyMessage, undefined);
});

test("buildDigestSections: 'Inauguraciones de jueves a domingo' still renders with an explicit emptyMessage when there are none this week — not silently omitted", () => {
  const event = makeEvent(runningUntil("2026-08-20")); // lands in "Expos para visitar", not an opening
  const { sections } = buildDigestSections([event], REGION_A, WEEK);
  const inauguraciones = sections.find((s) => s.label === "Inauguraciones de jueves a domingo");
  assert.ok(inauguraciones);
  assert.equal(inauguraciones.events.length, 0);
  assert.match(inauguraciones.emptyMessage ?? "", /No hemos encontrado ninguna inauguración/);
});

test("buildDigestSections: an event whose run actually STARTS this week (run_start_date) is NOT split into its own 'new' section — it's treated the same as any other non-opening event, in 'Expos para visitar de jueves a domingo' — removed 2026-08-08 (user feedback: a separate 'nuevas' bucket read as confusing, since an inauguración already IS how a new exhibition starts)", () => {
  const event = makeEvent({ created_at: "2026-06-01T00:00:00.000Z", run_start_date: "2026-08-04", opening_datetime: null });
  const { sections } = buildDigestSections([event], REGION_A, WEEK);
  assert.equal(sections.find((s) => s.label === "Expos nuevas esta semana"), undefined);
  const paraVisitar = sections.find((s) => s.label === "Expos para visitar de jueves a domingo");
  assert.ok(paraVisitar);
  assert.equal(paraVisitar.events.length, 1);
});

test("buildDigestSections: 'Expos para visitar de jueves a domingo' renders with an explicit emptyMessage when there's nothing to show — not silently omitted", () => {
  const event = makeEvent({ opening_datetime: "2026-08-05T20:00:00.000Z" }); // only an opening this week
  const { sections } = buildDigestSections([event], REGION_A, WEEK);
  const paraVisitar = sections.find((s) => s.label === "Expos para visitar de jueves a domingo");
  assert.ok(paraVisitar);
  assert.equal(paraVisitar.events.length, 0);
  assert.match(paraVisitar.emptyMessage ?? "", /No hemos encontrado exposiciones para visitar/);
});

test("buildDigestSections: an event whose opening was WEEKS AGO (still running) is NOT marked isOpeningThisWeek, even though openingDatetime is set — it belongs in 'Expos para visitar', not 'Inauguraciones'", () => {
  const event = makeEvent({ opening_datetime: "2026-07-02T19:00:00.000Z", run_end_date: "2026-08-20" });
  const { sections } = buildDigestSections([event], REGION_A, WEEK);
  assert.equal(sections.find((s) => s.label === "Inauguraciones de jueves a domingo")?.events.length, 0);
  const paraVisitar = sections.find((s) => s.label === "Expos para visitar de jueves a domingo");
  assert.equal(paraVisitar?.events.length, 1);
  assert.equal(paraVisitar?.events[0].isOpeningThisWeek, false);
});

test("buildDigestSections: a visita_guiada event goes in its own 'Visitas guiadas de jueves a domingo' section, not 'Inauguraciones' — real bug found 2026-08-29, both categories share opening_datetime", () => {
  const event = makeEvent({ opening_datetime: "2026-08-05T20:00:00.000Z", event_type: "visita_guiada" });
  const { sections } = buildDigestSections([event], REGION_A, WEEK);
  assert.equal(sections.find((s) => s.label === "Inauguraciones de jueves a domingo")?.events.length, 0);
  const visitas = sections.find((s) => s.label === "Visitas guiadas de jueves a domingo");
  assert.equal(visitas?.events.length, 1);
  assert.equal(visitas?.events[0].id, event.id);
  // Never leaks into "Expos para visitar" either, even though its own
  // date falls inside the week.
  assert.equal(sections.find((s) => s.label === "Expos para visitar de jueves a domingo")?.events.length, 0);
});

test("buildDigestSections: 'Visitas guiadas de jueves a domingo' is compact and always renders, even at zero — changed 2026-09-27 (Daniel: primary content is inauguraciones only, visitas guiadas demoted to a count instead of omitted or full cards)", () => {
  const event = makeEvent({ run_start_date: "2026-08-01", run_end_date: "2026-08-20" });
  const { sections } = buildDigestSections([event], REGION_A, WEEK);
  const visitas = sections.find((s) => s.label === "Visitas guiadas de jueves a domingo");
  assert.ok(visitas, "expected the section to still render at zero, not be omitted");
  assert.equal(visitas.compact, true);
  assert.equal(visitas.events.length, 0);
  assert.equal(visitas.emptyMessage, "Ninguna visita guiada programada de jueves a domingo.");
});

test("buildDigestSections: 'Expos para visitar de jueves a domingo' is compact — full count, no card cap, always a 'ver' link naming the región's TRUE total when there's at least one (changed 2026-09-27, demoted from primary full-card section)", () => {
  const events = [
    makeEvent(runningUntil("2026-08-20")),
    makeEvent(runningUntil("2026-08-10")),
    makeEvent(runningUntil("2026-09-01")),
    makeEvent(runningUntil("2026-08-12")),
  ];
  const { sections } = buildDigestSections(events, REGION_A, WEEK);
  const paraVisitar = sections.find((s) => s.label === "Expos para visitar de jueves a domingo");
  assert.ok(paraVisitar);
  assert.equal(paraVisitar.compact, true);
  assert.equal(paraVisitar.events.length, 4, "full count, no 10-card cap anymore — nothing is rendered as cards");
  assert.equal(paraVisitar.moreLink?.label, "Ver las 4 exposiciones en cartelera en Santiago");
  assert.equal(paraVisitar.moreLink?.url, "https://www.caldearte.com");
});

test("buildDigestSections: 'Expos para visitar de jueves a domingo' still diversified-by-comuna behavior is gone — full count now, no cap at all (2026-08-08 'ojalá de distintas comunas' request no longer applies, superseded 2026-09-27 by the section going compact)", () => {
  const events = [
    // Comuna A has 8 closing-soon events — a flat soonest-first cut would
    // fill the whole cap with just this one comuna.
    ...Array.from({ length: 8 }, (_, i) => makeEvent({ comunaName: "Comuna A", ...runningUntil(`2026-08-${10 + i}`) })),
    makeEvent({ comunaName: "Comuna B", ...runningUntil("2026-08-25") }),
    makeEvent({ comunaName: "Comuna C", ...runningUntil("2026-08-26") }),
    makeEvent({ comunaName: "Comuna D", ...runningUntil("2026-08-27") }),
  ];
  const { sections } = buildDigestSections(events, REGION_A, WEEK);
  const paraVisitar = sections.find((s) => s.label === "Expos para visitar de jueves a domingo");
  assert.ok(paraVisitar);
  assert.equal(paraVisitar.events.length, 11, "no cap anymore — the full pool, all 4 comunas' events counted");
  const comunas = new Set(paraVisitar.events.map((e) => e.comunaName));
  assert.equal(comunas.size, 4);
});

test("buildDigestSections: 'Expos para visitar de jueves a domingo' names the same number it counts in its moreLink (openings are left out — they have their own cards), while regionTotalThisWeek still counts both for the intro — 2026-10-18", () => {
  const events = [
    makeEvent({ opening_datetime: "2026-08-05T20:00:00.000Z" }), // +1 opening
    ...Array.from({ length: 14 }, (_, i) => makeEvent(runningUntil(`2026-08-${10 + i}`))), // 14 para-visitar
  ];
  const { sections, regionTotalThisWeek } = buildDigestSections(events, REGION_A, WEEK);
  assert.equal(regionTotalThisWeek, 15);
  const paraVisitar = sections.find((s) => s.label === "Expos para visitar de jueves a domingo");
  assert.ok(paraVisitar);
  assert.equal(paraVisitar.events.length, 14, "no cap — the full para-visitar pool, distinct from regionTotalThisWeek which also counts openings");
  assert.equal(paraVisitar.moreLink?.label, "Ver las 14 exposiciones en cartelera en Santiago");
  assert.equal(paraVisitar.moreLink?.url, "https://www.caldearte.com");
});

test("buildDigestSections: an event that closed before the week started is excluded entirely — a región with truly nothing anywhere yields zero sections", () => {
  const event = makeEvent({ run_start_date: "2026-07-01", run_end_date: "2026-07-20" });
  const { sections } = buildDigestSections([event], REGION_A, WEEK);
  assert.equal(sections.length, 0);
});

test("buildDigestSections: an exhibition with no known closing date that opened weeks ago is NOT counted as running — real bug found 2026-10-04: a missing run_end_date used to mean 'always running', so the nationwide count only ever grew (218 in the email vs ~105 on the site for the same week)", () => {
  const stale = makeEvent({ opening_datetime: "2026-07-02T19:00:00.000Z" });
  const staleElsewhere = makeEvent({ adminRegionName: REGION_B, opening_datetime: "2026-07-02T19:00:00.000Z" });
  const running = makeEvent({ adminRegionName: REGION_B, ...runningUntil("2026-08-20") });
  const { sections, regionTotalThisWeek } = buildDigestSections([stale, staleElsewhere, running], REGION_A, WEEK);
  assert.equal(regionTotalThisWeek, 0);
  assert.equal(sections.find((s) => s.label === "Expos para visitar de jueves a domingo")?.events.length, 0);
  const otras = sections.find((s) => s.label === "En otras regiones");
  assert.deepEqual(otras?.events.map((e) => e.id), [running.id]);
  assert.equal(otras?.moreLink?.label, "Y fuera de Santiago, 1 exposición más a lo largo de Chile");
});

test("buildDigestSections: an exhibition with no known closing date that opens THIS week still counts — a one-day event on its anchor date, same as the site's activeRange", () => {
  const event = makeEvent({ opening_datetime: "2026-08-05T20:00:00.000Z" });
  const { sections, regionTotalThisWeek } = buildDigestSections([event], REGION_A, WEEK);
  assert.equal(regionTotalThisWeek, 1);
  assert.equal(sections.find((s) => s.label === "Inauguraciones de jueves a domingo")?.events.length, 1);
});

test("buildDigestSections: an exhibition closing mid-week still counts as visitable this week — 'this week' is the whole Mon-Sun window, same as the site, not just its last day", () => {
  const event = makeEvent(runningUntil("2026-08-05")); // closes Wednesday of WEEK
  const { sections } = buildDigestSections([event], REGION_A, WEEK);
  assert.deepEqual(sections.find((s) => s.label === "Expos para visitar de jueves a domingo")?.events.map((e) => e.id), [event.id]);
});

test("buildDigestSections: the other-regions count leaves out visitas guiadas, same as the región's own count — they aren't exposiciones", () => {
  const events = [
    makeEvent({ adminRegionName: REGION_B, ...runningUntil("2026-08-20") }),
    makeEvent({ adminRegionName: REGION_B, ...runningUntil("2026-08-20") }),
    makeEvent({ adminRegionName: REGION_B, opening_datetime: "2026-08-06T15:00:00.000Z", event_type: "visita_guiada" }),
  ];
  const { sections } = buildDigestSections(events, REGION_A, WEEK);
  const otras = sections.find((s) => s.label === "En otras regiones");
  assert.equal(otras?.moreLink?.label, "Y fuera de Santiago, 2 exposiciones más a lo largo de Chile");
});

test("buildDigestSections: events in other regiones only appear in 'En otras regiones', which is compact since 2026-10-18 — every one counted, no cards, one link to the rest of Chile", () => {
  const events = Array.from({ length: 14 }, () => makeEvent({ adminRegionName: REGION_B, ...runningUntil("2026-08-20") }));
  const { sections } = buildDigestSections(events, REGION_A, WEEK);
  const otras = sections.find((s) => s.label === "En otras regiones");
  assert.ok(otras);
  assert.equal(otras.compact, true);
  assert.equal(otras.events.length, 14, "no 10-card sample anymore — the full count");
  assert.equal(otras.moreLink?.label, "Y fuera de Santiago, 14 exposiciones más a lo largo de Chile");
  assert.equal(otras.moreLink?.url, "https://www.caldearte.com");
  assert.equal(sections.find((s) => s.label === "Expos para visitar de jueves a domingo")?.events.length, 0);
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

// A table's first select() fails `failCount` times (e.g. simulating the
// real "JWT issued at future" transient Supabase error that crashed the
// 2026-09-27 newsletter run with no retry at all) before succeeding —
// mirrors social-publish/run.test.ts's own flakySupabase helper for the
// same real-world error.
function flakySupabase(failingTable: string, failCount: number) {
  let calls = 0;
  return {
    from(table: string) {
      const builder = {
        select: () => builder,
        eq: () => builder,
        is: () => builder,
        not: () => builder,
        then: (resolve: (v: { data: unknown[] | null; error: Error | null }) => void) => {
          if (table === failingTable && calls < failCount) {
            calls++;
            resolve({ data: null, error: new Error("JWT issued at future") });
            return;
          }
          resolve({ data: [], error: null });
        },
      };
      return builder;
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- test double, not the real typed client
  } as any;
}

test("run(): retries a transient Supabase read failure instead of crashing outright — real bug found 2026-09-27: the weekly newsletter cron hit this with no retry and silently skipped that week's send", async () => {
  const supabase = flakySupabase("regions", 2);
  // Doesn't throw and doesn't send anything (no subscribers in the fake
  // data) — the point here is only that the transient error is
  // absorbed by the retry loop instead of crashing the whole run.
  await run({
    supabase,
    now: new Date("2026-08-06T22:00:00.000Z"), // Thursday 18:00 Santiago
    sendDigestEmailFn: async () => {},
    generateDigestTextsFn: async () => ({ intro: null, days: {} }),
    generateOtherRegionsIntroFn: async () => null,
  });
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
        opening_datetime: "2026-08-08T20:00:00.000Z",
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
        now: new Date("2026-08-06T22:00:00.000Z"), // Thursday 18:00 Santiago
        sendDigestEmailFn: async (email) => {
          sentTo.push(email);
        },
        // Stubbed here so this test never hits the real Anthropic API —
        // the intro-generation behavior itself has its own dedicated test
        // below, plus intro.test.ts.
        generateDigestTextsFn: async () => ({ intro: null, days: {} }),
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
          opening_datetime: "2026-08-08T20:00:00.000Z",
        },
        {
          title: "Evento quitado por el admin",
          freeform_location: TEST_REGION,
          region_id: regionId,
          curation_status: "approved",
          source: "discovered",
          opening_datetime: "2026-08-07T20:00:00.000Z",
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
        now: new Date("2026-08-06T22:00:00.000Z"), // Thursday 18:00 Santiago
        sendDigestEmailFn: async (_email, _token, sections) => {
          sentTitles = sections.flatMap((s) => s.events.map((e) => e.title));
        },
        generateDigestTextsFn: async () => ({ intro: null, days: {} }),
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
        opening_datetime: "2026-08-08T20:00:00.000Z",
      });
      if (eventError) throw new Error(`Failed to seed test event: ${eventError.message}`);

      const { error: subscribersError } = await client.from("newsletter_subscribers").insert([
        { email: "sub1@example.com", admin_region_name: TEST_ADMIN_REGION, confirm_token: "tok-1", confirmed_at: new Date().toISOString() },
        { email: "sub2@example.com", admin_region_name: TEST_ADMIN_REGION, confirm_token: "tok-2", confirmed_at: new Date().toISOString() },
      ]);
      if (subscribersError) throw new Error(`Failed to seed test subscribers: ${subscribersError.message}`);

      let introCalls = 0;
      const introsUsed: Array<string | null> = [];
      await run({
        supabase: client,
        now: new Date("2026-08-06T22:00:00.000Z"), // Thursday 18:00 Santiago
        sendDigestEmailFn: async (_email, _token, _sections, intro) => {
          introsUsed.push(intro ?? null);
        },
        generateDigestTextsFn: async () => {
          introCalls++;
          return { intro: "Intro compartida para toda la región.", days: {} };
        },
      });

      assert.equal(introCalls, 1, "expected exactly one intro generation call for two subscribers in the same región");
      assert.deepEqual(introsUsed, ["Intro compartida para toda la región.", "Intro compartida para toda la región."]);
    } finally {
      await client.from("newsletter_subscribers").delete().eq("admin_region_name", TEST_ADMIN_REGION);
      await client.from("events").delete().eq("region_id", regionId);
      await client.from("regions").delete().eq("id", regionId);
    }
  },
);

test("editionBoundsInSantiago: a Thursday-morning send announces that Thursday to Sunday; a late send Fri-Sun keeps the edition under way — 2026-10-18", () => {
  const edition = { start: "2026-10-22", end: "2026-10-25" };
  assert.deepEqual(editionBoundsInSantiago(new Date("2026-10-22T11:00:00.000Z")), edition); // Thursday 08:00
  assert.deepEqual(editionBoundsInSantiago(new Date("2026-10-23T13:00:00.000Z")), edition); // Friday
  assert.deepEqual(editionBoundsInSantiago(new Date("2026-10-25T22:00:00.000Z")), edition); // Sunday
  assert.deepEqual(editionBoundsInSantiago(new Date("2026-10-19T13:00:00.000Z")), edition); // Monday
  assert.deepEqual(editionBoundsInSantiago(new Date("2026-10-26T13:00:00.000Z")), { start: "2026-10-29", end: "2026-11-01" }); // next Monday
  // 02:00 Thursday UTC is still Wednesday 23:00 in Santiago — same edition
  assert.deepEqual(editionBoundsInSantiago(new Date("2026-10-22T02:00:00.000Z")), edition);
});

test("run(): outside Thursday-Saturday it sends nothing and never touches Supabase — e.g. a watchdog catch-up on a Monday", async () => {
  let sent = 0;
  await run({
    now: new Date("2026-10-19T15:00:00.000Z"), // Monday
    sendDigestEmailFn: async () => {
      sent++;
    },
  });
  assert.equal(sent, 0);
});
