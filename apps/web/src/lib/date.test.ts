import { test } from "node:test";
import assert from "node:assert/strict";
import {
  fmtShort,
  fmtPeriod,
  fmtOpeningHour,
  anchorDateOnly,
  activeRange,
  rangesOverlap,
  isActiveOn,
  isCurrentOrUpcoming,
  dateOnlyFromIso,
  weekBoundsInSantiago,
  fmtWeekHeader,
  fmtWeekRange,
  fmtInauguracionDate,
  buildGoogleCalendarUrl,
  addWeeks,
  weekNumberSince,
  fmtUntilDate,
  isClosingSoon,
} from "./date";

test("fmtShort formats a short date", () => {
  assert.equal(fmtShort("2026-07-11"), "11 jul");
});

test("dateOnlyFromIso extracts the date from a full timestamptz", () => {
  assert.equal(dateOnlyFromIso("2026-07-11T22:00:00+00:00"), "2026-07-11");
  assert.equal(dateOnlyFromIso("2026-07-11"), "2026-07-11");
});

test("anchorDateOnly prefers opening_datetime, then run_start_date, then run_end_date", () => {
  assert.equal(
    anchorDateOnly({ openingDatetime: "2026-07-11T22:00:00+00:00", runStartDate: "2026-07-01", runEndDate: "2026-08-01" }),
    "2026-07-11",
  );
  assert.equal(anchorDateOnly({ openingDatetime: null, runStartDate: "2026-07-01", runEndDate: "2026-08-01" }), "2026-07-01");
  assert.equal(anchorDateOnly({ openingDatetime: null, runStartDate: null, runEndDate: "2026-08-01" }), "2026-08-01");
  assert.equal(anchorDateOnly({ openingDatetime: null, runStartDate: null, runEndDate: null }), null);
});

test("activeRange spans run_start_date to run_end_date when both present", () => {
  assert.deepEqual(
    activeRange({ openingDatetime: null, runStartDate: "2026-07-05", runEndDate: "2026-09-30" }),
    { start: "2026-07-05", end: "2026-09-30" },
  );
});

test("activeRange collapses to a single day when there's only an anchor", () => {
  assert.deepEqual(
    activeRange({ openingDatetime: "2026-07-11T22:00:00+00:00", runStartDate: null, runEndDate: null }),
    { start: "2026-07-11", end: "2026-07-11" },
  );
});

test("rangesOverlap", () => {
  assert.equal(rangesOverlap("2026-07-01", "2026-07-10", "2026-07-10", "2026-07-20"), true);
  assert.equal(rangesOverlap("2026-07-01", "2026-07-10", "2026-07-11", "2026-07-20"), false);
});

test("isActiveOn: true when the date falls within the event's run", () => {
  const event = { openingDatetime: null, runStartDate: "2026-07-05", runEndDate: "2026-07-20" };
  assert.equal(isActiveOn(event, "2026-07-11"), true);
  assert.equal(isActiveOn(event, "2026-07-04"), false);
  assert.equal(isActiveOn(event, "2026-07-21"), false);
});

test("isActiveOn: false for an event with no resolvable anchor at all", () => {
  assert.equal(isActiveOn({ openingDatetime: null, runStartDate: null, runEndDate: null }, "2026-07-11"), false);
});

test("fmtPeriod: same-month run", () => {
  assert.equal(fmtPeriod("2026-07-12", "2026-07-28", "2026-07-12", "2026-07-01"), "12 al 28 de julio");
});

test("fmtPeriod: cross-month run", () => {
  assert.equal(fmtPeriod("2026-07-28", "2026-08-03", "2026-07-28", "2026-07-01"), "28 de julio al 3 de agosto");
});

test("fmtPeriod: single day (no run, just an anchor)", () => {
  assert.equal(fmtPeriod(null, null, "2026-07-11", "2026-07-01"), "11 de julio");
});

