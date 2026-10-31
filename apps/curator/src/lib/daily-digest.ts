// Consolidated once-a-day summary email — replaces the 4 separate
// per-pipeline emails (event-discovery/headless/instagram/google-alerts,
// each via their own sendXRunSummaryEmail), which on a day multiple
// pipelines fire (e.g. Sunday: all 4) arrived as 4 separate emails.
// Daniel's explicit request, 2026-08-26: one email/day, whatever ran
// that day, with a real cost picture (today + month-to-date vs budget/
// free tiers).
//
// 2026-10-30, Daniel: the full per-event table (every candidate, approved
// and rejected, for every source) was too long to use. The email now
// carries the numbers, then the day's NEW events as the newsletter's own
// cards (thumbnail first, so the flyer can be checked at a glance; each
// links to its page), then what the safety net vetoed, with its reason —
// as cards without a link, since they never reached the site.
import { Resend } from "resend";
import { escapeHtml, eventCardHtml, eventUrl, fmtUsd, RUN_SUMMARY_RECIPIENT, type CandidateSummary, type DigestEvent, type EventGroup } from "./notify.js";
import { APIFY_FREE_TIER_USD } from "./apify-cost-split.js";

export type DiscoveryEntrypoint = "event_discovery" | "headless" | "instagram" | "google_alerts";

const ENTRYPOINT_LABEL: Record<DiscoveryEntrypoint, string> = {
  event_discovery: "Web (comuna + agregadores)",
  headless: "Headless (MAVI)",
  instagram: "Instagram",
  google_alerts: "Google Alerts",
};

export interface DailyDigestPipelineRun {
  entrypoint: DiscoveryEntrypoint;
  startedAt: Date;
  candidates: { total: number; approvedByCuration: number; rejectedByCuration: number };
  eventGroups: EventGroup[];
  costUsd: number;
  // Set when the pipeline's own fetch failed outright (currently only
  // Instagram/Apify can report this — see apify-instagram.ts's own doc
  // comment) — surfaced as a visible warning instead of silently reading
  // as "0 candidates, ran fine."
  fetchError?: string | null;
}

export interface DailyDigestCost {
  anthropicTodayUsd: number;
  // The safety-net model (MiniMax via OpenRouter, lib/safety-net.ts
  // + the bright-source shadow) — recorded in the same api_usage_log
  // ledger since 2026-09-17, split out by model so it never reads as
  // Anthropic spend. Counts toward the same monthly ceiling.
  safetyNetTodayUsd: number;
  safetyNetMonthUsd: number;
  apifyTodayGrossUsd: number;
  apifyTodayFreeUsd: number;
  apifyTodayRealUsd: number;
  anthropicMonthUsd: number;
  // Apify's figures are per BILLING CYCLE (anniversary-based), not per
  // calendar month like Anthropic's — see apify-cost-split.ts's own
  // comment on APIFY_CYCLE_ANCHOR_DAY. Named apart from anthropicMonthUsd
  // on purpose so the two windows can't be silently conflated again.
  apifyCycleGrossUsd: number;
  apifyCycleFreeUsd: number;
  apifyCycleRealUsd: number;
  apifyCycleStartDate: string; // YYYY-MM-DD, first day of the current cycle
  monthlyBudgetUsd: number;
}

export interface DailyDigestSummary {
  date: string; // YYYY-MM-DD, Santiago day
  runs: DailyDigestPipelineRun[];
  cost: DailyDigestCost;
  // Events created today and still on the site, read from `events`
  // itself (run.ts) — the run summaries carry no event id or rehosted
  // image, and both are what a card needs.
  newEvents: DigestEvent[];
}

// The safety net rewrites a vetoed candidate's reasoning as
// "[VETO red de seguridad <model>] <why> — Haiku había aprobado: <why>"
// (lib/safety-net.ts) — that prefix is how a veto is recognised here.
const VETO_PATTERN = /^\[VETO red de seguridad [^\]]*\]\s*([\s\S]*?)(?:\s+— Haiku había aprobado:\s*([\s\S]*))?$/;

export interface SafetyNetVetoSummary {
  candidate: CandidateSummary;
  reason: string;
  haikuReason: string | null;
}

export function safetyNetVetoesOf(runs: DailyDigestPipelineRun[]): SafetyNetVetoSummary[] {
  return runs
    .flatMap((run) => run.eventGroups.flatMap((g) => g.candidates))
    .flatMap((candidate) => {
      const match = VETO_PATTERN.exec(candidate.curationReasoning);
      return match ? [{ candidate, reason: match[1].trim(), haikuReason: match[2]?.trim() || null }] : [];
    });
}

