// Consolidated once-a-day summary email — replaces the 4 separate
// per-pipeline emails (event-discovery/headless/instagram/google-alerts,
// each via their own sendXRunSummaryEmail), which on a day multiple
// pipelines fire (e.g. Sunday: all 4) arrived as 4 separate emails.
// Daniel's explicit request, 2026-08-26: one email/day, whatever ran
// that day, with a real cost picture (today + month-to-date vs budget/
// free tiers) and the full per-event detail at the end.
import { Resend } from "resend";
import { buildEventGroupsHtml, buildEventGroupsText, escapeHtml, fmtUsd, RUN_SUMMARY_RECIPIENT, type EventGroup } from "./notify.js";
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
  apifyTodayGrossUsd: number;
  apifyTodayFreeUsd: number;
  apifyTodayRealUsd: number;
  anthropicMonthUsd: number;
  apifyMonthGrossUsd: number;
  apifyMonthFreeUsd: number;
  apifyMonthRealUsd: number;
  monthlyBudgetUsd: number;
}

export interface DailyDigestSummary {
  date: string; // YYYY-MM-DD, Santiago day
  runs: DailyDigestPipelineRun[];
  cost: DailyDigestCost;
}

function dateStrDDMMYYYY(date: string): string {
  return date.split("-").reverse().join("/");
}

export function buildDailyDigestSubject(summary: DailyDigestSummary): string {
  const insertedTotal = summary.runs.reduce((sum, r) => sum + r.eventGroups.flatMap((g) => g.candidates).filter((c) => c.outcome === "inserted").length, 0);
  return `Caldearte — resumen diario (${dateStrDDMMYYYY(summary.date)}) — ${summary.runs.length} fuente(s), ${insertedTotal} evento(s) nuevo(s)`;
}

// Apify's free tier is a HARD limit (not billed overage) — once
// apifyMonthGrossUsd reaches APIFY_FREE_TIER_USD, Apify itself refuses to
// start new Actor runs until the next billing cycle (real incident,
// 2026-08-30: hit mid-month, see instagram-bright-sources.yml's own
// comment). apifyMonthRealUsd staying $0 the whole time (nothing ever
// gets billed past the free tier on this plan) is exactly why a plain
// "$X real of $Y budget" framing hides the thing that actually matters
// here — this line makes the hard-limit status explicit instead.
function apifyLimitStatusLine(cost: DailyDigestCost): string {
  const remaining = APIFY_FREE_TIER_USD - cost.apifyMonthGrossUsd;
  if (remaining <= 0) {
    return `⚠️ Apify: LÍMITE MENSUAL ALCANZADO ($${cost.apifyMonthGrossUsd.toFixed(2)} de $${APIFY_FREE_TIER_USD}) — sin nuevas corridas hasta el próximo ciclo`;
  }
  return `Apify: $${remaining.toFixed(2)} disponibles de $${APIFY_FREE_TIER_USD}/mes antes del límite`;
}

function buildCostLines(cost: DailyDigestCost): string[] {
  const todayRealTotal = cost.anthropicTodayUsd + cost.apifyTodayRealUsd;
  const monthRealTotal = cost.anthropicMonthUsd + cost.apifyMonthRealUsd;
  return [
    "COSTO",
    `Hoy: ${fmtUsd(todayRealTotal)} real (Anthropic ${fmtUsd(cost.anthropicTodayUsd)} + Apify ${fmtUsd(cost.apifyTodayRealUsd)} real de ${fmtUsd(cost.apifyTodayGrossUsd)} bruto, ${fmtUsd(cost.apifyTodayFreeUsd)} cubierto por capa gratuita)`,
    `Mes a la fecha: $${monthRealTotal.toFixed(2)} de $${cost.monthlyBudgetUsd.toFixed(2)} (techo mensual)`,
    `  Anthropic: $${cost.anthropicMonthUsd.toFixed(2)}`,
    `  Apify: $${cost.apifyMonthRealUsd.toFixed(2)} real de $${cost.apifyMonthGrossUsd.toFixed(2)} bruto ($${cost.apifyMonthFreeUsd.toFixed(2)} en capa gratuita de $${APIFY_FREE_TIER_USD}/mes, no cobrado)`,
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
      `  ${run.candidates.total} candidatos · ${run.candidates.approvedByCuration} aprobados · ${run.candidates.rejectedByCuration} rechazados · costo corrida ${fmtUsd(run.costUsd)}`,
    );
    if (run.fetchError) {
      lines.push(`  ⚠️ BLOQUEADO — no se revisó ninguna cuenta/fuente: ${run.fetchError}`);
    }
  }

  lines.push("", ...buildCostLines(summary.cost), "");

  lines.push("DETALLE POR EVENTO");
  for (const run of summary.runs) {
    const groupLines = buildEventGroupsText(run.eventGroups);
    if (groupLines.length === 0) continue;
    lines.push(`== ${ENTRYPOINT_LABEL[run.entrypoint]} ==`, ...groupLines);
  }

  return lines.join("\n");
}

