import { NextResponse } from "next/server";
import { Resend } from "resend";
import { clientIp, isWithinRateLimit } from "@/lib/rate-limit";
import { isValidEmail } from "@/lib/email";
import { curateSubmissionText, curateSubmissionImage, type SubmissionInput, type CurationDecision } from "@/lib/curate-submission";
import { parseLocalDatetimeToUtcIso } from "@/lib/santiagoTime";
import { getSupabaseClient } from "@/lib/supabase-client";
import { findSubmissionMatches, santiagoDate, type LiveEventForMatch, type SubmissionMatches } from "@caldearte/event-matching";

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

// Generous ceilings for the free-text fields (2026-11-20): the form never
// had any, and these strings now also go through the calendar matcher's
// regexes and into the Haiku prompt. The longest real exhibition title on
// the calendar is under 200 characters.
const MAX_SHORT_FIELD = 300;
const MAX_DESCRIPTION = 5000;

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
  matches?: SubmissionMatches<LiveEventForMatch>;
  supersededIds?: string[];
}

// How far back to look for the same show already on the calendar. An
// Instagram post announcing an opening lands a few days to a few weeks
// before it; a row whose run ended long before this opening can't be it.
const MATCH_WINDOW_DAYS = 60;
const PAGE_SIZE = 1000;

// The same show already live from a scraper (see
// packages/event-matching/src/submission-match.ts). Best-effort: a failed
// lookup must not block a real submission, it only means no replacement
// happens this time — the same outcome as before this check existed.
async function findCalendarMatches(
  title: string,
  placeName: string,
  regionId: string,
  openingDatetimeUtc: string,
  runEndDate: string,
): Promise<SubmissionMatches<LiveEventForMatch> | undefined> {
  const since = new Date(Date.parse(openingDatetimeUtc) - MATCH_WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const openingDay = santiagoDate(openingDatetimeUtc);
  try {
    // Still open on the submitted opening day, or (no closing date known)
    // opened within the window. ~360 rows on 2026-11-20; paged anyway,
    // since PostgREST silently stops at 1000.
    const rows: LiveEventForMatch[] = [];
    for (let from = 0; ; from += PAGE_SIZE) {
      const { data, error } = await getSupabaseClient()
        .from("events_public")
        .select("id, title, place_name, region_id, opening_datetime, run_start_date, run_end_date")
        .or(`run_end_date.gte.${openingDay},and(run_end_date.is.null,opening_datetime.gte.${since})`)
        .order("id")
        .range(from, from + PAGE_SIZE - 1);
      if (error) throw error;
      const page = data ?? [];
      rows.push(...page.filter((row): row is LiveEventForMatch => row.id !== null && row.title !== null));
      if (page.length < PAGE_SIZE) break;
    }
    return findSubmissionMatches({ title, placeName, regionId, openingDatetime: openingDatetimeUtc, runEndDate }, rows);
  } catch (err) {
    console.error("[submit-event] calendar match lookup failed", err);
    return undefined;
  }
}

function describeMatch(e: LiveEventForMatch): string {
  const opening = e.opening_datetime ? e.opening_datetime.slice(0, 10) : "sin fecha";
  return `- "${e.title}" — ${e.place_name ?? "sin espacio"}, ${opening} → ${e.run_end_date ?? "?"}\n  https://www.caldearte.com/eventos/${e.id}`;
}

function matchesSection(matches: SubmissionMatches<LiveEventForMatch> | undefined, supersededIds: string[] | undefined): string {
  if (!matches) return "";
  const superseded = matches.supersede.filter((e) => supersededIds?.includes(e.id));
  const notReplaced = matches.supersede.filter((e) => !supersededIds?.includes(e.id));
  const parts: string[] = [];
  if (superseded.length > 0) {
    parts.push(`--- Reemplazó a (quitado del calendario, queda la del formulario) ---\n${superseded.map(describeMatch).join("\n")}`);
  }
  if (notReplaced.length > 0) {
    parts.push(`--- Duplicado detectado pero NO se pudo quitar (revisar a mano) ---\n${notReplaced.map(describeMatch).join("\n")}`);
  }
  if (matches.possible.length > 0) {
    parts.push(`--- Posibles duplicados (no se tocaron, revisar) ---\n${matches.possible.map(describeMatch).join("\n")}`);
  }
  return parts.length > 0 ? `\n\n${parts.join("\n\n")}` : "";
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

  const { input, submitterEmail, submitterName, decision, finalStatus, eventId, matches, supersededIds } = params;
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
Mensaje mostrado al submitter: ${decision.publicMessage}${matchesSection(matches, supersededIds)}`;

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
    !isValidEmail(submitterEmail) ||
    images.length !== 1 ||
    [title, artist, galleryName, comunaName, submitterName].some((field) => field.length > MAX_SHORT_FIELD) ||
    description.length > MAX_DESCRIPTION
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
    // pipeline equivalent, not reused here). A rejected submission also
    // never replaces anything already on the calendar.
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

  // The form's row wins over the same show already scraped (Daniel,
  // 2026-11-20, after "Rotten" was doubled 2026-11-12): the Edge Function
  // inserts this row, then removes those, copying over what they knew that
  // the form doesn't ask for.
  const matches = await findCalendarMatches(title, galleryName, regionId, openingDatetimeUtc, runEndDate);

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
      supersedesEventIds: matches?.supersede.map((e) => e.id) ?? [],
    } satisfies Record<string, unknown>),
  });

  const data = (await res.json().catch(() => ({ status: "error" }))) as { status: string; eventId?: string; supersededIds?: string[] };
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
    matches,
    supersededIds: data.supersededIds ?? [],
  });

  return NextResponse.json({
    status: "approved",
    message: finalDecision.publicMessage || "¡Gracias! Tu expo ya está publicada en Caldearte.",
    eventId: data.eventId,
  });
}