// A vetoed candidate in the newsletter card's shape. No id (it never
// became an event) — the card is rendered without a link.
function vetoAsDigestEvent(c: CandidateSummary): DigestEvent {
  return {
    id: "",
    title: c.title,
    placeName: c.placeName ?? "",
    comunaName: c.location || null,
    openingDatetime: null,
    openingTimeConfirmed: false,
    runEndDate: c.runEndDate,
    imageUrl: c.imageUrl ?? null,
    isOpeningThisWeek: false,
  };
}

function dateStrDDMMYYYY(date: string): string {
  return date.split("-").reverse().join("/");
}

// "Aprobados" is Haiku's verdict; what actually reached the site is the
// subset that survived dedup, the axis net and the safety net. Daniel
// asked for that number in the per-source table (2026-09-19): the
// subject line already counted it, the table didn't.
function insertedCount(run: DailyDigestPipelineRun): number {
  return run.eventGroups.flatMap((g) => g.candidates).filter((c) => c.outcome === "inserted").length;
}

export function buildDailyDigestSubject(summary: DailyDigestSummary): string {
  const insertedTotal = summary.runs.reduce((sum, r) => sum + insertedCount(r), 0);
  return `Caldearte — resumen diario (${dateStrDDMMYYYY(summary.date)}) — ${summary.runs.length} fuente(s), ${insertedTotal} evento(s) nuevo(s)`;
}

// On the Free plan (until 2026-10-13) the included credit was a HARD limit:
// once apifyCycleGrossUsd reached it, Apify refused to start new Actor runs
// until the next cycle (real incidents: 2026-08-30 and 2026-10-10, see
// instagram-bright-sources.yml's own comment). On the Starter plan usage
// past the included $19 is billed as excess on the next invoice instead, up
// to the usage limit set in Apify's billing settings — so reaching it is a
// cost signal, not an outage. Either way a plain "$X real of $Y" framing
// hides what matters, so this line states the credit status explicitly.
//
// Says the reset DATE rather than "el próximo ciclo": the cycle is
// anniversary-based, so "next month" is actively misleading — on
// 2026-09-06 the reset was still a week away, on the 13th.
function apifyLimitStatusLine(cost: DailyDigestCost): string {
  const remaining = APIFY_FREE_TIER_USD - cost.apifyCycleGrossUsd;
  const resetsOn = dateStrDDMMYYYY(nextApifyCycleStart(cost.apifyCycleStartDate));
  if (remaining <= 0) {
    return `⚠️ Apify: CRÉDITO DEL PLAN AGOTADO ($${cost.apifyCycleGrossUsd.toFixed(2)} de $${APIFY_FREE_TIER_USD}) — el excedente se factura en la próxima factura (${resetsOn}), hasta el límite de uso configurado en Apify`;
  }
  return `Apify: $${remaining.toFixed(2)} disponibles de $${APIFY_FREE_TIER_USD} en el ciclo actual (se renueva el ${resetsOn})`;
}

// One month on from the current cycle's start, clamped the same way
// apifyCycleStart clamps — display only.
function nextApifyCycleStart(cycleStartDate: string): string {
  const [y, m, d] = cycleStartDate.split("-").map(Number);
  const lastDayOfNextMonth = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  return new Date(Date.UTC(y, m, Math.min(d, lastDayOfNextMonth))).toISOString().slice(0, 10);
}

const SAFETY_NET_LABEL = "MiniMax (red de seguridad)";
const H2_STYLE = "font-size:14px;text-transform:uppercase;letter-spacing:0.04em;color:#888;margin:24px 0 10px;border-bottom:1px solid #e2e0da;padding-bottom:6px;";
// The newsletter's own background behind its white cards (notify.ts's
// SURFACE_SAGE) — on this email's white page the cards would lose their edges.
const CARD_SURFACE = "#d7dfe2";

function buildCostLines(cost: DailyDigestCost): string[] {
  const todayRealTotal = cost.anthropicTodayUsd + cost.safetyNetTodayUsd + cost.apifyTodayRealUsd;
  const monthRealTotal = cost.anthropicMonthUsd + cost.safetyNetMonthUsd + cost.apifyCycleRealUsd;
  return [
    "COSTO",
    `Hoy: ${fmtUsd(todayRealTotal)} real (Anthropic ${fmtUsd(cost.anthropicTodayUsd)} + ${SAFETY_NET_LABEL} ${fmtUsd(cost.safetyNetTodayUsd)} + Apify ${fmtUsd(cost.apifyTodayRealUsd)} real de ${fmtUsd(cost.apifyTodayGrossUsd)} bruto, ${fmtUsd(cost.apifyTodayFreeUsd)} cubierto por el crédito del plan)`,
    `Mes a la fecha: $${monthRealTotal.toFixed(2)} de $${cost.monthlyBudgetUsd.toFixed(2)} (techo mensual)`,
    `  Anthropic: $${cost.anthropicMonthUsd.toFixed(2)} (mes calendario)`,
    `  ${SAFETY_NET_LABEL}: $${cost.safetyNetMonthUsd.toFixed(2)} (mes calendario)`,
    `  Apify: $${cost.apifyCycleRealUsd.toFixed(2)} real de $${cost.apifyCycleGrossUsd.toFixed(2)} bruto ($${cost.apifyCycleFreeUsd.toFixed(2)} en el crédito del plan Starter de $${APIFY_FREE_TIER_USD}, ya incluido en la suscripción) — ciclo desde el ${dateStrDDMMYYYY(cost.apifyCycleStartDate)}`,
    `  ${apifyLimitStatusLine(cost)}`,
  ];
}