test("fmtPeriod: appends a 2-digit year to whichever side falls outside today's calendar year", () => {
  // Multi-year run, both ends outside today's year — real bug, found
  // 2026-08-06: "Roberto Matta. Abrir la mirada" (10 jul 2025 – 31 jul
  // 2027) rendered as just "10 al 31 de julio" on its own event page.
  assert.equal(fmtPeriod("2025-07-10", "2027-07-31", "2025-07-10", "2026-08-06"), "10 de julio '25 al 31 de julio '27");
  // Same-year run, but not today's year — suffix printed once, at the end.
  assert.equal(fmtPeriod("2027-07-12", "2027-07-28", "2027-07-12", "2026-08-06"), "12 al 28 de julio '27");
  // Cross-month, end year differs from today's — only the end gets a suffix.
  assert.equal(fmtPeriod("2026-12-28", "2027-01-03", "2026-12-28", "2026-08-06"), "28 de diciembre al 3 de enero '27");
  // Single day, outside today's year.
  assert.equal(fmtPeriod(null, null, "2027-07-11", "2026-08-06"), "11 de julio '27");
  // Today's own year never gets a suffix.
  assert.equal(fmtPeriod("2026-07-12", "2026-07-28", "2026-07-12", "2026-08-06"), "12 al 28 de julio");
});

test("fmtInauguracionDate: always the single opening day, ignoring any run range", () => {
  assert.equal(fmtInauguracionDate("2026-07-11T23:00:00.000Z", "2026-07-01"), "11 de julio");
});

test("fmtInauguracionDate: appends a 2-digit year when the opening isn't in today's calendar year", () => {
  assert.equal(fmtInauguracionDate("2027-07-11T23:00:00.000Z", "2026-08-06"), "11 de julio '27");
});

test("fmtOpeningHour: whole hour", () => {
  // 23:00 UTC = 19:00 in Chile (winter, UTC-4, no DST in July).
  assert.equal(fmtOpeningHour("2026-07-11T23:00:00.000Z"), "19 hr");
});

test("fmtOpeningHour: non-zero minutes", () => {
  assert.equal(fmtOpeningHour("2026-07-11T23:30:00.000Z"), "19:30 hr");
});

test("buildGoogleCalendarUrl: confirmed hour produces a timed event 2h apart", () => {
  const url = buildGoogleCalendarUrl({
    title: "Dejar Atrás",
    openingDatetime: "2026-07-15T23:00:00.000Z",
    openingTimeConfirmed: true,
    description: "Joaquín Reyes",
    sourceUrl: "https://example.com/dejar-atras",
    venueLine: "Isabel Croxatto Galería — Providencia",
  });
  const params = new URL(url).searchParams;
  assert.equal(params.get("dates"), "20260715T230000Z/20260716T010000Z");
  assert.equal(params.get("text"), "Dejar Atrás");
  assert.equal(params.get("location"), "Isabel Croxatto Galería — Providencia");
  assert.equal(params.get("details"), "Joaquín Reyes\n\nhttps://example.com/dejar-atras");
  assert.equal(params.get("action"), "TEMPLATE");
});

test("buildGoogleCalendarUrl: unconfirmed hour produces an all-day event, no time component", () => {
  const url = buildGoogleCalendarUrl({
    title: "Sín-tesis",
    openingDatetime: "2026-07-14T04:00:00.000Z",
    openingTimeConfirmed: false,
    description: null,
    sourceUrl: null,
    venueLine: "Galería NAC",
  });
  const params = new URL(url).searchParams;
  assert.equal(params.get("dates"), "20260714/20260715");
  assert.equal(params.get("details"), "");
});

test("isCurrentOrUpcoming: a run that ended last month is stale", () => {
  assert.equal(
    isCurrentOrUpcoming({ openingDatetime: null, runStartDate: "2026-05-01", runEndDate: "2026-06-15" }, "2026-07-11"),
    false,
  );
});

test("isCurrentOrUpcoming: a run still ending this month or later is current", () => {
  assert.equal(
    isCurrentOrUpcoming({ openingDatetime: null, runStartDate: "2026-06-01", runEndDate: "2026-07-05" }, "2026-07-11"),
    true,
  );
  assert.equal(
    isCurrentOrUpcoming({ openingDatetime: "2026-08-01T22:00:00+00:00", runStartDate: null, runEndDate: null }, "2026-07-11"),
    true,
  );
});

test("weekBoundsInSantiago: a mid-week date (Saturday) resolves to that week's Monday-Sunday", () => {
  assert.deepEqual(weekBoundsInSantiago("2026-07-11"), { start: "2026-07-06", end: "2026-07-12" });
});

