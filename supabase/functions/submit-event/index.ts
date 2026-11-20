// "Agrega tu expo" — commits an already-curated form submission: uploads
// its images to the event-images bucket and inserts the events (+
// event_images) rows. Reached only from apps/web's
// /api/submit-event route, which does the actual curation (rate limit,
// field validation, the Haiku text call + axis5 vision call) BEFORE ever
// calling here — this function does no curation itself, it trusts the
// decision it's handed, gated by the same ADMIN_ACTIONS_SECRET shared
// secret every privileged Edge Function in this repo already uses (see
// admin-remove-event/admin-toggle-sensitive), the same "our own server,
// not the public internet" boundary. Deployed with --no-verify-jwt (this
// function never receives a Supabase JWT from its caller).
//
// Only ever called for an APPROVED submission — a rejected one is never
// persisted (mirrors that `events` never held rejected candidates either;
// see rejected_candidates, which this form deliberately doesn't use).
//
// Since 2026-11-20 it also replaces the same show already on the calendar
// from a scraper: the route finds those rows (packages/event-matching's
// findSubmissionMatches) and passes their ids as supersedesEventIds; after
// the insert succeeds, each one hands over the fields the form doesn't ask
// for and is soft-removed. The form's row wins — the venue's own word over
// a repost of it (Daniel, after "Rotten" was doubled 2026-11-12).
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ADMIN_ACTIONS_SECRET = Deno.env.get("ADMIN_ACTIONS_SECRET")!;

const BUCKET = "event-images";
const EXT_BY_MEDIA_TYPE: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

interface SubmittedImage {
  base64: string;
  mediaType: string;
}

interface SubmitEventBody {
  title?: string;
  description?: string | null;
  artist?: string | null;
  freeformLocation?: string;
  placeName?: string | null;
  regionId?: string | null;
  openingDatetime?: string;
  runEndDate?: string | null;
  sensitivityTags?: string[];
  curationReasoning?: string;
  publicMessage?: string;
  submitterEmail?: string;
  submitterName?: string | null;
  images?: SubmittedImage[];
  supersedesEventIds?: string[];
  // "pending_review" when the route couldn't run the image check
  // (2026-11-20): the row is kept, hidden from the calendar (events_public
  // only shows approved), for Daniel to look at. Omitted = "approved".
  curationStatus?: "approved" | "pending_review";
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// The route only passes strong matches; more than a handful would mean the
// matcher misfired, and then nothing is removed.
const MAX_SUPERSEDED = 5;

type Result = { status: "ok"; eventId: string; supersededIds: string[] } | { status: "unauthorized" | "invalid" | "error" };

function jsonResponse(result: Result, httpStatus = 200): Response {
  return new Response(JSON.stringify(result), { status: httpStatus, headers: { "content-type": "application/json" } });
}

Deno.serve(async (req) => {
  if (req.headers.get("x-admin-secret") !== ADMIN_ACTIONS_SECRET) {
    return jsonResponse({ status: "unauthorized" }, 401);
  }

  let body: SubmitEventBody;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ status: "invalid" }, 400);
  }

  const images = body.images ?? [];
  const supersedesEventIds = body.supersedesEventIds ?? [];
  const curationStatus = body.curationStatus ?? "approved";
  if (curationStatus !== "approved" && curationStatus !== "pending_review") {
    return jsonResponse({ status: "invalid" }, 400);
  }
  // A row nobody can see yet must not take a live one off the calendar.
  if (curationStatus === "pending_review" && supersedesEventIds.length > 0) {
    return jsonResponse({ status: "invalid" }, 400);
  }
  if (
    !Array.isArray(supersedesEventIds) ||
    supersedesEventIds.length > MAX_SUPERSEDED ||
    !supersedesEventIds.every((id) => typeof id === "string" && UUID.test(id))
  ) {
    return jsonResponse({ status: "invalid" }, 400);
  }
  if (
    !body.title?.trim() ||
    !body.freeformLocation?.trim() ||
    !body.openingDatetime ||
    !body.submitterEmail?.trim() ||
    images.length === 0 ||
    images.length > 3
  ) {
    return jsonResponse({ status: "invalid" }, 400);
  }

  const client = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  // Upload every image first — bail out before touching the events table
  // if any single one fails, so we never insert a row pointing at a
  // missing image_url.
  const uploadedPaths: string[] = [];
  const publicUrls: string[] = [];
  for (const image of images) {
    const ext = EXT_BY_MEDIA_TYPE[image.mediaType];
    if (!ext) {
      return jsonResponse({ status: "invalid" }, 400);
    }
    const path = `submitted/${crypto.randomUUID()}.${ext}`;
    const bytes = Uint8Array.from(atob(image.base64), (c) => c.charCodeAt(0));
    const { error: uploadError } = await client.storage.from(BUCKET).upload(path, bytes, {
      contentType: image.mediaType,
      upsert: false,
    });
    if (uploadError) {
      console.error("submit-event: image upload failed", uploadError);
      // Best-effort cleanup of whatever already made it up, then fail.
      if (uploadedPaths.length > 0) await client.storage.from(BUCKET).remove(uploadedPaths);
      return jsonResponse({ status: "error" }, 500);
    }
    uploadedPaths.push(path);
    publicUrls.push(client.storage.from(BUCKET).getPublicUrl(path).data.publicUrl);
  }

  const { data: inserted, error: insertError } = await client
    .from("events")
    .insert({
      title: body.title.trim(),
      description: body.description?.trim() || null,
      artist: body.artist?.trim() || null,
      freeform_location: body.freeformLocation.trim(),
      place_name: body.placeName?.trim() || null,
      region_id: body.regionId || null,
      opening_datetime: body.openingDatetime,
      opening_time_confirmed: true,
      run_end_date: body.runEndDate || null,
      event_type: "inauguracion",
      sensitivity_tags: body.sensitivityTags ?? [],
      source: "submitted",
      pipeline: "user_submission",
      image_url: publicUrls[0],
      curation_status: curationStatus,
      curation_reasoning: body.curationReasoning ?? null,
      public_explanation: body.publicMessage ?? null,
      submitter_email: body.submitterEmail.trim(),
      submitter_name: body.submitterName?.trim() || null,
    })
    .select("id")
    .single();

  if (insertError || !inserted) {
    console.error("submit-event: events insert failed", insertError);
    await client.storage.from(BUCKET).remove(uploadedPaths);
    return jsonResponse({ status: "error" }, 500);
  }

  if (publicUrls.length > 1) {
    const extraImages = uploadedPaths.slice(1).map((storagePath, i) => ({
      event_id: inserted.id,
      storage_path: storagePath,
      position: i + 2,
    }));
    const { error: imagesError } = await client.from("event_images").insert(extraImages);
    // Non-fatal — the event itself is already live with its primary
    // image; the 2nd/3rd images just aren't stored, worth a log line to
    // notice if it ever happens.
    if (imagesError) console.error("submit-event: event_images insert failed", imagesError);
  }

  const supersededIds = await supersedeExisting(client, inserted.id, supersedesEventIds);

  return jsonResponse({ status: "ok", eventId: inserted.id, supersededIds });
});

