import { NextResponse } from "next/server";
import { Resend } from "resend";
import { clientIp, isWithinRateLimit } from "@/lib/rate-limit";
import { curateSubmissionText, curateSubmissionImage, type SubmissionInput, type CurationDecision } from "@/lib/curate-submission";
import { parseLocalDatetimeToUtcIso } from "@/lib/santiagoTime";

// Same inbox as /api/contact — Daniel wants a copy of every submission
// (approved or rejected) with the full form content and Haiku's
// resolution, so he doesn't have to go looking in the DB to know a
// gallery tried to add something.
const NOTIFY_RECIPIENT = "daniel@probablespa.cl";

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

interface NotifyParams {
  input: SubmissionInput;
  submitterEmail: string;
  submitterName: string;
  decision: CurationDecision;
  finalStatus: "approved" | "rejected";
  eventId?: string;
}

// Best-effort — a Resend failure here must never fail the submitter's own
// request (the curation decision + DB write already happened). Logged so
// a persistent failure is still visible, same posture as every other
// outbound email in this app.
async function notifyDaniel(params: NotifyParams): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.error("[submit-event] RESEND_API_KEY not set — skipping owner notification");
    return;
  }

  const { input, submitterEmail, submitterName, decision, finalStatus, eventId } = params;
  const outcomeLabel = finalStatus === "approved" ? "APROBADA" : "RECHAZADA";
  const eventLine = eventId ? `\nPublicada en: https://www.caldearte.com/eventos/${eventId}\n` : "";

  const body = `Nueva expo enviada por el formulario — ${outcomeLabel}
${eventLine}
De: ${submitterName} <${submitterEmail}>

Título: ${input.title}
Galería/espacio: ${input.galleryName}
Comuna: ${input.comunaName}
Artista(s): ${input.artist}
Inauguración: ${input.openingDatetime}
Término de la muestra: ${input.runEndDate ?? "(no especificado)"}
Descripción: ${input.description}

--- Resolución de Haiku ---
Estado: ${decision.status}
Ejes sensibles: ${decision.sensitivityTags.length > 0 ? decision.sensitivityTags.join(", ") : "(ninguno)"}
Razonamiento interno: ${decision.curationReasoning}
Mensaje mostrado al submitter: ${decision.publicMessage}`;

  try {
    const resend = new Resend(apiKey);
    const { error } = await resend.emails.send({
      from: "Caldearte <contacto@caldearte.com>",
      to: NOTIFY_RECIPIENT,
      replyTo: submitterEmail,
      subject: `Caldearte — expo enviada (${outcomeLabel.toLowerCase()}): ${input.title}`,
      text: body,
    });
    if (error) console.error("[submit-event] owner notification send failed", error);
  } catch (err) {
    console.error("[submit-event] owner notification threw", err);
  }
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

  const finalDecision: CurationDecision = { ...textDecision };
  if (finalDecision.status === "approved") {
    try {
      const visionStatus = await curateSubmissionImage(encodedImages[0].base64, encodedImages[0].mediaType);
      if (visionStatus === "rejected") {
        finalDecision.status = "rejected";
        finalDecision.curationReasoning += " [axis5: imagen rechazada por el chequeo de visión]";
        finalDecision.publicMessage =
          "Gracias por escribirnos. La imagen que enviaste no cumple con nuestras políticas de contenido, así que no pudimos publicar esta expo.";
      }
    } catch (err) {
      console.error("[submit-event] vision curation failed", err);
      return NextResponse.json({ status: "error" }, { status: 502 });
    }
  }

  if (finalDecision.status === "rejected") {
    // Never persisted — mirrors that `events` never held rejected
    // candidates either way (see rejected_candidates for the scraped-
    // pipeline equivalent, not reused here — nothing to dedupe a one-off
    // self-reported submission against).
    await notifyDaniel({ input: submissionInput, submitterEmail, submitterName, decision: finalDecision, finalStatus: "rejected" });
    return NextResponse.json({
      status: "rejected",
      message: finalDecision.publicMessage || "Gracias por escribirnos — esta vez no pudimos publicar tu expo en el calendario.",
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
      sensitivityTags: finalDecision.sensitivityTags,
      curationReasoning: finalDecision.curationReasoning,
      publicMessage: finalDecision.publicMessage,
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

  await notifyDaniel({
    input: submissionInput,
    submitterEmail,
    submitterName,
    decision: finalDecision,
    finalStatus: "approved",
    eventId: data.eventId,
  });

  return NextResponse.json({
    status: "approved",
    message: finalDecision.publicMessage || "¡Gracias! Tu expo ya está publicada en Caldearte.",
    eventId: data.eventId,
  });
}
