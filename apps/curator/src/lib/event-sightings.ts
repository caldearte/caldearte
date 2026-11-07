import type { Pipeline } from "./pipeline.js";

// Which sources reported which event, including the ones dedup dropped. See
// the event_sightings migration for why `events` alone can't answer that.
export type SightingStage = "inserted" | "replaced" | "duplicate_skipped" | "pre_curation_duplicate";

export interface EventSighting {
  eventId: string;
  sourceUrl: string | null;
  pipeline: Pipeline;
  sourceAccount: string | null;
  stage: SightingStage;
}

interface SightingsClient {
  from(table: "event_sightings"): {
    upsert(
      row: Record<string, unknown>,
      options: { onConflict: string; ignoreDuplicates: boolean },
    ): PromiseLike<{ error: { message: string } | null }>;
  };
}

// First sighting wins, so a source re-fetched every run stays one row. A
// failure is logged and never fails the run: this is a side channel for the
// research repo, not part of curation.
export async function recordEventSighting(client: SightingsClient, sighting: EventSighting, now: Date): Promise<void> {
  if (!sighting.sourceUrl) return;
  const { error } = await client.from("event_sightings").upsert(
    {
      event_id: sighting.eventId,
      source_url: sighting.sourceUrl,
      pipeline: sighting.pipeline,
      source_account: sighting.sourceAccount,
      stage: sighting.stage,
      first_seen_at: now.toISOString(),
    },
    { onConflict: "event_id,source_url", ignoreDuplicates: true },
  );
  if (error) {
    console.error(`[event-sightings] failed to record ${sighting.sourceUrl}: ${error.message}`);
  }
}
