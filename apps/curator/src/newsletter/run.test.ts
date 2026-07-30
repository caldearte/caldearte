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
  const sections = buildDigestSections([event], REGION_A, WEEK);
  assert.equal(sections.length, 1);
  assert.equal(sections[0].label, "Inauguraciones de esta semana");
  assert.equal(sections[0].events.length, 1);
});

test("buildDigestSections: an event whose run actually STARTS this week (run_start_date) goes in 'Expos nuevas esta semana' — curation timing (created_at) is irrelevant", () => {
  const event = makeEvent({ created_at: "2026-06-01T00:00:00.000Z", run_start_date: "2026-08-04", opening_datetime: null });
  const sections = buildDigestSections([event], REGION_A, WEEK);
  assert.equal(sections.length, 1);
  assert.equal(sections[0].label, "Expos nuevas esta semana");
});

test("buildDigestSections: an event merely curated (created_at) this week but whose run started earlier does NOT count as 'new' — it's a plain visit reminder instead", () => {
  const event = makeEvent({ created_at: "2026-08-04T00:00:00.000Z", run_start_date: "2026-07-01", opening_datetime: null });
  const sections = buildDigestSections([event], REGION_A, WEEK);
  assert.equal(sections.length, 1);
  assert.equal(sections[0].label, "También puedes visitar");
});

test("buildDigestSections: an older, already-running event neither opening nor new this week goes in 'También puedes visitar', capped at 3, ending-soonest first", () => {
  const events = [
    makeEvent({ run_end_date: "2026-08-20" }),
    makeEvent({ run_end_date: "2026-08-10" }),
    makeEvent({ run_end_date: "2026-09-01" }),
    makeEvent({ run_end_date: "2026-08-12" }),
  ];
  const sections = buildDigestSections(events, REGION_A, WEEK);
  assert.equal(sections.length, 1);
  assert.equal(sections[0].label, "También puedes visitar");
  assert.equal(sections[0].events.length, 3);
  assert.deepEqual(
    sections[0].events.map((e) => e.runEndDate),
    ["2026-08-10", "2026-08-12", "2026-08-20"],
  );
});

test("buildDigestSections: an event that already closed before the week's end is excluded entirely", () => {
  const event = makeEvent({ run_end_date: "2026-07-20" });
  const sections = buildDigestSections([event], REGION_A, WEEK);
  assert.equal(sections.length, 0);
});

test("buildDigestSections: an event in a different región appears only in 'En otras regiones', capped at 3", () => {
  const events = [
    makeEvent({ adminRegionName: REGION_B }),
    makeEvent({ adminRegionName: REGION_B }),
    makeEvent({ adminRegionName: REGION_B }),
    makeEvent({ adminRegionName: REGION_B }),
  ];
  const sections = buildDigestSections(events, REGION_A, WEEK);
  assert.equal(sections.length, 1);
  assert.equal(sections[0].label, "En otras regiones");
  assert.equal(sections[0].events.length, 3);
});

test("buildDigestSections: an empty event pool yields zero sections (subscriber gets skipped, not an empty email)", () => {
  assert.deepEqual(buildDigestSections([], REGION_A, WEEK), []);
});

test("buildDigestSections: toDigestEvent carries comuna, image, and opening_time_confirmed through for the email builders", () => {
  const event = makeEvent({
    opening_datetime: "2026-08-05T20:00:00.000Z",
    opening_time_confirmed: false,
    comunaName: "Providencia",
    image_url: "https://example.com/img.jpg",
  });
  const sections = buildDigestSections([event], REGION_A, WEEK);
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
const TEST_ADMIN_REGION = "__test_admin_region__";

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
      });

      assert.deepEqual(sentTo, ["confirmado-con-eventos@example.com"]);
    } finally {
      await client.from("newsletter_subscribers").delete().eq("admin_region_name", TEST_ADMIN_REGION);
      await client.from("events").delete().eq("region_id", regionId);
      await client.from("regions").delete().eq("id", regionId);
    }
  },
);