test("weekBoundsInSantiago: the Monday itself is already the start of its own window", () => {
  assert.deepEqual(weekBoundsInSantiago("2026-07-06"), { start: "2026-07-06", end: "2026-07-12" });
});

test("weekBoundsInSantiago: the Sunday itself is the END of its own window, not the start of the next", () => {
  assert.deepEqual(weekBoundsInSantiago("2026-07-12"), { start: "2026-07-06", end: "2026-07-12" });
});

test("fmtWeekHeader: same-month week", () => {
  assert.equal(fmtWeekHeader("2026-07-13", "2026-07-19"), "13 al 19 de JULIO");
});

test("fmtWeekHeader: week spanning a month boundary", () => {
  assert.equal(fmtWeekHeader("2026-07-27", "2026-08-02"), "27 de JULIO al 2 de AGOSTO");
});

test("fmtWeekRange: same-month week — full month name once, zero-padded days", () => {
  assert.equal(fmtWeekRange("2026-08-03", "2026-08-09"), "03 al 09 de AGOSTO");
});

test("fmtWeekRange: cross-month week — abbreviated month on both sides, only the end date gets 'de'", () => {
  assert.equal(fmtWeekRange("2026-07-27", "2026-08-02"), "27 JUL al 02 de AGO");
});

test("addWeeks: shifts a Monday forward and backward by whole weeks", () => {
  assert.equal(addWeeks("2026-07-27", 1), "2026-08-03");
  assert.equal(addWeeks("2026-07-27", -1), "2026-07-20");
  assert.equal(addWeeks("2026-07-27", 0), "2026-07-27");
});

test("addWeeks: crosses a year boundary", () => {
  assert.equal(addWeeks("2026-12-28", 1), "2027-01-04");
});

test("weekNumberSince: the epoch week itself is N°1", () => {
  assert.equal(weekNumberSince("2026-07-27"), 1);
});

test("weekNumberSince: counts sequential weeks after the epoch", () => {
  assert.equal(weekNumberSince("2026-08-03"), 2);
  assert.equal(weekNumberSince("2026-08-10"), 3);
});

test("weekNumberSince: clamps to 1 for any week before the epoch", () => {
  assert.equal(weekNumberSince("2026-07-20"), 1);
  assert.equal(weekNumberSince("2020-01-06"), 1);
});

test("fmtUntilDate: capitalized month, falls back to the anchor when there's no runEndDate", () => {
  assert.equal(fmtUntilDate("2026-09-02", "2026-07-01", "2026-08-01"), "Hasta el 2 de Septiembre");
  assert.equal(fmtUntilDate(null, "2026-08-15", "2026-08-01"), "Hasta el 15 de Agosto");
});

test("fmtUntilDate: appends a 2-digit year only when the end date is in a later calendar year than today", () => {
  assert.equal(fmtUntilDate("2027-02-28", "2026-07-01", "2026-08-01"), "Hasta el 28 de Febrero '27");
  assert.equal(fmtUntilDate("2026-12-31", "2026-07-01", "2026-08-01"), "Hasta el 31 de Diciembre");
});

// 2026-08-03 is a Monday; that week runs through Sunday 2026-08-09.
test("isClosingSoon: ends within the current calendar week (inclusive)", () => {
  assert.equal(isClosingSoon("2026-08-09", "2026-08-03"), true);
  assert.equal(isClosingSoon("2026-08-03", "2026-08-03"), true);
});

test("isClosingSoon: ends next week, or already past, is not closing soon", () => {
  assert.equal(isClosingSoon("2026-08-10", "2026-08-03"), false);
  assert.equal(isClosingSoon("2026-08-01", "2026-08-03"), false);
});

test("isClosingSoon: no runEndDate at all is never closing soon", () => {
  assert.equal(isClosingSoon(null, "2026-08-03"), false);
});

// Regardless of which day of the week "today" is, the boundary is always
// this Sunday — not a rolling N-day window from today.
test("isClosingSoon: boundary stays the same calendar week end from any day within it", () => {
  assert.equal(isClosingSoon("2026-08-09", "2026-08-07"), true);
  assert.equal(isClosingSoon("2026-08-09", "2026-08-09"), true);
});
