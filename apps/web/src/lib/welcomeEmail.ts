// Newsletter welcome email (2026-10-18) — sent once, right after a
// subscriber confirms (double opt-in), from /newsletter/confirmar. Before
// it, nothing reached a new subscriber between confirming and the next
// Thursday edition: four days of silence on a Sunday signup. It says what
// arrives and when, and shows the región's openings of the coming days in
// the Thursday edition's own one-row card style, so the first email
// already has something to go to. Pure builders here; the send itself is
// sendWelcomeEmail.ts.
import type { EventRecord, RegionMeta } from "./events";
import { buildRegionMetaByCityId } from "./cities";
import { eventComuna, filterByRegion } from "./event-utils";
import { fmtAgendaPillDay, fmtAgendaPillHour, parseDateOnly, santiagoDateOfIso, toDateOnlyString } from "./date";
import { knownShortRegionName } from "./regionNames";
import {
  BRAND_MAGENTA,
  INSTAGRAM_URL,
  LATO_STACK,
  SITE_URL,
  TEXT_PRIMARY,
  TEXT_SECONDARY,
  emailShell,
  escapeHtml,
  unsubscribeUrl,
} from "./newsletterEmail";

// A week ahead from the confirm day — on a Monday-Wednesday signup that's
// a preview of the coming edition, on a Thursday-Sunday one it covers
// what the subscriber would otherwise only hear about too late.
const WINDOW_DAYS = 7;
// Enough to read as "there's a lot on" without becoming the edition itself.
const MAX_OPENINGS = 6;

const WEEKDAYS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
const MONTHS = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

function addDays(dateStr: string, days: number): string {
  const d = parseDateOnly(dateStr);
  d.setDate(d.getDate() + days);
  return toDateOnlyString(d);
}

// The región's inauguraciones opening from today through the next
// WINDOW_DAYS - 1 days (Santiago calendar), soonest first.
export function selectWelcomeOpenings(events: EventRecord[], regions: RegionMeta[], adminRegionName: string, todayStr: string): EventRecord[] {
  const windowEnd = addDays(todayStr, WINDOW_DAYS - 1);
  return filterByRegion(events, adminRegionName, buildRegionMetaByCityId(regions))
    .filter((e) => {
      if (e.eventType !== "inauguracion" || !e.openingDatetime) return false;
      const date = santiagoDateOfIso(e.openingDatetime);
      return date >= todayStr && date <= windowEnd;
    })
    .sort((a, b) => a.openingDatetime!.localeCompare(b.openingDatetime!))
    .slice(0, MAX_OPENINGS);
}

// "jueves 22 de octubre" — the first edition this subscriber gets. Always
// the NEXT Thursday: on a Thursday the edition has normally gone out
// already (~08:00) by the time anyone confirms.
export function nextEditionLabel(todayStr: string): string {
  const today = parseDateOnly(todayStr);
  const offset = (4 - today.getDay() + 7) % 7 || 7;
  const thursday = parseDateOnly(addDays(todayStr, offset));
  return `${WEEKDAYS[4]} ${thursday.getDate()} de ${MONTHS[thursday.getMonth()]}`;
}

// The welcome goes out only on a first-time "confirmed" that came with the
// subscriber's email and región — never on "already_confirmed" (a second
// click on the link, or a mail scanner prefetching it).
export function welcomeRecipientFrom(
  token: string | undefined,
  result: { status: string; email?: string; adminRegionName?: string },
): { email: string; adminRegionName: string; token: string } | null {
  if (!token || result.status !== "confirmed" || !result.email || !result.adminRegionName) return null;
  return { email: result.email, adminRegionName: result.adminRegionName, token };
}

export interface WelcomeEmailInput {
  adminRegionName: string;
  unsubscribeToken: string;
  openings: EventRecord[];
  todayStr: string;
}

export interface WelcomeEmail {
  subject: string;
  text: string;
  html: string;
  unsubscribeUrl: string;
}

function eventUrl(id: string): string {
  return `${SITE_URL}/eventos/${encodeURIComponent(id)}`;
}

// "ÑUÑOA · JUE 22 OCT · 19 HR" — the site's agenda pill.
function pillText(e: EventRecord, todayStr: string): string {
  return [eventComuna(e).toUpperCase(), fmtAgendaPillDay(e.openingDatetime!, todayStr), fmtAgendaPillHour(e.openingDatetime!, e.openingTimeConfirmed)].join(" · ");
}

function placeOf(e: EventRecord): string {
  return e.placeName ?? e.freeformLocation;
}