export function buildDailyDigestBody(summary: DailyDigestSummary): string {
  const lines = [
    `Resumen diario de discovery — ${summary.date}`,
    "",
    `FUENTES QUE CORRIERON HOY (${summary.runs.length})`,
  ];

  for (const run of summary.runs) {
    lines.push(
      `-- ${ENTRYPOINT_LABEL[run.entrypoint]} (${run.startedAt.toISOString()}) --`,
      `  ${run.candidates.total} candidatos · ${run.candidates.rejectedByCuration} rechazados · ${run.candidates.approvedByCuration} aprobados · ${insertedCount(run)} insertados · costo corrida ${fmtUsd(run.costUsd)}`,
    );
    if (run.fetchError) {
      lines.push(`  ⚠️ BLOQUEADO — no se revisó ninguna cuenta/fuente: ${run.fetchError}`);
    }
  }

  lines.push("", ...buildCostLines(summary.cost), "");

  lines.push(`NUEVOS EN EL SITIO (${summary.newEvents.length})`);
  for (const e of summary.newEvents) {
    lines.push(`  ${e.title} — ${[e.placeName, e.comunaName].filter(Boolean).join(", ")}`, `    ${eventUrl(e.id)}`);
  }
  if (summary.newEvents.length === 0) lines.push("  (ninguno hoy)");

  const vetoes = safetyNetVetoesOf(summary.runs);
  if (vetoes.length > 0) {
    lines.push("", `QUITADOS POR ${SAFETY_NET_LABEL.toUpperCase()} (${vetoes.length})`);
    for (const v of vetoes) {
      lines.push(`  ${v.candidate.title} — ${[v.candidate.placeName, v.candidate.location].filter(Boolean).join(", ")}`, `    Por qué: ${v.reason}`);
      if (v.haikuReason) lines.push(`    Haiku lo había aprobado: ${v.haikuReason}`);
    }
  }

  return lines.join("\n");
}

