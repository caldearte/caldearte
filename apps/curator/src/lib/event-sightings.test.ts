import { test } from "node:test";
import assert from "node:assert/strict";
import { recordEventSighting, type EventSighting } from "./event-sightings.js";

const NOW = new Date("2026-11-06T12:00:00.000Z");
const SIGHTING: EventSighting = {
  eventId: "6f1c6a35-5d7f-4d0c-9f5e-111111111111",
  sourceUrl: "https://www.instagram.com/p/DdRgrUzEWEK/",
  pipeline: "instagram",
  sourceAccount: "ccserhumano",
  stage: "duplicate_skipped",
};

function fakeClient(error: { message: string } | null = null) {
  const calls: Array<{ table: string; row: Record<string, unknown>; options: unknown }> = [];
  return {
    calls,
    from(table: "event_sightings") {
      return {
        async upsert(row: Record<string, unknown>, options: { onConflict: string; ignoreDuplicates: boolean }) {
          calls.push({ table, row, options });
          return { error };
        },
      };
    },
  };
}

test("recordEventSighting writes one row keyed by event and url, first sighting wins", async () => {
  const client = fakeClient();
  await recordEventSighting(client, SIGHTING, NOW);
  assert.equal(client.calls.length, 1);
  assert.equal(client.calls[0].table, "event_sightings");
  assert.deepEqual(client.calls[0].row, {
    event_id: SIGHTING.eventId,
    source_url: SIGHTING.sourceUrl,
    pipeline: "instagram",
    source_account: "ccserhumano",
    stage: "duplicate_skipped",
    first_seen_at: "2026-11-06T12:00:00.000Z",
  });
  assert.deepEqual(client.calls[0].options, { onConflict: "event_id,source_url", ignoreDuplicates: true });
});

test("recordEventSighting skips a candidate with no url", async () => {
  const client = fakeClient();
  await recordEventSighting(client, { ...SIGHTING, sourceUrl: null }, NOW);
  assert.equal(client.calls.length, 0);
});

test("recordEventSighting never fails the run when the write fails", async () => {
  await assert.doesNotReject(recordEventSighting(fakeClient({ message: "boom" }), SIGHTING, NOW));
});
