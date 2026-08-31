import { NextResponse } from "next/server";
import { clientIp, isWithinRateLimit } from "@/lib/rate-limit";
import { curateSubmissionText, curateSubmissionImage, type SubmissionInput } from "@/lib/curate-submission";
import { parseLocalDatetimeToUtcIso } from "@/lib/santiagoTime";

// 3 Haiku consultations/hour/IP, per Daniel — tight enough to bound cost
// (each submission spends 1-2 Haiku calls: text + optionally vision), a
// real visitor only ever submits their own gallery's few expos anyway.
// Cross-browser by construction: keyed on server-side IP (same
// clientIp()/check_rate_limit as /api/contact and
// /api/newsletter/subscribe), not a client-clearable cookie.
const RATE_LIMIT_MAX = 3;
const RATE_LIMIT_WINDOW_SECONDS = 3600;

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ALLOWED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_IMAGE_BYTES = 4 * 1024 * 1024; // client already compresses to ~1600px/JPEG-80; this is a server-side ceiling, not the target size

async function fileToBase64(file: File): Promise<string> {
  const buffer = Buffer.from(await file.arrayBuffer());
  return buffer.toString("base64");
}

function retryAfterMessage(): string {
  return "Ya enviaste el máximo de 3 intentos por hora. Puedes volver a intentarlo en una hora.";
}

export async function POST(request: Request) {
  const ip = clientIp(request);
  const allowed = await isWithinRateLimit(`submit-event:${ip}`, RATE_LIMIT_MAX, RATE_LIMIT_WINDOW_SECONDS);
  if (!allowed) {
    return NextResponse.json({ status: "rate_limited", message: retryAfterMessage() }, { status: 429 });
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ status: "invalid" }, { status: 400 });
  }

  // Honeypot — a real visitor never fills this hidden field, same
  // no-CAPTCHA posture as every other public form in this app.
  if ((form.get("website") as string | null)?.trim()) {
    return NextResponse.json({ status: "invalid" }, { status: 400 });
  }

  const title = (form.get("title") as string | null)?.trim() ?? "";
  const description = (form.get("description") as string | null)?.trim() ?? "";
  const artist = (form.get("artist") as string | null)?.trim() ?? "";
  const galleryName = (form.get("galleryName") as string | null)?.trim() ?? "";
  const comunaName = (form.get("comunaName") as string | null)?.trim() ?? "";
  const regionId = (form.get("regionId") as string | null)?.trim() || null;
  const openingDatetime = (form.get("openingDatetime") as string | null)?.trim() ?? "";
  const runEndDate = (form.get("runEndDate") as string | null)?.trim() ?? "";
  const submitterEmail = (form.get("submitterEmail") as string | null)?.trim() ?? "";
  const submitterName = (form.get("submitterName") as string | null)?.trim() ?? "";

  // Exactly 1 for now — the multi-image (up to 3) UI wasn't legible
  // ("elegir archivos" didn't read as a button, Daniel 2026-08-31), scaled
  // back to a single clear "Elegir imagen" button. The events_images
  // table/Edge Function still tolerate up to 3 for whenever that comes back.
  const images = form.getAll("images").filter((v): v is File => v instanceof File && v.size > 0);

  const openingDatetimeUtc = openingDatetime ? parseLocalDatetimeToUtcIso(openingDatetime) : null;

  if (
    !title ||
    !description ||
    !artist ||
    !galleryName ||
    !comunaName ||
    !regionId ||
    !openingDatetimeUtc ||
    !runEndDate ||
    !submitterName ||
    !EMAIL_PATTERN.test(submitterEmail) ||
    images.length !== 1
  ) {
    return NextResponse.json({ status: "invalid" }, { status: 400 });
  }

  for (const image of images) {
    if (!ALLOWED_IMAGE_TYPES.has(image.type) || image.size > MAX_IMAGE_BYTES) {
      return NextResponse.json({ status: "invalid" }, { status: 400 });
    }
  }

  const submissionInput: SubmissionInput = { title, description, artist, galleryName, comunaName, openingDatetime, runEndDate };

  let textDecision;
  try {
    textDecision = await curateSubmissionText(submissionInput);
  } catch (err) {
    console.error("[submit-event] text curation failed", err);
    return NextResponse.json({ status: "error" }, { status: 502 });
  }

  const encodedImages = await Promise.all(
    images.map(async (image) => ({ base64: await fileToBase64(image), mediaType: image.type })),
  );

  let finalStatus = textDecision.status;
  if (finalStatus === "approved") {
    try {
      const visionStatus = await curateSubmissionImage(encodedImages[0].base64, encodedImages[0].mediaType);
      if (visionStatus === "rejected") finalStatus = "rejected";
    } catch (err) {
      console.error("[submit-event] vision curation failed", err);
      return NextResponse.json({ status: "error" }, { status: 502 });
    }
  }

  if (finalStatus === "rejected") {
    // Never persisted — mirrors that `events` never held rejected
    // candidates either way (see rejected_candidates for the scraped-
    // pipeline equivalent, not reused here — nothing to dedupe a one-off
    // self-reported submission against).
    return NextResponse.json({
      status: "rejected",
      message: textDecision.publicMessage || "Gracias por escribirnos — esta vez no pudimos publicar tu expo en el calendario.",
    });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const adminSecret = process.env.ADMIN_ACTIONS_SECRET;
  if (!supabaseUrl || !adminSecret) {
    console.error("[submit-event] NEXT_PUBLIC_SUPABASE_URL or ADMIN_ACTIONS_SECRET not set");
    return NextResponse.json({ status: "error" }, { status: 500 });
  }

  const res = await fetch(`${supabaseUrl}/functions/v1/submit-event`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-admin-secret": adminSecret },
    body: JSON.stringify({
      title,
      description,
      artist,
      freeformLocation: `${galleryName}, ${comunaName}`,
      placeName: galleryName,
      regionId,
      openingDatetime: openingDatetimeUtc,
      runEndDate,
      sensitivityTags: textDecision.sensitivityTags,
      curationReasoning: textDecision.curationReasoning,
      publicMessage: textDecision.publicMessage,
      submitterEmail,
      submitterName,
      images: encodedImages,
    } satisfies Record<string, unknown>),
  });

  const data = (await res.json().catch(() => ({ status: "error" }))) as { status: string; eventId?: string };
  if (!res.ok || data.status !== "ok") {
    console.error("[submit-event] commit function failed", data);
    return NextResponse.json({ status: "error" }, { status: 502 });
  }

  return NextResponse.json({
    status: "approved",
    message: textDecision.publicMessage || "¡Gracias! Tu expo ya está publicada en Caldearte.",
    eventId: data.eventId,
  });
}