export function buildDailyDigestHtmlBody(summary: DailyDigestSummary): string {
  const runsHtml = summary.runs
    .map(
      (run) => `<tr>
        <td style="padding:4px 12px 4px 0;">${escapeHtml(ENTRYPOINT_LABEL[run.entrypoint])}</td>
        <td style="padding:4px 12px 4px 0;text-align:right;">${run.candidates.total}</td>
        <td style="padding:4px 12px 4px 0;text-align:right;">${run.candidates.rejectedByCuration}</td>
        <td style="padding:4px 12px 4px 0;text-align:right;">${run.candidates.approvedByCuration}</td>
        <td style="padding:4px 12px 4px 0;text-align:right;font-weight:600;">${insertedCount(run)}</td>
        <td style="padding:4px 0;text-align:right;">${fmtUsd(run.costUsd)}</td>
      </tr>${
        run.fetchError
          ? `<tr><td colspan="5" style="padding:0 0 8px;color:#b3261e;font-size:12px;">⚠️ BLOQUEADO — no se revisó ninguna cuenta/fuente: ${escapeHtml(run.fetchError)}</td></tr>`
          : ""
      }`,
    )
    .join("");

  const cost = summary.cost;
  const todayRealTotal = cost.anthropicTodayUsd + cost.safetyNetTodayUsd + cost.apifyTodayRealUsd;
  const monthRealTotal = cost.anthropicMonthUsd + cost.safetyNetMonthUsd + cost.apifyCycleRealUsd;

  const referenceYear = Number(summary.date.slice(0, 4));
  const newEventsHtml = summary.newEvents.length
    ? `<div style="background:${CARD_SURFACE};border-radius:16px;padding:12px 12px 2px;">${summary.newEvents.map((e) => eventCardHtml(e, referenceYear)).join("")}</div>`
    : `<p style="color:#666;">(ninguno hoy)</p>`;

  const vetoes = safetyNetVetoesOf(summary.runs);
  const vetoesHtml = vetoes.length
    ? `<h2 style="${H2_STYLE}">Quitados por ${escapeHtml(SAFETY_NET_LABEL)} (${vetoes.length})</h2>
    <div style="background:${CARD_SURFACE};border-radius:16px;padding:12px 12px 2px;">${vetoes
      .map(
        (v) => `${eventCardHtml(vetoAsDigestEvent(v.candidate), referenceYear, null)}
        <p style="margin:-2px 4px 16px;font-size:13px;line-height:1.45;"><b>Por qué:</b> ${escapeHtml(v.reason)}${
          v.haikuReason ? `<br><span style="color:#666;">Haiku lo había aprobado: ${escapeHtml(v.haikuReason)}</span>` : ""
        }</p>`,
      )
      .join("")}</div>`
    : "";

  return `<div style="font-family:-apple-system,Helvetica,Arial,sans-serif;max-width:720px;margin:0 auto;color:#1a1a1a;">
    <h1 style="font-size:18px;margin:0 0 4px;">Caldearte — resumen diario</h1>
    <p style="font-size:13px;color:#666;margin:0 0 20px;">${escapeHtml(summary.date)}</p>

    <h2 style="${H2_STYLE}">Fuentes que corrieron hoy (${summary.runs.length})</h2>
    <table style="border-collapse:collapse;font-size:13px;width:100%;">
      <thead>
        <tr style="text-align:left;color:#888;">
          <th style="padding:4px 12px 4px 0;">Fuente</th>
          <th style="padding:4px 12px 4px 0;text-align:right;">Candidatos</th>
          <th style="padding:4px 12px 4px 0;text-align:right;">Rechazados</th>
          <th style="padding:4px 12px 4px 0;text-align:right;">Aprobados</th>
          <th style="padding:4px 12px 4px 0;text-align:right;">Insertados</th>
          <th style="padding:4px 0;text-align:right;">Costo</th>
        </tr>
      </thead>
      <tbody>${runsHtml}</tbody>
    </table>

    <h2 style="${H2_STYLE}">Costo</h2>
    <p>
      <b>Hoy:</b> ${fmtUsd(todayRealTotal)} real<br>
      &nbsp;&nbsp;Anthropic: ${fmtUsd(cost.anthropicTodayUsd)}<br>
      &nbsp;&nbsp;${SAFETY_NET_LABEL}: ${fmtUsd(cost.safetyNetTodayUsd)}<br>
      &nbsp;&nbsp;Apify: ${fmtUsd(cost.apifyTodayRealUsd)} real de ${fmtUsd(cost.apifyTodayGrossUsd)} bruto (${fmtUsd(cost.apifyTodayFreeUsd)} en el crédito del plan)<br>
      <br>
      <b>Mes a la fecha:</b> $${monthRealTotal.toFixed(2)} de $${cost.monthlyBudgetUsd.toFixed(2)} (techo mensual)<br>
      &nbsp;&nbsp;Anthropic: $${cost.anthropicMonthUsd.toFixed(2)} (mes calendario)<br>
      &nbsp;&nbsp;${SAFETY_NET_LABEL}: $${cost.safetyNetMonthUsd.toFixed(2)} (mes calendario)<br>
      &nbsp;&nbsp;Apify: $${cost.apifyCycleRealUsd.toFixed(2)} real de $${cost.apifyCycleGrossUsd.toFixed(2)} bruto ($${cost.apifyCycleFreeUsd.toFixed(2)} en el crédito del plan Starter de $${APIFY_FREE_TIER_USD}, ya incluido en la suscripción) — ciclo desde el ${escapeHtml(dateStrDDMMYYYY(cost.apifyCycleStartDate))}<br>
      &nbsp;&nbsp;<span style="${cost.apifyCycleGrossUsd >= APIFY_FREE_TIER_USD ? "color:#b3261e;font-weight:600;" : "color:#666;"}">${escapeHtml(apifyLimitStatusLine(cost))}</span>
    </p>

    <h2 style="${H2_STYLE}">Nuevos en el sitio (${summary.newEvents.length})</h2>
    ${newEventsHtml}
    ${vetoesHtml}
  </div>`;
}

// Ancillary — must never throw (a failed email must not fail the digest
// script, which itself must never fail an already-successful discovery
// run). Skips sending entirely when nothing ran today (empty runs array)
// — the caller decides that, this function always sends what it's given.
export async function sendDailyDigestEmail(summary: DailyDigestSummary): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.warn("sendDailyDigestEmail: RESEND_API_KEY not set — skipping daily digest email (expected outside CI or before the secret is configured).");
    return;
  }

  const resend = new Resend(apiKey);
  const { error } = await resend.emails.send({
    from: "Caldearte <contacto@caldearte.com>",
    to: RUN_SUMMARY_RECIPIENT,
    subject: buildDailyDigestSubject(summary),
    text: buildDailyDigestBody(summary),
    html: buildDailyDigestHtmlBody(summary),
  });

  if (error) {
    console.error("[daily-digest] email send failed", error);
  }
}
