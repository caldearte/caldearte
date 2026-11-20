import { test } from "node:test";
import assert from "node:assert/strict";
import { recordSourceFetches, type SourceFetch } from "./source-fetch-log.js";

const NOW = new Date("2026-11-06T08:17:00.000Z");
const FETCH: SourceFetch = { pipeline: "instagram", sourceKey: "ccserhumano", location: "Valdivia", itemsCount: 0 };

function fakeClient(error: { message: string } | null = null) {
  const calls: Array<{ table: string; rows: Array<Record<string, unknown>>; options: unknown }> = [];
  return {
    calls,
    from(table: "source_fetch_log") {
      return {
        async upsert(rows: Array<Record<string, unknown>>, options: { onConflict: string }) {
          calls.push({ table, rows, options });
          return { error };
        },
      };
    },
  };
}

test("recordSourceFetches keeps a source read with zero items: it was still read", async () => {
  const client = fakeClient();
  await recordSourceFetches(client, [FETCH], NOW);
  assert.equal(client.calls[0].table, "source_fetch_log");
  assert.deepEqual(client.calls[0].rows, [
    { pipeline: "instagram", source_key: "ccserhumano", fetched_on: "2026-11-06", location: "Valdivia", items_count: 0 },
  ]);
  assert.deepEqual(client.calls[0].options, { onConflict: "pipeline,source_key,fetched_on" });
});

test("recordSourceFetches writes nothing for an empty run", async () => {
  const client = fakeClient();
  await recordSourceFetches(client, [], NOW);
  assert.equal(client.calls.length, 0);
});

test("recordSourceFetches never fails the run when the write fails", async () => {
  await assert.doesNotReject(recordSourceFetches(fakeClient({ message: "boom" }), [FETCH], NOW));
});