export function buildDailyDigestHtmlBody(summary: DailyDigestSummary): string {
  const runsHtml = summary.runs
    .map(
      (run) => `<tr>
        <td style="padding:4px 12px 4px 0;">${escapeHtml(ENTRYPOINT_LABEL[run.entrypoint])}</td>
        <td style="padding:4px 12px 4px 0;text-align:right;">${run.candidates.total}</td>
        <td style="padding:4px 12px 4px 0;text-align:right;">${run.candidates.approvedByCuration}</td>
        <td style="padding:4px 12px 4px 0;text-align:right;">${run.candidates.rejectedByCuration}</td>
        <td style="padding:4px 0;text-align:right;">${fmtUsd(run.costUsd)}</td>
      </tr>${
        run.fetchError
          ? `<tr><td colspan="5" style="padding:0 0 8px;color:#b3261e;font-size:12px;">⚠️ BLOQUEADO — no se revisó ninguna cuenta/fuente: ${escapeHtml(run.fetchError)}</td></tr>`
          : ""
      }`,
    )
    .join("");

  const cost = summary.cost;
  const todayRealTotal = cost.anthropicTodayUsd + cost.apifyTodayRealUsd;
  const monthRealTotal = cost.anthropicMonthUsd + cost.apifyMonthRealUsd;

  const detailHtml = summary.runs
    .map((run) => {
      const groupHtml = buildEventGroupsHtml(run.eventGroups);
      if (!groupHtml) return "";
      return `<h3 style="font-size:14px;margin:20px 0 8px;">${escapeHtml(ENTRYPOINT_LABEL[run.entrypoint])}</h3>${groupHtml}`;
    })
    .join("");

  return `<div style="font-family:-apple-system,Helvetica,Arial,sans-serif;max-width:720px;margin:0 auto;color:#1a1a1a;">
    <h1 style="font-size:18px;margin:0 0 4px;">Caldearte — resumen diario</h1>
    <p style="font-size:13px;color:#666;margin:0 0 20px;">${escapeHtml(summary.date)}</p>

    <h2 style="font-size:14px;text-transform:uppercase;letter-spacing:0.04em;color:#888;margin:24px 0 10px;border-bottom:1px solid #e2e0da;padding-bottom:6px;">Fuentes que corrieron hoy (${summary.runs.length})</h2>
    <table style="border-collapse:collapse;font-size:13px;width:100%;">
      <thead>
        <tr style="text-align:left;color:#888;">
          <th style="padding:4px 12px 4px 0;">Fuente</th>
          <th style="padding:4px 12px 4px 0;text-align:right;">Candidatos</th>
          <th style="padding:4px 12px 4px 0;text-align:right;">Aprobados</th>
          <th style="padding:4px 12px 4px 0;text-align:right;">Rechazados</th>
          <th style="padding:4px 0;text-align:right;">Costo</th>
        </tr>
      </thead>
      <tbody>${runsHtml}</tbody>
    </table>

    <h2 style="font-size:14px;text-transform:uppercase;letter-spacing:0.04em;color:#888;margin:24px 0 10px;border-bottom:1px solid #e2e0da;padding-bottom:6px;">Costo</h2>
    <p>
      <b>Hoy:</b> ${fmtUsd(todayRealTotal)} real<br>
      &nbsp;&nbsp;Anthropic: ${fmtUsd(cost.anthropicTodayUsd)}<br>
      &nbsp;&nbsp;Apify: ${fmtUsd(cost.apifyTodayRealUsd)} real de ${fmtUsd(cost.apifyTodayGrossUsd)} bruto (${fmtUsd(cost.apifyTodayFreeUsd)} en capa gratuita)<br>
      <br>
      <b>Mes a la fecha:</b> $${monthRealTotal.toFixed(2)} de $${cost.monthlyBudgetUsd.toFixed(2)} (techo mensual)<br>
      &nbsp;&nbsp;Anthropic: $${cost.anthropicMonthUsd.toFixed(2)}<br>
      &nbsp;&nbsp;Apify: $${cost.apifyMonthRealUsd.toFixed(2)} real de $${cost.apifyMonthGrossUsd.toFixed(2)} bruto ($${cost.apifyMonthFreeUsd.toFixed(2)} en capa gratuita de $${APIFY_FREE_TIER_USD}/mes, no cobrado)<br>
      &nbsp;&nbsp;<span style="${cost.apifyMonthGrossUsd >= APIFY_FREE_TIER_USD ? "color:#b3261e;font-weight:600;" : "color:#666;"}">${escapeHtml(apifyLimitStatusLine(cost))}</span>
    </p>

    <h2 style="font-size:14px;text-transform:uppercase;letter-spacing:0.04em;color:#888;margin:24px 0 10px;border-bottom:1px solid #e2e0da;padding-bottom:6px;">Detalle por evento</h2>
    ${detailHtml || "<p>(sin candidatos hoy)</p>"}
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
