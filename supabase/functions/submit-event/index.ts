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
// see rejected_candidates, which this form deliberately doesn't use — a
// one-off self-reported submission has no future scraped candidate to
// dedupe against).
import { createClient } from "npm:@supabase/supabase-js@2";

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
}

type Result = { status: "ok"; eventId: string } | { status: "unauthorized" | "invalid" | "error" };

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
      curation_status: "approved",
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

  return jsonResponse({ status: "ok", eventId: inserted.id });
});
