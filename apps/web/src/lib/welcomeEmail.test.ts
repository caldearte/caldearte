import { test } from "node:test";
import assert from "node:assert/strict";
import type { EventRecord, RegionMeta } from "./events";
import { buildWelcomeEmail, nextEditionLabel, selectWelcomeOpenings, welcomeRecipientFrom } from "./welcomeEmail";

const RM = "Región Metropolitana de Santiago";

function region(name: string, adminRegionName: string): RegionMeta {
  return { id: name, name, country: "Chile", adminRegionName, adminRegionOrder: null, adminRegionNumeral: null, lat: null, lng: null };
}

const REGIONS = [region("Ñuñoa", RM), region("Providencia", RM), region("Valparaíso", "Valparaíso")];

function event(overrides: Partial<EventRecord>): EventRecord {
  return {
    id: "e1",
    title: "Muestra de prueba",
    artist: null,
    description: null,
    freeformLocation: "Galería de prueba, Ñuñoa",
    placeName: "Galería de prueba",
    address: null,
    regionName: "Ñuñoa",
    imageUrl: null,
    openingDatetime: "2026-10-22T22:00:00+00:00", // Thu 22 Oct, 19:00 Santiago
    runStartDate: null,
    runEndDate: null,
    sensitivityTags: [],
    sourceUrl: null,
    openingTimeConfirmed: true,
    eventType: "inauguracion",
    ...overrides,
  };
}

const SUNDAY = "2026-10-18";

test("selectWelcomeOpenings: the región's inauguraciones of the next 7 days, soonest first", () => {
  const events = [
    event({ id: "later", openingDatetime: "2026-10-24T21:00:00+00:00" }),
    event({ id: "sooner", regionName: "Providencia", openingDatetime: "2026-10-20T22:00:00+00:00" }),
    event({ id: "other-region", regionName: "Valparaíso", freeformLocation: "Sala, Valparaíso" }),
    event({ id: "expo", eventType: "exposicion" }),
    event({ id: "visita", eventType: "visita_guiada" }),
    event({ id: "no-date", openingDatetime: null }),
    event({ id: "past", openingDatetime: "2026-10-17T22:00:00+00:00" }),
    event({ id: "too-far", openingDatetime: "2026-10-25T22:00:00+00:00" }),
  ];
  assert.deepEqual(
    selectWelcomeOpenings(events, REGIONS, RM, SUNDAY).map((e) => e.id),
    ["sooner", "later"],
  );
});

test("selectWelcomeOpenings: uses the Santiago calendar date, not UTC's", () => {
  // 23:30 Saturday 24 Oct in Santiago is already Sunday 25 in UTC — still in a
  // window ending Saturday 24.
  const lateSaturday = event({ id: "late", openingDatetime: "2026-10-25T02:30:00+00:00" });
  assert.deepEqual(selectWelcomeOpenings([lateSaturday], REGIONS, RM, SUNDAY).map((e) => e.id), ["late"]);
});

test("selectWelcomeOpenings: caps at 6", () => {
  const events = Array.from({ length: 9 }, (_, i) => event({ id: `e${i}`, openingDatetime: `2026-10-2${i % 5}T22:00:00+00:00` }));
  assert.equal(selectWelcomeOpenings(events, REGIONS, RM, SUNDAY).length, 6);
});

test("nextEditionLabel: the next Thursday, never today", () => {
  assert.equal(nextEditionLabel("2026-10-18"), "jueves 22 de octubre"); // Sunday
  assert.equal(nextEditionLabel("2026-10-21"), "jueves 22 de octubre"); // Wednesday
  assert.equal(nextEditionLabel("2026-10-22"), "jueves 29 de octubre"); // Thursday
  assert.equal(nextEditionLabel("2026-10-30"), "jueves 5 de noviembre"); // Friday, month change
});

test("welcomeRecipientFrom: only a first-time confirm with email and región", () => {
  const confirmed = { status: "confirmed", email: "persona@example.com", adminRegionName: RM };
  assert.deepEqual(welcomeRecipientFrom("tok", confirmed), { email: "persona@example.com", adminRegionName: RM, token: "tok" });
  assert.equal(welcomeRecipientFrom("tok", { ...confirmed, status: "already_confirmed" }), null);
  assert.equal(welcomeRecipientFrom("tok", { ...confirmed, status: "unsubscribed" }), null);
  assert.equal(welcomeRecipientFrom("tok", { ...confirmed, status: "invalid" }), null);
  assert.equal(welcomeRecipientFrom("tok", { status: "confirmed" }), null); // function not yet redeployed
  assert.equal(welcomeRecipientFrom(undefined, confirmed), null);
});

test("buildWelcomeEmail: says what arrives and when, lists the openings, links unsubscribe", () => {
  const mail = buildWelcomeEmail({ adminRegionName: RM, unsubscribeToken: "abc123", openings: [event({})], todayStr: SUNDAY });
  const promise = "Cada jueves en la mañana te llegarán las inauguraciones de jueves a domingo en Santiago. El primer boletín llega el jueves 22 de octubre.";
  assert.ok(mail.text.includes(promise));
  assert.ok(mail.html.includes(promise));
  assert.ok(mail.text.includes("Muestra de prueba — Galería de prueba — ÑUÑOA · JUE 22 OCT · 19 HR"));
  assert.ok(mail.text.split("\n").includes("  https://www.caldearte.com/eventos/e1"));
  assert.ok(mail.html.includes("ÑUÑOA · JUE 22 OCT · 19 HR"));
  assert.equal(mail.unsubscribeUrl, "https://www.caldearte.com/newsletter/baja?token=abc123");
  assert.ok(mail.text.includes("Darse de baja: https://www.caldearte.com/newsletter/baja?token=abc123"));
  assert.ok(mail.html.includes('href="https://www.caldearte.com/newsletter/baja?token=abc123"'));
  assert.ok(mail.html.includes("#ff00fb") && mail.html.includes("EL ARTE MÁS CERCA"));
});

test("buildWelcomeEmail: no openings → says so, no empty list", () => {
  const mail = buildWelcomeEmail({ adminRegionName: "Valparaíso", unsubscribeToken: "t", openings: [], todayStr: SUNDAY });
  assert.ok(mail.text.includes("Esta semana aún no tenemos inauguraciones en Valparaíso"));
  assert.ok(mail.text.includes("Ver la cartelera: https://www.caldearte.com"));
  assert.ok(!mail.html.includes("<table"));
});

test("buildWelcomeEmail: escapes event fields, never echoes an unknown región", () => {
  const nasty = event({ title: "<script>alert(1)</script>", placeName: '"><img src=x onerror=alert(1)>', imageUrl: 'https://x.test/a.jpg" onerror="alert(1)' });
  const mail = buildWelcomeEmail({ adminRegionName: "<b>Atlántida</b>", unsubscribeToken: 'a"b<c', openings: [nasty], todayStr: SUNDAY });
  assert.ok(!mail.html.includes("<script>"));
  assert.ok(!mail.html.includes("<img src=x"));
  assert.ok(!mail.html.includes('a.jpg" onerror'));
  assert.ok(!mail.html.includes("Atlántida") && !mail.text.includes("Atlántida"));
  assert.ok(mail.text.includes("en tu región"));
  assert.ok(mail.unsubscribeUrl.endsWith("token=a%22b%3Cc"));
});
