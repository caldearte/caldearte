import type { Pipeline } from "./pipeline.js";

// A source read on a given day, with how many items it returned. See the
// source_fetch_log migration for why the current fetch state isn't enough.
export interface SourceFetch {
  pipeline: Pipeline;
  sourceKey: string;
  location: string | null;
  itemsCount: number;
}

interface SourceFetchClient {
  from(table: "source_fetch_log"): {
    upsert(
      rows: Array<Record<string, unknown>>,
      options: { onConflict: string },
    ): PromiseLike<{ error: { message: string } | null }>;
  };
}

// A second run the same day keeps that run's count: the row says the source
// was read that day, not how much it published in total. A failure is logged
// and never fails the run, since this is a side channel for the research repo.
export async function recordSourceFetches(client: SourceFetchClient, fetches: SourceFetch[], now: Date): Promise<void> {
  if (fetches.length === 0) return;
  const fetchedOn = now.toISOString().slice(0, 10);
  const { error } = await client.from("source_fetch_log").upsert(
    fetches.map((f) => ({
      pipeline: f.pipeline,
      source_key: f.sourceKey,
      fetched_on: fetchedOn,
      location: f.location,
      items_count: f.itemsCount,
    })),
    { onConflict: "pipeline,source_key,fetched_on" },
  );
  if (error) {
    console.error(`[source-fetch-log] failed to record ${fetches.length} fetch(es): ${error.message}`);
  }
}