// Same row as notify.ts's eventCardHtml: 4:5 thumbnail, magenta title,
// magenta pill, small grey venue — the whole row one link.
function eventRowHtml(e: EventRecord, todayStr: string): string {
  const thumb = e.imageUrl
    ? `<img src="${escapeHtml(e.imageUrl)}" width="96" height="120" alt="" style="display:block;width:96px;height:120px;object-fit:cover;border-radius:8px;" />`
    : `<div style="width:96px;height:120px;background:#3a3a3a;border-radius:8px;"></div>`;
  return `<a href="${escapeHtml(eventUrl(e.id))}" style="display:block;text-decoration:none;margin:0 0 10px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:16px;">
      <tr>
        <td width="106" valign="top" style="padding:10px 0 10px 10px;line-height:0;">${thumb}</td>
        <td valign="middle" style="padding:10px 14px;">
          <p style="margin:0;color:${BRAND_MAGENTA};font-family:${LATO_STACK};font-weight:900;font-size:16px;line-height:1.25;letter-spacing:0.3px;text-transform:uppercase;">${escapeHtml(e.title)}</p>
          <p style="margin:8px 0 0;"><span style="display:inline-block;background:${BRAND_MAGENTA};color:#fff;border-radius:12px;padding:4px 10px;font-family:${LATO_STACK};font-weight:900;font-size:11px;line-height:1.35;letter-spacing:0.3px;">${escapeHtml(pillText(e, todayStr))}</span></p>
          <p style="margin:8px 0 0;color:${TEXT_SECONDARY};font-size:11px;font-weight:600;line-height:1.25;letter-spacing:1px;text-transform:uppercase;">${escapeHtml(placeOf(e))}</p>
        </td>
      </tr>
    </table>
  </a>`;
}

const BUTTON_STYLE = `display:inline-block;background:${BRAND_MAGENTA};color:#fff;padding:13px 24px;border-radius:999px;text-decoration:none;font-family:${LATO_STACK};font-weight:900;font-size:15px;`;

export function buildWelcomeEmail({ adminRegionName, unsubscribeToken, openings, todayStr }: WelcomeEmailInput): WelcomeEmail {
  // Known names only — never echo an unrecognized string into the email.
  const region = knownShortRegionName(adminRegionName) ?? "tu región";
  const firstEdition = nextEditionLabel(todayStr);
  const unsubscribe = unsubscribeUrl(unsubscribeToken);

  const promise = `Cada jueves en la mañana te llegarán las inauguraciones de jueves a domingo en ${region}. El primer boletín llega el ${firstEdition}.`;
  const openingsLead =
    openings.length > 0
      ? `Mientras tanto, esto se inaugura en ${region} en los próximos días:`
      : `Esta semana aún no tenemos inauguraciones en ${region}. Mientras tanto, mira lo que hay en cartelera.`;
  const ctaLabel = openings.length > 0 ? "Ver toda la agenda" : "Ver la cartelera";
  const footer = `Te escribimos porque confirmaste tu suscripción al boletín de Caldearte, un calendario de arte curado por inteligencia humana potenciada por IA.`;

  const text = [
    "LISTO, YA ESTÁS DENTRO",
    "",
    promise,
    "",
    openingsLead,
    "",
    ...openings.flatMap((e) => [`${e.title} — ${placeOf(e)} — ${pillText(e, todayStr)}`, `  ${eventUrl(e.id)}`]),
    ...(openings.length > 0 ? [""] : []),
    `${ctaLabel}: ${SITE_URL}`,
    "",
    `Síguenos en Instagram, donde publicamos entrevistas a artistas en sus propias inauguraciones: ${INSTAGRAM_URL}`,
    "",
    footer,
    `Darse de baja: ${unsubscribe}`,
  ].join("\n");

  const bodyHtml = `
      <h1 style="margin:0 0 12px;font-family:${LATO_STACK};font-weight:900;font-size:24px;line-height:1.15;color:${BRAND_MAGENTA};text-transform:uppercase;">Listo, ya estás dentro</h1>
      <p style="margin:0;font-size:16px;color:${TEXT_PRIMARY};line-height:1.55;">${escapeHtml(promise)}</p>`;

  const rowsHtml = openings.map((e) => eventRowHtml(e, todayStr)).join("");
  const afterHtml = `
      <p style="margin:28px 0 12px;font-size:16px;color:${TEXT_PRIMARY};line-height:1.5;">${escapeHtml(openingsLead)}</p>
      ${rowsHtml}
      <p style="margin:18px 0 0;"><a href="${SITE_URL}" style="${BUTTON_STYLE}">${escapeHtml(ctaLabel)}</a></p>
      <p style="margin:32px 0 0;font-size:15px;color:${TEXT_PRIMARY};line-height:1.55;">Síguenos en Instagram, donde publicamos entrevistas a artistas en sus propias inauguraciones — <a href="${INSTAGRAM_URL}" style="color:${BRAND_MAGENTA};font-weight:700;text-decoration:underline;">@caldearte.oficial</a>.</p>
      <p style="margin:24px 0 0;font-size:12px;color:${TEXT_SECONDARY};line-height:1.6;">${escapeHtml(footer)} <a href="${escapeHtml(unsubscribe)}" style="color:${TEXT_SECONDARY};text-decoration:underline;">Darse de baja</a></p>`;

  return {
    subject: "Te damos la bienvenida a Caldearte",
    text,
    html: emailShell(bodyHtml, afterHtml),
    unsubscribeUrl: unsubscribe,
  };
}
