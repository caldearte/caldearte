import { test } from "node:test";
import assert from "node:assert/strict";
import { computeAudienceSignals, followersSignal, subscribersSignal, submissionsSignal, SIGNAL_SERIES_DAYS } from "./audienceSignals";

const NOW = new Date("2026-09-14T12:00:00.000Z");

test("followersSignal: value is the latest snapshot, delta compares against the snapshot in force 30 days ago, series is a step line over 90 days", () => {
  const s = followersSignal(
    [
      { snapshotDate: "2026-09-09", followersCount: 85 },
      { snapshotDate: "2026-08-10", followersCount: 40 },
      { snapshotDate: "2026-08-20", followersCount: 55 },
    ],
    NOW,
  );
  assert.equal(s.value, 85);
  // 30 days before 09-14 is 08-15; the snapshot in force then is 08-10 (40).
  assert.equal(s.delta30d, 45);
  assert.equal(s.series.length, SIGNAL_SERIES_DAYS - (new Date("2026-08-10").getTime() - new Date("2026-06-17").getTime()) / 86400000);
  assert.equal(s.series[0].date, "2026-08-10");
  assert.equal(s.series[s.series.length - 1].value, 85);
});

test("followersSignal: no snapshot old enough → no delta, never a fake +N", () => {
  const s = followersSignal([{ snapshotDate: "2026-09-01", followersCount: 64 }], NOW);
  assert.equal(s.value, 64);
  assert.equal(s.delta30d, null);
  assert.deepEqual(s.sinceStart, { delta: 0, date: "2026-09-01" });
});

test("subscribersSignal: only confirmed count, unsubscribes subtract, and the delta is the net change over 30 days", () => {
  const s = subscribersSignal(
    [
      { createdAt: "2026-06-01T00:00:00Z", confirmedAt: "2026-06-01T01:00:00Z", unsubscribedAt: null }, // before the 90-day window
      { createdAt: "2026-07-05T00:00:00Z", confirmedAt: null, unsubscribedAt: null }, // never confirmed
      { createdAt: "2026-08-20T00:00:00Z", confirmedAt: "2026-08-20T00:10:00Z", unsubscribedAt: null },
      { createdAt: "2026-08-25T00:00:00Z", confirmedAt: "2026-08-25T00:10:00Z", unsubscribedAt: "2026-09-10T00:00:00Z" },
    ],
    NOW,
  );
  assert.equal(s.value, 2);
  // As of 08-15 there was 1 confirmed subscriber; now 2 → +1 (the 08-25 one came and left).
  assert.equal(s.delta30d, 1);
  assert.equal(s.series.length, SIGNAL_SERIES_DAYS);
  assert.equal(s.series[0].value, 1, "the running total starts from full history, not from the window's first day");
});

test("submissionsSignal: removed submissions still count; a series younger than 30 days has no 30-day delta but reports growth since its first point", () => {
  const s = submissionsSignal([{ createdAt: "2026-09-10T00:00:00Z" }, { createdAt: "2026-09-12T00:00:00Z" }], NOW);
  assert.equal(s.value, 2);
  assert.equal(s.delta30d, null);
  assert.deepEqual(s.sinceStart, { delta: 2, date: "2026-09-10" });
});

test("followersSignal: a series younger than 30 days reports growth since its first snapshot (today's real state: first snapshot 2026-08-24)", () => {
  const s = followersSignal([{ snapshotDate: "2026-08-24", followersCount: 31 }, { snapshotDate: "2026-09-09", followersCount: 85 }], NOW);
  assert.equal(s.delta30d, null);
  assert.deepEqual(s.sinceStart, { delta: 54, date: "2026-08-24" });
});

test("submissionsSignal / subscribersSignal: empty input is 0 with no delta (today's real state for submissions)", () => {
  assert.deepEqual(submissionsSignal([], NOW).value, 0);
  assert.equal(submissionsSignal([], NOW).delta30d, null);
  assert.equal(submissionsSignal([], NOW).sinceStart, null);
  assert.equal(subscribersSignal([], NOW).value, 0);
});

test("computeAudienceSignals tolerates a payload from an older Edge Function (fields missing)", () => {
  const all = computeAudienceSignals({ instagramAccountSnapshots: [] }, NOW);
  assert.equal(all.followers.value, null);
  assert.equal(all.subscribers.value, 0);
  assert.equal(all.submissions.value, 0);
});