// Fields the form doesn't collect but a scraped row may know. Copied only
// where the new row has nothing, never over what the gallery itself wrote.
// Not venue_id (the scraped row's venue can be wrong — "Rotten"'s was its
// street address; the catalog sync links the new row itself) nor
// run_start_date (often backfilled from the post's own date, while the
// form's opening already is the start).
const CARRIED_OVER = ["address", "medium_type", "artist_instagram_handle"] as const;

// Best-effort, row by row: the submission is already live, so a failure here
// leaves a duplicate (today's behavior), never a missing event. Only rows
// still live and approved are touched, and never another submission's
// row — two forms for the same show are for a person to sort out.
async function supersedeExisting(
  client: SupabaseClient,
  newEventId: string,
  ids: string[],
): Promise<string[]> {
  const superseded: string[] = [];
  for (const id of ids) {
    const { data: old, error: lookupError } = await client
      .from("events")
      .select(`id, source, curation_status, removed_at, ${CARRIED_OVER.join(", ")}`)
      .eq("id", id)
      .maybeSingle();
    if (lookupError || !old) {
      console.error("submit-event: superseded row lookup failed", id, lookupError);
      continue;
    }
    const row = old as unknown as Record<string, unknown>;
    if (row.removed_at || row.curation_status !== "approved" || row.source === "submitted") continue;

    const carried: Record<string, unknown> = {};
    for (const field of CARRIED_OVER) {
      if (row[field] !== null && row[field] !== undefined) carried[field] = row[field];
    }
    if (Object.keys(carried).length > 0) {
      const { data: current } = await client.from("events").select(CARRIED_OVER.join(", ")).eq("id", newEventId).maybeSingle();
      const currentRow = (current ?? {}) as unknown as Record<string, unknown>;
      const missing = Object.fromEntries(Object.entries(carried).filter(([field]) => currentRow[field] === null || currentRow[field] === undefined));
      if (Object.keys(missing).length > 0) {
        const { error: carryError } = await client.from("events").update(missing).eq("id", newEventId);
        if (carryError) console.error("submit-event: carry-over failed", id, carryError);
      }
    }

    const { error: removeError } = await client
      .from("events")
      .update({ removed_at: new Date().toISOString(), removed_reason: `duplicate: superseded by user submission ${newEventId}` })
      .eq("id", id)
      .is("removed_at", null);
    if (removeError) {
      console.error("submit-event: superseding failed", id, removeError);
      continue;
    }
    superseded.push(id);
  }
  return superseded;
}
