import { Resend } from "resend";
import { shortRegionName } from "./regionNames.js";

const GITHUB_API = "https://api.github.com";
const BUDGET_ALERT_LABEL = "budget-alert";

// Same recipient/domain pattern as apps/web's contact route
// (apps/web/src/app/api/contact/route.ts) — caldearte.com is already a
// verified Resend sending domain as of the production launch.
export const RUN_SUMMARY_RECIPIENT = "daniel@probablespa.cl";

interface FlagBudgetExceededInput {
  spend: number;
  budget: number;
}

// Opens a GitHub issue when the monthly budget ceiling is hit, so it's
// visible without checking Action logs. GITHUB_TOKEN/GITHUB_REPOSITORY are
// auto-provided inside a GitHub Action — no new secret needed. No-ops (with
// a warning) when run outside an Action, e.g. locally or in tests.
export async function flagBudgetExceeded({ spend, budget }: FlagBudgetExceededInput): Promise<void> {
  const token = process.env.GITHUB_TOKEN;
  const repo = process.env.GITHUB_REPOSITORY;

  if (!token || !repo) {
    console.warn(
      "flagBudgetExceeded: GITHUB_TOKEN/GITHUB_REPOSITORY not set — skipping GitHub issue (expected outside a GitHub Action).",
    );
    return;
  }

  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "Content-Type": "application/json",
  };

  // Don't spam a new issue every run — only create one if none is open yet.
  const existing = await fetch(
    `${GITHUB_API}/repos/${repo}/issues?state=open&labels=${BUDGET_ALERT_LABEL}`,
    { headers },
  );

  if (!existing.ok) {
    throw new Error(
      `Failed to check for existing budget-alert issues: ${existing.status} ${await existing.text()}`,
    );
  }

  const openIssues = (await existing.json()) as unknown[];
  if (openIssues.length > 0) {
    return;
  }

  const body = [
    `El gasto estimado de este mes ($${spend.toFixed(2)}) alcanzó o superó el techo configurado ($${budget.toFixed(2)}).`,
    "",
    "La activación de regiones nuevas está pausada hasta que se suba el techo.",
    "",
    "Para subir el techo: `update system_config set value = '<nuevo monto>' where key = 'monthly_budget_usd';`",
    "",
    "Cerrá este issue una vez que hayas decidido qué hacer.",
  ].join("\n");

  const created = await fetch(`${GITHUB_API}/repos/${repo}/issues`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      title: "🚦 Techo de gasto mensual alcanzado — expansión de regiones pausada",
      body,
      labels: [BUDGET_ALERT_LABEL],
    }),
  });

  if (!created.ok) {
    throw new Error(`Failed to create budget-alert issue: ${created.status} ${await created.text()}`);
  }
}

// Lean projection of EventCandidate — only what's worth showing in the
// summary email's per-event table. Kept separate from EventCandidate
// itself so notify.ts doesn't need to import the full discover.ts type
// (dateQuote/locationQuote/etc grounding fields are irrelevant here, and
// bright-source candidates never populate them at all).
// What actually happened after curation — see run.ts's own InsertOutcome
// doc comment for the real bug this fixes: the email used to show only
// `status` (Haiku's "is this real art" verdict), so a row marked "✅
// Aprobado" looked identical whether it became a NEW event on the site or
// was silently recognized as a duplicate of one already there. Optional/
// null because rejected candidates never reach insertCandidates at all —
// there's nothing to report beyond `status` for those.
export type CandidateOutcome = "inserted" | "replaced" | "duplicate_skipped" | "axis_blocked" | "expired" | "insert_failed";

export interface CandidateSummary {
  title: string;
  status: "approved" | "rejected";
  location: string;
  placeName: string | null;
  runStartDate: string | null;
  runEndDate: string | null;
  curationReasoning: string;
  sourceUrl: string | null;
  outcome: CandidateOutcome | null;
}

// One row per comuna searched or bright source fetched — lets the email
// group the event table the same way the run itself is organized, instead
// of one flat undifferentiated list.
export interface EventGroup {
  label: string; // unit.name for a comuna, source URL for a bright source
  candidates: CandidateSummary[];
}

export interface RunSummary {
  startedAt: Date;
  units: { total: number; failed: string[] };
  comunas: string[]; // unit.name for every unit attempted this run
  brightSources: { due: number; total: number };
  candidates: {
    total: number;
    approvedByCuration: number; // status === "approved" in allCandidates (Haiku's judgment)
    rejectedByCuration: number; // status === "rejected" in allCandidates
    insertedCount: number; // actually written to `events` (excludes stale/duplicate-filtered)
    byMediumType: Record<string, number>;
    sensitivityTagged: number;
  };
  eventGroups: EventGroup[];
  cost: {
    anthropicUsd: number;
    tavilyCredits: number;
    tavilyUsd: number;
    totalUsd: number;
    monthToDateUsd: number;
    monthlyBudgetUsd: number;
  };
}

export function fmtUsd(n: number): string {
  return `$${n.toFixed(4)}`;
}

function fmtDateRange(c: CandidateSummary): string {
  if (c.runStartDate && c.runEndDate) return `${c.runStartDate} – ${c.runEndDate}`;
  if (c.runStartDate) return `desde ${c.runStartDate}`;
  return "—";
}

// s is typed as string at every call site, but CandidateSummary's fields
// (location in particular — see instagram-item.ts's BrightSourceItem.location
// doc comment: an IG account with no fixedLocation and a caption Haiku
// can't place produces a genuinely null location that survives to here)
// aren't actually guaranteed non-null at runtime. Real production crash
// 2026-08-30: a null location reached here via daily-digest.ts and killed
// the whole digest send.
export function escapeHtml(s: string | null | undefined): string {
  if (s == null) return "";
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// Short, human label for the outcome badge — distinguishes "genuinely new
// on the site" from every other approved-but-not-added case, so skimming
// the ✅ column no longer overstates how many events actually showed up.
// `emoji` and `text` kept separate so the plain-text email can render
// "[APROBADO (NUEVO)]" without carrying the emoji glyph along.
function outcomeParts(c: CandidateSummary): { emoji: string; text: string } {
  if (c.status !== "approved") return { emoji: "❌", text: "Rechazado" };
  switch (c.outcome) {
    case "inserted":
      return { emoji: "✅", text: "Aprobado (nuevo)" };
    case "replaced":
      return { emoji: "🔁", text: "Aprobado (actualizó existente)" };
    case "duplicate_skipped":
      return { emoji: "🔁", text: "Aprobado (ya existía)" };
    case "axis_blocked":
      return { emoji: "🚫", text: "No publicado (otra fuente lo rechaza por un eje)" };
    case "expired":
      return { emoji: "⏳", text: "Aprobado (fecha ya pasada)" };
    case "insert_failed":
      return { emoji: "⚠️", text: "Aprobado (error al guardar)" };
    default:
      // No outcome recorded (older data, or a caller that never wired
      // insertCandidates' result through) — same posture as before this
      // fix, no worse than the old behavior.
      return { emoji: "✅", text: "Aprobado" };
  }
}

// Plain-text fallback for the per-source event tables — every email is
// sent with both `text` and `html` (Resend requires at least one; both are
// set so text-only clients still get the full event list, not just a
// pointer to the HTML version).
export function buildEventGroupsText(eventGroups: EventGroup[]): string[] {
  if (eventGroups.length === 0) return [];

  const lines: string[] = [];
  for (const group of eventGroups) {
    if (group.candidates.length === 0) continue;
    lines.push(`-- ${group.label} (${group.candidates.length}) --`);
    for (const c of group.candidates) {
      const icon = outcomeParts(c).text.toUpperCase();
      const place = c.placeName ? `${c.placeName}, ${c.location}` : c.location;
      lines.push(`  [${icon}] ${c.title} — ${place} — ${fmtDateRange(c)}`);
      lines.push(`    ${c.curationReasoning}`);
    }
    lines.push("");
  }
  return lines;
}

// HTML counterpart — one table per source group, aprobados y rechazados
// juntos, motivo de curatoría visible para poder auditar el criterio de
// Haiku (o el filtro de código) sin ir a buscar los logs.
export function buildEventGroupsHtml(eventGroups: EventGroup[]): string {
  const nonEmptyGroups = eventGroups.filter((g) => g.candidates.length > 0);
  if (nonEmptyGroups.length === 0) return "";

  const tables = nonEmptyGroups
    .map((group) => {
      const rows = group.candidates
        .map((c) => {
          const { emoji, text } = outcomeParts(c);
          const isNewOrRejected = c.status !== "approved" || c.outcome === "inserted" || c.outcome === null;
          const statusCell = `<td style="color:${isNewOrRejected ? (c.status === "approved" ? "#1a7f37" : "#b3261e") : "#8a6d1a"};font-weight:600;white-space:nowrap;">${emoji} ${escapeHtml(text)}</td>`;
          const titleCell = c.sourceUrl
            ? `<a href="${escapeHtml(c.sourceUrl)}" style="color:inherit;font-weight:500;">${escapeHtml(c.title)}</a>`
            : escapeHtml(c.title);
          const place = c.placeName ? `${escapeHtml(c.placeName)}<br><span style="color:#888;font-size:12px;">${escapeHtml(c.location)}</span>` : escapeHtml(c.location);
          return `<tr>
            ${statusCell}
            <td style="padding:8px;border-bottom:1px solid #efeee9;">${titleCell}</td>
            <td style="padding:8px;border-bottom:1px solid #efeee9;">${place}</td>
            <td style="padding:8px;border-bottom:1px solid #efeee9;white-space:nowrap;">${escapeHtml(fmtDateRange(c))}</td>
            <td style="padding:8px;border-bottom:1px solid #efeee9;color:#555;font-size:12px;">${escapeHtml(c.curationReasoning)}</td>
          </tr>`;
        })
        .join("");

      return `<h2 style="font-size:14px;text-transform:uppercase;letter-spacing:0.04em;color:#888;margin:24px 0 10px;border-bottom:1px solid #e2e0da;padding-bottom:6px;">${escapeHtml(group.label)} (${group.candidates.length})</h2>
      <table style="width:100%;border-collapse:collapse;font-size:13px;">
        <tr>
          <th style="text-align:left;padding:6px 8px;color:#888;border-bottom:1px solid #e2e0da;">Estado</th>
          <th style="text-align:left;padding:6px 8px;color:#888;border-bottom:1px solid #e2e0da;">Título</th>
          <th style="text-align:left;padding:6px 8px;color:#888;border-bottom:1px solid #e2e0da;">Ubicación</th>
          <th style="text-align:left;padding:6px 8px;color:#888;border-bottom:1px solid #e2e0da;">Fechas</th>
          <th style="text-align:left;padding:6px 8px;color:#888;border-bottom:1px solid #e2e0da;">Motivo / razón</th>
        </tr>
        ${rows}
      </table>`;
    })
    .join("");

  return tables;
}

// Exported (not just used internally) so tests can assert on exact content
// without stubbing the Resend client or making any network call.
export function buildSubject(summary: RunSummary): string {
  const dateStr = summary.startedAt.toISOString().slice(0, 10).split("-").reverse().join("/");
  return `Caldearte — resumen de Event Discovery (${dateStr}, ${summary.comunas.length} comunas)`;
}

export function buildBody(summary: RunSummary): string {
  const { units, comunas, brightSources, candidates, cost } = summary;

  const lines = [
    `Resumen de la corrida de Event Discovery — ${summary.startedAt.toISOString()}`,
    "",
    `COMUNAS CONSULTADAS (${comunas.length})`,
    comunas.length > 0 ? comunas.join(", ") : "(ninguna debida esta corrida)",
    "",
    "FUENTES BRILLANTES",
    `${brightSources.due} de ${brightSources.total} debidas esta corrida (ciclo de 14 días)`,
    "",
    "UNIDADES FALLIDAS",
    units.failed.length > 0
      ? `${units.failed.length}: ${units.failed.join(", ")} (quedan pendientes para la próxima corrida)`
      : "(ninguna)",
    "",
    "EVENTOS",
    `Total candidatos: ${candidates.total}`,
    `Aprobados por curatoría: ${candidates.approvedByCuration}`,
    `Rechazados por curatoría: ${candidates.rejectedByCuration}`,
    `Insertados en el calendario: ${candidates.insertedCount}`,
    `Con tag de sensibilidad: ${candidates.sensitivityTagged}`,
    "",
    "Por tipo de medio:",
    ...Object.entries(candidates.byMediumType).map(([type, count]) => `  ${type}: ${count}`),
    "",
    "COSTO ESTIMADO DE ESTA CORRIDA",
    `Anthropic (Haiku): ${fmtUsd(cost.anthropicUsd)}`,
    `Tavily (${cost.tavilyCredits} créditos × $0.008): ${fmtUsd(cost.tavilyUsd)}`,
    `Total: ${fmtUsd(cost.totalUsd)}`,
    "",
    "GASTO DEL MES A LA FECHA",
    `$${cost.monthToDateUsd.toFixed(2)} de $${cost.monthlyBudgetUsd.toFixed(2)} (techo mensual, system_config.monthly_budget_usd)`,
    "",
    ...buildEventGroupsText(summary.eventGroups),
  ];

  return lines.join("\n");
}

// HTML counterpart of buildBody — same figures up top, then one table per
// comuna/bright-source with every candidate (aprobados y rechazados).
export function buildHtmlBody(summary: RunSummary): string {
  const { units, comunas, brightSources, candidates, cost } = summary;

  return `<div style="font-family:-apple-system,Helvetica,Arial,sans-serif;max-width:720px;margin:0 auto;color:#1a1a1a;">
    <h1 style="font-size:18px;margin:0 0 4px;">Caldearte — resumen de Event Discovery</h1>
    <p style="font-size:13px;color:#666;margin:0 0 20px;">${escapeHtml(summary.startedAt.toISOString())}</p>

    <p><b>Comunas consultadas (${comunas.length}):</b> ${comunas.length > 0 ? escapeHtml(comunas.join(", ")) : "(ninguna debida esta corrida)"}</p>
    <p><b>Fuentes brillantes:</b> ${brightSources.due} de ${brightSources.total} debidas esta corrida</p>
    <p><b>Unidades fallidas:</b> ${units.failed.length > 0 ? `${units.failed.length}: ${escapeHtml(units.failed.join(", "))}` : "(ninguna)"}</p>

    <p>
      <b>${candidates.total}</b> candidatos totales &middot;
      <b>${candidates.approvedByCuration}</b> aprobados &middot;
      <b>${candidates.rejectedByCuration}</b> rechazados &middot;
      <b>${candidates.insertedCount}</b> insertados &middot;
      <b>${candidates.sensitivityTagged}</b> con sensibilidad
    </p>

    ${buildEventGroupsHtml(summary.eventGroups)}

    <h2 style="font-size:14px;text-transform:uppercase;letter-spacing:0.04em;color:#888;margin:24px 0 10px;border-bottom:1px solid #e2e0da;padding-bottom:6px;">Costo</h2>
    <p>
      Anthropic (Haiku): ${fmtUsd(cost.anthropicUsd)}<br>
      Tavily (${cost.tavilyCredits} créditos × $0.008): ${fmtUsd(cost.tavilyUsd)}<br>
      Total corrida: ${fmtUsd(cost.totalUsd)}<br>
      Mes a la fecha: $${cost.monthToDateUsd.toFixed(2)} de $${cost.monthlyBudgetUsd.toFixed(2)}
    </p>
  </div>`;
}

// Ancillary — sent as the very last step of a run, must never throw (a
// failed email must not fail an otherwise-successful run). Every figure in
// `summary` was already computed from data the run fetches regardless
// (usage/credits already returned by curate()/searchUnitFn calls), so this
// adds no Anthropic/Tavily cost — only one Resend send per run.
export async function sendRunSummaryEmail(summary: RunSummary): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.warn(
      "sendRunSummaryEmail: RESEND_API_KEY not set — skipping run-summary email (expected outside CI or before the secret is configured).",
    );
    return;
  }

  const resend = new Resend(apiKey);
  const { error } = await resend.emails.send({
    from: "Caldearte <contacto@caldearte.com>",
    to: RUN_SUMMARY_RECIPIENT,
    subject: buildSubject(summary),
    text: buildBody(summary),
    html: buildHtmlBody(summary),
  });

  if (error) {
    console.error("[notify] run-summary email send failed", error);
  }
}

// Sibling to RunSummary, not a reuse of it — this run has no comunas and no
// per-unit failures in the same sense (see
// headless-discovery/run.ts), so forcing those fields onto RunSummary
// would mean either fake zero values or an awkward optional. `candidates`/
// `cost`/`eventGroups` share RunSummary's exact shape since those figures
// mean the same thing regardless of which run produced them.
export interface HeadlessRunSummary {
  startedAt: Date;
  sourcesFetched: string[]; // URLs of the headless sources due this run
  candidates: RunSummary["candidates"];
  eventGroups: EventGroup[];
  cost: RunSummary["cost"];
}

export function buildHeadlessSubject(summary: HeadlessRunSummary): string {
  const dateStr = summary.startedAt.toISOString().slice(0, 10).split("-").reverse().join("/");
  return `Caldearte — resumen de fuentes brillantes (headless) (${dateStr}, ${summary.sourcesFetched.length} fuente(s))`;
}

export function buildHeadlessBody(summary: HeadlessRunSummary): string {
  const { sourcesFetched, candidates, cost } = summary;

  const lines = [
    `Resumen de la corrida de fuentes brillantes (navegador headless) — ${summary.startedAt.toISOString()}`,
    "",
    `FUENTES CONSULTADAS (${sourcesFetched.length})`,
    sourcesFetched.length > 0 ? sourcesFetched.join(", ") : "(ninguna debida esta corrida)",
    "",
    "EVENTOS",
    `Total candidatos: ${candidates.total}`,
    `Aprobados por curatoría: ${candidates.approvedByCuration}`,
    `Rechazados por curatoría: ${candidates.rejectedByCuration}`,
    `Insertados en el calendario: ${candidates.insertedCount}`,
    `Con tag de sensibilidad: ${candidates.sensitivityTagged}`,
    "",
    "Por tipo de medio:",
    ...Object.entries(candidates.byMediumType).map(([type, count]) => `  ${type}: ${count}`),
    "",
    "COSTO ESTIMADO DE ESTA CORRIDA",
    `Anthropic (Haiku): ${fmtUsd(cost.anthropicUsd)}`,
    `Total: ${fmtUsd(cost.totalUsd)}`,
    "",
    "GASTO DEL MES A LA FECHA",
    `$${cost.monthToDateUsd.toFixed(2)} de $${cost.monthlyBudgetUsd.toFixed(2)} (techo mensual, system_config.monthly_budget_usd)`,
    "",
    ...buildEventGroupsText(summary.eventGroups),
  ];

  return lines.join("\n");
}

// HTML counterpart of buildHeadlessBody.
export function buildHeadlessHtmlBody(summary: HeadlessRunSummary): string {
  const { sourcesFetched, candidates, cost } = summary;

  return `<div style="font-family:-apple-system,Helvetica,Arial,sans-serif;max-width:720px;margin:0 auto;color:#1a1a1a;">
    <h1 style="font-size:18px;margin:0 0 4px;">Caldearte — resumen de fuentes brillantes (headless)</h1>
    <p style="font-size:13px;color:#666;margin:0 0 20px;">${escapeHtml(summary.startedAt.toISOString())}</p>

    <p><b>Fuentes consultadas (${sourcesFetched.length}):</b> ${sourcesFetched.length > 0 ? escapeHtml(sourcesFetched.join(", ")) : "(ninguna debida esta corrida)"}</p>

    <p>
      <b>${candidates.total}</b> candidatos totales &middot;
      <b>${candidates.approvedByCuration}</b> aprobados &middot;
      <b>${candidates.rejectedByCuration}</b> rechazados &middot;
      <b>${candidates.insertedCount}</b> insertados &middot;
      <b>${candidates.sensitivityTagged}</b> con sensibilidad
    </p>

    ${buildEventGroupsHtml(summary.eventGroups)}

    <h2 style="font-size:14px;text-transform:uppercase;letter-spacing:0.04em;color:#888;margin:24px 0 10px;border-bottom:1px solid #e2e0da;padding-bottom:6px;">Costo</h2>
    <p>
      Anthropic (Haiku): ${fmtUsd(cost.anthropicUsd)}<br>
      Total corrida: ${fmtUsd(cost.totalUsd)}<br>
      Mes a la fecha: $${cost.monthToDateUsd.toFixed(2)} de $${cost.monthlyBudgetUsd.toFixed(2)}
    </p>
  </div>`;
}

// Same defensive posture as sendRunSummaryEmail: ancillary, last step,
// must never throw.
export async function sendHeadlessRunSummaryEmail(summary: HeadlessRunSummary): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.warn(
      "sendHeadlessRunSummaryEmail: RESEND_API_KEY not set — skipping run-summary email (expected outside CI or before the secret is configured).",
    );
    return;
  }

  const resend = new Resend(apiKey);
  const { error } = await resend.emails.send({
    from: "Caldearte <contacto@caldearte.com>",
    to: RUN_SUMMARY_RECIPIENT,
    subject: buildHeadlessSubject(summary),
    text: buildHeadlessBody(summary),
    html: buildHeadlessHtmlBody(summary),
  });

  if (error) {
    console.error("[notify] headless run-summary email send failed", error);
  }
}

// Instagram bright sources (2026-08-12, see
// instagram-discovery/run.ts) — same shape as HeadlessRunSummary
// (sourcesFetched holds account usernames here, not URLs), kept as its
// own type/functions rather than reused as-is so the subject/body read
// correctly as Instagram, not "(headless)".
export interface InstagramRunSummary {
  startedAt: Date;
  sourcesFetched: string[]; // Instagram usernames due this run
  candidates: RunSummary["candidates"];
  eventGroups: EventGroup[];
  cost: RunSummary["cost"];
  // Set when the Apify call itself failed (e.g. "Monthly usage hard limit
  // exceeded") — distinguishes "genuinely nothing new" from "we didn't
  // actually get to check anything." See apify-instagram.ts's own doc
  // comment.
  apifyError: string | null;
}

export function buildInstagramSubject(summary: InstagramRunSummary): string {
  const dateStr = summary.startedAt.toISOString().slice(0, 10).split("-").reverse().join("/");
  return `Caldearte — resumen de fuentes brillantes (Instagram) (${dateStr}, ${summary.sourcesFetched.length} cuenta(s))`;
}

export function buildInstagramBody(summary: InstagramRunSummary): string {
  const { sourcesFetched, candidates, cost } = summary;

  const lines = [
    `Resumen de la corrida de fuentes brillantes (Instagram, vía Apify) — ${summary.startedAt.toISOString()}`,
    "",
    `CUENTAS CONSULTADAS (${sourcesFetched.length})`,
    sourcesFetched.length > 0 ? sourcesFetched.join(", ") : "(ninguna debida esta corrida)",
    "",
    "EVENTOS",
    `Total candidatos: ${candidates.total}`,
    `Aprobados por curatoría: ${candidates.approvedByCuration}`,
    `Rechazados por curatoría: ${candidates.rejectedByCuration}`,
    `Insertados en el calendario: ${candidates.insertedCount}`,
    `Con tag de sensibilidad: ${candidates.sensitivityTagged}`,
    "",
    "Por tipo de medio:",
    ...Object.entries(candidates.byMediumType).map(([type, count]) => `  ${type}: ${count}`),
    "",
    "COSTO ESTIMADO DE ESTA CORRIDA",
    `Anthropic (Haiku): ${fmtUsd(cost.anthropicUsd)}`,
    `Total: ${fmtUsd(cost.totalUsd)}`,
    "(el gasto de Apify no se registra acá — se vigila desde su propio dashboard)",
    "",
    "GASTO DEL MES A LA FECHA (Anthropic)",
    `$${cost.monthToDateUsd.toFixed(2)} de $${cost.monthlyBudgetUsd.toFixed(2)} (techo mensual, system_config.monthly_budget_usd)`,
    "",
    ...buildEventGroupsText(summary.eventGroups),
  ];

  return lines.join("\n");
}

// HTML counterpart of buildInstagramBody.
export function buildInstagramHtmlBody(summary: InstagramRunSummary): string {
  const { sourcesFetched, candidates, cost } = summary;

  return `<div style="font-family:-apple-system,Helvetica,Arial,sans-serif;max-width:720px;margin:0 auto;color:#1a1a1a;">
    <h1 style="font-size:18px;margin:0 0 4px;">Caldearte — resumen de fuentes brillantes (Instagram)</h1>
    <p style="font-size:13px;color:#666;margin:0 0 20px;">${escapeHtml(summary.startedAt.toISOString())}</p>

    <p><b>Cuentas consultadas (${sourcesFetched.length}):</b> ${sourcesFetched.length > 0 ? escapeHtml(sourcesFetched.join(", ")) : "(ninguna debida esta corrida)"}</p>

    <p>
      <b>${candidates.total}</b> candidatos totales &middot;
      <b>${candidates.approvedByCuration}</b> aprobados &middot;
      <b>${candidates.rejectedByCuration}</b> rechazados &middot;
      <b>${candidates.insertedCount}</b> insertados &middot;
      <b>${candidates.sensitivityTagged}</b> con sensibilidad
    </p>

    ${buildEventGroupsHtml(summary.eventGroups)}

    <h2 style="font-size:14px;text-transform:uppercase;letter-spacing:0.04em;color:#888;margin:24px 0 10px;border-bottom:1px solid #e2e0da;padding-bottom:6px;">Costo</h2>
    <p>
      Anthropic (Haiku): ${fmtUsd(cost.anthropicUsd)}<br>
      Total corrida: ${fmtUsd(cost.totalUsd)} <span style="color:#888;">(gasto de Apify no incluido — ver su propio dashboard)</span><br>
      Mes a la fecha (Anthropic): $${cost.monthToDateUsd.toFixed(2)} de $${cost.monthlyBudgetUsd.toFixed(2)}
    </p>
  </div>`;
}

// Same defensive posture as sendRunSummaryEmail: ancillary, last step,
// must never throw.
export async function sendInstagramRunSummaryEmail(summary: InstagramRunSummary): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.warn(
      "sendInstagramRunSummaryEmail: RESEND_API_KEY not set — skipping run-summary email (expected outside CI or before the secret is configured).",
    );
    return;
  }

  const resend = new Resend(apiKey);
  const { error } = await resend.emails.send({
    from: "Caldearte <contacto@caldearte.com>",
    to: RUN_SUMMARY_RECIPIENT,
    subject: buildInstagramSubject(summary),
    text: buildInstagramBody(summary),
    html: buildInstagramHtmlBody(summary),
  });

  if (error) {
    console.error("[notify] Instagram run-summary email send failed", error);
  }
}

// Google Alerts bright source (2026-08-14, see
// google-alerts-discovery/run.ts) — same shape as InstagramRunSummary,
// own type/functions so subject/body read correctly, not "(headless)"
// or "(Instagram)".
export interface GoogleAlertsRunSummary {
  startedAt: Date;
  candidates: RunSummary["candidates"];
  eventGroups: EventGroup[];
  cost: RunSummary["cost"];
}

export function buildGoogleAlertsSubject(summary: GoogleAlertsRunSummary): string {
  const dateStr = summary.startedAt.toISOString().slice(0, 10).split("-").reverse().join("/");
  return `Caldearte — resumen de fuentes brillantes (Google Alerts) (${dateStr})`;
}

export function buildGoogleAlertsBody(summary: GoogleAlertsRunSummary): string {
  const { candidates, cost } = summary;

  const lines = [
    `Resumen de la corrida de fuentes brillantes (Google Alerts) — ${summary.startedAt.toISOString()}`,
    "",
    "Feed consultado esta corrida.",
    "",
    "EVENTOS",
    `Total candidatos: ${candidates.total}`,
    `Aprobados por curatoría: ${candidates.approvedByCuration}`,
    `Rechazados por curatoría: ${candidates.rejectedByCuration}`,
    `Insertados en el calendario: ${candidates.insertedCount}`,
    `Con tag de sensibilidad: ${candidates.sensitivityTagged}`,
    "",
    "Por tipo de medio:",
    ...Object.entries(candidates.byMediumType).map(([type, count]) => `  ${type}: ${count}`),
    "",
    "COSTO ESTIMADO DE ESTA CORRIDA",
    `Anthropic (Haiku): ${fmtUsd(cost.anthropicUsd)}`,
    `Total: ${fmtUsd(cost.totalUsd)}`,
    "",
    "GASTO DEL MES A LA FECHA",
    `$${cost.monthToDateUsd.toFixed(2)} de $${cost.monthlyBudgetUsd.toFixed(2)} (techo mensual, system_config.monthly_budget_usd)`,
    "",
    ...buildEventGroupsText(summary.eventGroups),
  ];

  return lines.join("\n");
}

// HTML counterpart of buildGoogleAlertsBody.
export function buildGoogleAlertsHtmlBody(summary: GoogleAlertsRunSummary): string {
  const { candidates, cost } = summary;

  return `<div style="font-family:-apple-system,Helvetica,Arial,sans-serif;max-width:720px;margin:0 auto;color:#1a1a1a;">
    <h1 style="font-size:18px;margin:0 0 4px;">Caldearte — resumen de fuentes brillantes (Google Alerts)</h1>
    <p style="font-size:13px;color:#666;margin:0 0 20px;">${escapeHtml(summary.startedAt.toISOString())}</p>

    <p>Feed consultado esta corrida.</p>

    <p>
      <b>${candidates.total}</b> candidatos totales &middot;
      <b>${candidates.approvedByCuration}</b> aprobados &middot;
      <b>${candidates.rejectedByCuration}</b> rechazados &middot;
      <b>${candidates.insertedCount}</b> insertados &middot;
      <b>${candidates.sensitivityTagged}</b> con sensibilidad
    </p>

    ${buildEventGroupsHtml(summary.eventGroups)}

    <h2 style="font-size:14px;text-transform:uppercase;letter-spacing:0.04em;color:#888;margin:24px 0 10px;border-bottom:1px solid #e2e0da;padding-bottom:6px;">Costo</h2>
    <p>
      Anthropic (Haiku): ${fmtUsd(cost.anthropicUsd)}<br>
      Total corrida: ${fmtUsd(cost.totalUsd)}<br>
      Mes a la fecha: $${cost.monthToDateUsd.toFixed(2)} de $${cost.monthlyBudgetUsd.toFixed(2)}
    </p>
  </div>`;
}

// Same defensive posture as sendRunSummaryEmail: ancillary, last step,
// must never throw.
export async function sendGoogleAlertsRunSummaryEmail(summary: GoogleAlertsRunSummary): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.warn(
      "sendGoogleAlertsRunSummaryEmail: RESEND_API_KEY not set — skipping run-summary email (expected outside CI or before the secret is configured).",
    );
    return;
  }

  const resend = new Resend(apiKey);
  const { error } = await resend.emails.send({
    from: "Caldearte <contacto@caldearte.com>",
    to: RUN_SUMMARY_RECIPIENT,
    subject: buildGoogleAlertsSubject(summary),
    text: buildGoogleAlertsBody(summary),
    html: buildGoogleAlertsHtmlBody(summary),
  });

  if (error) {
    console.error("[notify] Google Alerts run-summary email send failed", error);
  }
}

export interface DigestEvent {
  id: string;
  title: string;
  placeName: string;
  comunaName: string | null;
  openingDatetime: string | null;
  // A source can confirm an opening DATE without confirming a specific
  // HOUR (see docs/data-model.md's opening_time_confirmed) — the digest
  // must never print a fabricated hour, same rule the site's own
  // EventCardBase already follows.
  openingTimeConfirmed: boolean;
  runEndDate: string | null;
  imageUrl: string | null;
  // Whether openingDatetime falls inside THIS digest's week — real bug
  // found 2026-07-31: an event whose opening was weeks ago but is still
  // running was labeled "Inauguración: <fecha pasada>" everywhere it
  // appeared (including "Expos para visitar" and "En otras regiones"),
  // reading as if it were opening soon. Only this flag, not the mere
  // presence of openingDatetime, may trigger that wording — see
  // fmtDigestDate below.
  isOpeningThisWeek: boolean;
}

export interface DigestSection {
  label: string;
  events: DigestEvent[];
  // Shown instead of a card list when events is empty but the section
  // still renders — real feedback: a silently-omitted section reads as a
  // bug ("did this break?"), an explicit "nothing yet" reads as honest.
  emptyMessage?: string;
  // "Ver las N exposiciones en cartelera en Santiago" — a compact
  // section's whole line, or a button under a card section.
  moreLink?: { label: string; url: string };
  // Renders as one small line (its moreLink, or its emptyMessage) instead
  // of the cards — Daniel 2026-09-27: the digest should read as
  // "exclusivo de inauguraciones" primarily, with visitas guiadas and
  // exposiciones vigentes demoted to a number readers can act on (click
  // through) rather than a full listing competing for the same attention.
  // `events` is still populated as usual for a compact section — only its
  // length is used, no per-event card is rendered.
  compact?: boolean;
}

// Same wall-clock formatting as apps/web/src/lib/date.ts's fmtOpeningHour
// — duplicated rather than imported since apps/curator and apps/web are
// separate packages with no shared runtime lib for this.
function fmtHourSantiago(openingDatetimeIso: string): string {
  const parts = new Intl.DateTimeFormat("es-CL", {
    timeZone: "America/Santiago",
    hour: "numeric",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date(openingDatetimeIso));
  const hour = parts.find((p) => p.type === "hour")?.value ?? "";
  const minute = parts.find((p) => p.type === "minute")?.value ?? "00";
  return minute === "00" ? `${hour} hr` : `${hour}:${minute} hr`;
}

const MONTHS_ES = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];

// "5 de agosto" normally, "5 de agosto de 2027" only when the date's own
// year differs from referenceYear — real feedback: bare ISO (2026-08-05)
// read as cold/technical. Year is dropped in the common case (almost
// every event falls in the digest's own send year) but kept whenever it
// wouldn't otherwise be inferable, since this text also lives on in an
// inbox read weeks or months later.
function fmtDateEs(dateStr: string, referenceYear: number): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const base = `${d} de ${MONTHS_ES[m - 1]}`;
  return y === referenceYear ? base : `${base} de ${y}`;
}

function fmtDigestDate(e: DigestEvent, referenceYear: number): string {
  // Only an opening happening THIS week reads as "Inauguración:" — an
  // event that opened weeks ago (even with openingDatetime set) is just
  // still running, and should read "Hasta el <fecha>" like any other
  // ongoing show, not as if it were opening soon.
  if (e.isOpeningThisWeek && e.openingDatetime) {
    const dateLabel = fmtDateEs(e.openingDatetime.slice(0, 10), referenceYear);
    return e.openingTimeConfirmed ? `Inauguración: ${dateLabel} · ${fmtHourSantiago(e.openingDatetime)}` : `Inauguración: ${dateLabel}`;
  }
  if (e.runEndDate) return `Hasta el ${fmtDateEs(e.runEndDate, referenceYear)}`;
  return "";
}

// "27 de julio al 2 de agosto 2026" — same "same month collapses" rule as
// apps/web/src/lib/date.ts's fmtWeekHeader (duplicated, not imported —
// separate packages), plus the year, which the site's own header omits
// (always "this week" there) but an email read days or weeks later
// shouldn't have to guess.
function fmtWeekHeaderEs(weekStart: string, weekEnd: string): string {
  const [sy, sm, sd] = weekStart.split("-").map(Number);
  const [ey, em, ed] = weekEnd.split("-").map(Number);
  const range = sm === em ? `${sd} al ${ed} de ${MONTHS_ES[sm - 1]}` : `${sd} de ${MONTHS_ES[sm - 1]} al ${ed} de ${MONTHS_ES[em - 1]}`;
  return `${range} ${ey}`;
}

// "Jue 22 al dom 25 oct" — the header's first pill (the edition runs
// Thursday to Sunday since 2026-10-18), short enough to share a
// phone-width line with the región pill. No year: read at a glance.
function fmtWeekLine(weekStart: string, weekEnd: string): string {
  const day = (dateStr: string) => {
    const [y, m, d] = dateStr.split("-").map(Number);
    return { weekday: WEEKDAYS_ES[new Date(Date.UTC(y, m - 1, d)).getUTCDay()].slice(0, 3), d, month: MONTHS_SHORT_ES[m - 1] };
  };
  const s = day(weekStart);
  const e = day(weekEnd);
  const startMonth = s.month === e.month ? "" : ` ${s.month}`;
  const label = `${s.weekday} ${s.d}${startMonth} al ${e.weekday} ${e.d} ${e.month}`;
  return label.charAt(0).toUpperCase() + label.slice(1);
}

const SITE_URL = "https://www.caldearte.com";
// @caldearte.oficial — same handle used throughout
// apps/curator/src/lib/instagram-accounts.ts.
const INSTAGRAM_URL = "https://www.instagram.com/caldearte.oficial/";

function eventUrl(id: string): string {
  return `${SITE_URL}/eventos/${id}`;
}

// Points at our own /newsletter/baja page, not the Edge Function's URL
// directly — Supabase Edge Functions can't serve real HTML (a text/html
// GET response gets silently rewritten to text/plain by the platform), so
// the page calls newsletter-unsubscribe server-side and renders a proper
// result instead. Same fixed site origin apps/web already hardcodes in
// sitemap.ts/robots.ts/layout.tsx.
function unsubscribeUrl(unsubscribeToken: string): string {
  return `https://www.caldearte.com/newsletter/baja?token=${encodeURIComponent(unsubscribeToken)}`;
}

const WEEKDAYS_ES = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
const MONTHS_SHORT_ES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

function santiagoDateOf(iso: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Santiago" }).format(new Date(iso)); // YYYY-MM-DD
}

// "Viernes 23" — same day heading as the site's agenda (apps/web's
// fmtAgendaDay, minus its Hoy/Mañana, which an email read later can't use).
function fmtDayHeading(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const weekday = WEEKDAYS_ES[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
  return `${weekday.charAt(0).toUpperCase()}${weekday.slice(1)} ${d}`;
}

// Cards are grouped by day, like the site's agenda (2026-10-18 — was by
// comuna; the comuna now rides in each card's pill, as on the site). An
// event with no opening date this weekend falls back to its comuna.
// Day groups first, in date order; comuna groups after, alphabetically.
function groupForCards(events: DigestEvent[]): Array<{ label: string; date: string | null; events: DigestEvent[] }> {
  const groups = new Map<string, { sortKey: string; date: string | null; events: DigestEvent[] }>();
  for (const e of events) {
    const date = e.isOpeningThisWeek && e.openingDatetime ? santiagoDateOf(e.openingDatetime) : null;
    const label = date ? fmtDayHeading(date) : (e.comunaName ?? "Otras comunas");
    const sortKey = date ? `0${date}` : `1${label}`;
    if (!groups.has(label)) groups.set(label, { sortKey, date, events: [] });
    groups.get(label)!.events.push(e);
  }
  return Array.from(groups.entries())
    .sort(([, a], [, b]) => a.sortKey.localeCompare(b.sortKey))
    .map(([label, g]) => ({ label, date: g.date, events: [...g.events].sort((a, b) => (a.openingDatetime ?? "").localeCompare(b.openingDatetime ?? "")) }));
}

// Includes the week's date range so the subject is unique week to week —
// real feedback: Gmail (and most webmail) threads messages that share an
// identical subject line sent close together, and the event count alone
// can coincidentally repeat between two consecutive weeks.
// Newsletter — weekly digest, one email per confirmed subscriber. Section
// content (which events go where) is decided by
// apps/curator/src/newsletter/run.ts's buildDigestSections — this file
// only formats whatever sections it's handed and never omits a non-empty
// one, matching the product decision that empty sections are dropped
// upstream, not hidden here.
//
// Leads with the number of openings (2026-10-16): "12 inauguraciones de
// jueves a domingo en Santiago" says in the inbox what's inside, which
// "tu semana en arte (N expos)" didn't.
export function buildDigestSubject(
  sections: DigestSection[],
  week?: { start: string; end: string },
  regionName: string | null = null,
): string {
  const openings = sections.find((s) => s.label === OPENINGS_LABEL)?.events.length ?? 0;
  const where = regionName ? ` en ${shortRegionName(regionName)}` : "";
  const dates = week ? `, ${fmtWeekHeaderEs(week.start, week.end)}` : "";
  const lead = openings > 0 ? `${openings} inauguraci${openings === 1 ? "ón" : "ones"} de jueves a domingo${where}` : `Arte de jueves a domingo${where}`;
  return `${lead} — Caldearte${dates}`;
}

// Anchors "same year → no year suffix" to the digest's own send week
// rather than the wall clock — deterministic for a given week param, and
// falls back to the real current year only when no week is supplied
// (e.g. an older/simplified caller).
function referenceYearFor(week?: { start: string }): number {
  return week ? Number(week.start.slice(0, 4)) : new Date().getFullYear();
}

// A compact section's one line: its link when there's something to click
// into, otherwise its empty message.
function compactLine(section: DigestSection): string {
  return section.moreLink?.label ?? section.emptyMessage ?? `${section.events.length} ${section.label.toLowerCase()}`;
}

export function buildDigestBody(
  sections: DigestSection[],
  unsubscribeToken: string,
  intro: string | null = null,
  week?: { start: string; end: string },
  regionName: string | null = null,
  dayNotes: Record<string, string> = {},
): string {
  const referenceYear = referenceYearFor(week);
  const lines: string[] = [SLOGAN];
  if (week) lines.push(fmtWeekHeaderEs(week.start, week.end));
  if (regionName) lines.push(shortRegionName(regionName));
  lines.push("");
  if (intro) {
    lines.push(intro);
    lines.push("");
  }
  for (const section of sections) {
    lines.push(`-- ${section.label} --`);
    // Compact sections (see DigestSection.compact) — just the one line,
    // no per-event listing, matching the HTML version.
    if (section.compact) {
      lines.push(section.moreLink ? `${compactLine(section)}: ${section.moreLink.url}` : compactLine(section));
      lines.push("");
      continue;
    }
    if (section.events.length === 0 && section.emptyMessage) {
      lines.push(section.emptyMessage);
    } else {
      for (const { label, date, events } of groupForCards(section.events)) {
        lines.push(`[${label}]`);
        if (date && dayNotes[date]) lines.push(dayNotes[date]);
        for (const e of events) {
          const date = fmtDigestDate(e, referenceYear);
          lines.push(`${e.title} — ${e.placeName}${date ? ` — ${date}` : ""}`);
          lines.push(`  ${eventUrl(e.id)}`);
        }
      }
    }
    if (section.moreLink) {
      lines.push(`${section.moreLink.label}: ${section.moreLink.url}`);
    }
    lines.push("");
  }
  lines.push("");
  lines.push(`Síguenos en Instagram y no te pierdas las entrevistas que le hacemos a algunos artistas en sus propias inauguraciones: ${INSTAGRAM_URL}`);
  lines.push("");
  lines.push(
    "Este es el boletín de Caldearte, un calendario de arte curado por inteligencia humana potenciada por IA. Te lo enviamos cada jueves porque te suscribiste para recibir las inauguraciones de jueves a domingo en tu región.",
  );
  lines.push(`Darse de baja: ${unsubscribeUrl(unsubscribeToken)}`);
  return lines.join("\n");
}

// Caldearte 2.0.0 brand tokens (apps/web/src/app/globals.css) — duplicated
// as plain hex here rather than imported, since apps/curator is a separate
// package and email HTML needs literal values anyway (no CSS variables in
// most email clients). Keep these in sync by hand if the site's palette
// ever changes.
const BRAND_MAGENTA = "#ff00fb";
const SURFACE_SAGE = "#d7dfe2";
const TEXT_PRIMARY = "#3d373d";
const TEXT_SECONDARY = "#767f82";
// The real site's own display-headline font (the CALDE/ARTE. wordmark,
// card titles and pills) is Lato Black — not a system font, so it needs an
// actual webfont load (see the <link> in buildDigestHtmlBody's <head>).
// Falls back to the same Helvetica/Arial stack used everywhere else in the
// email for any client that blocks the Google Fonts request.
const LATO_STACK = "'Lato',Helvetica,Arial,sans-serif";
// The site's slogan (esCL.home.tagline, under the wordmark) — replaced the
// email's own giant "GUIA INDEPENDIENTE DE ARTE." on 2026-10-18 (Daniel).
const SLOGAN = "EL ARTE MÁS CERCA";

// The openings label doubles as a big magenta heading, hand-broken into
// two lines like the site's own wordmarks ("CALDE"/"ARTE."). Any other
// non-compact section falls back to its plain label at the same size.
export const OPENINGS_LABEL = "Inauguraciones de jueves a domingo";
const SECTION_LABEL_LINES: Record<string, string[]> = {
  [OPENINGS_LABEL]: ["INAUGU", "RACIONES."],
};

// The card's magenta pill — same "COMUNA · DÍA · HORA" as the site's
// AgendaCard ("ÑUÑOA · SÁB 24 OCT · 20 HR", "HORA POR CONF." when the
// source gave no hour), or "COMUNA · HASTA EL 15 OCT" for a show already
// running.
function cardPill(e: DigestEvent, referenceYear: number): string {
  let when = "";
  if (e.isOpeningThisWeek && e.openingDatetime) {
    const [y, m, d] = santiagoDateOf(e.openingDatetime).split("-").map(Number);
    const weekday = WEEKDAYS_ES[new Date(Date.UTC(y, m - 1, d)).getUTCDay()].slice(0, 3);
    const hour = e.openingTimeConfirmed ? fmtHourSantiago(e.openingDatetime) : "hora por conf.";
    when = `${weekday} ${d} ${MONTHS_SHORT_ES[m - 1]} · ${hour}`;
  } else if (e.runEndDate) {
    const [y, m, d] = e.runEndDate.split("-").map(Number);
    when = `hasta el ${d} ${MONTHS_SHORT_ES[m - 1]}${y !== referenceYear ? ` '${String(y).slice(-2)}` : ""}`;
  }
  return [e.comunaName, when].filter(Boolean).join(" · ").toUpperCase();
}

// One row per event, the same on every screen size (2026-10-18, Daniel:
// a card the size of the phone's screen made the email a long scroll and
// didn't read as "there's a lot on"): a 4:5 thumbnail on the left, and on
// the right the title, the pill and the venue in the site's AgendaCard
// style (magenta Lato title, magenta pill, small grey uppercase venue).
// The whole row is one link to the event's page.
function eventCardHtml(e: DigestEvent, referenceYear: number): string {
  const pill = cardPill(e, referenceYear);
  const thumb = e.imageUrl
    ? `<img src="${escapeHtml(e.imageUrl)}" width="96" height="120" alt="" style="display:block;width:96px;height:120px;object-fit:cover;border-radius:8px;" />`
    : `<div style="width:96px;height:120px;background:#3a3a3a;border-radius:8px;"></div>`;
  return `<a href="${eventUrl(e.id)}" style="display:block;text-decoration:none;margin:0 0 10px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:16px;">
      <tr>
        <td width="106" valign="top" style="padding:10px 0 10px 10px;line-height:0;">${thumb}</td>
        <td valign="middle" style="padding:10px 14px;">
          <p style="margin:0;color:${BRAND_MAGENTA};font-family:${LATO_STACK};font-weight:900;font-size:16px;line-height:1.25;letter-spacing:0.3px;text-transform:uppercase;">${escapeHtml(e.title)}</p>
          ${pill ? `<p style="margin:8px 0 0;"><span style="display:inline-block;background:${BRAND_MAGENTA};color:#fff;border-radius:12px;padding:4px 10px;font-family:${LATO_STACK};font-weight:900;font-size:11px;line-height:1.35;letter-spacing:0.3px;">${escapeHtml(pill)}</span></p>` : ""}
          <p style="margin:8px 0 0;color:${TEXT_SECONDARY};font-size:11px;font-weight:600;line-height:1.25;letter-spacing:1px;text-transform:uppercase;">${escapeHtml(e.placeName)}</p>
        </td>
      </tr>
    </table>
  </a>`;
}

// A section's "ver más" link as a magenta button, the size of the site's
// own buttons (was a 38px underlined headline, 2026-10-18).
function moreLinkHtml(moreLink: { label: string; url: string } | undefined): string {
  if (!moreLink) return "";
  return `<p style="margin:20px 0 0;"><a href="${escapeHtml(moreLink.url)}" style="display:inline-block;background:${BRAND_MAGENTA};color:#fff;border-radius:999px;padding:12px 20px;font-family:${LATO_STACK};font-weight:900;font-size:14px;text-decoration:none;">${escapeHtml(moreLink.label)}</a></p>`;
}

// The site's header pills ("Esta semana ▾ en Santiago ▾"), without the
// dropdown arrow — the email's weekend and región.
function headerPill(text: string): string {
  return `<span style="display:inline-block;border:1px solid #b9c3c6;background:#e4eaec;border-radius:12px;padding:4px 10px;">${escapeHtml(text)}</span>`;
}

export function buildDigestHtmlBody(
  sections: DigestSection[],
  unsubscribeToken: string,
  intro: string | null = null,
  week?: { start: string; end: string },
  regionName: string | null = null,
  dayNotes: Record<string, string> = {},
): string {
  const referenceYear = referenceYearFor(week);
  const sectionsHtml = sections
    .map((section) => {
      // Compact sections (2026-09-27, Daniel: everything but inauguraciones
      // demoted to secondary) skip the cards and the big heading — just a
      // line, linked through when there's something to click into.
      if (section.compact) {
        const line = section.moreLink
          ? `<a href="${escapeHtml(section.moreLink.url)}" style="color:${TEXT_PRIMARY};font-weight:700;text-decoration:underline;">${escapeHtml(compactLine(section))}</a>`
          : escapeHtml(compactLine(section));
        return `<p style="margin:14px 0 0;font-size:16px;line-height:1.5;color:${TEXT_PRIMARY};">${line}</p>`;
      }

      const bodyHtml =
        section.events.length === 0 && section.emptyMessage
          ? `<p style="margin:14px 0 0;font-size:15px;color:${TEXT_SECONDARY};font-style:italic;">${escapeHtml(section.emptyMessage)}</p>`
          : groupForCards(section.events)
              .map(({ label, date, events }) => {
                // The day's own short AI paragraph (2026-10-18), between
                // its heading and its cards.
                const note = date && dayNotes[date] ? `<p style="margin:0 0 12px;font-size:16px;line-height:1.5;color:${TEXT_PRIMARY};">${escapeHtml(dayNotes[date])}</p>` : "";
                return `<p style="margin:22px 0 10px;font-family:${LATO_STACK};font-weight:900;font-size:20px;color:${TEXT_PRIMARY};">${escapeHtml(label)}</p>${note}${events.map((e) => eventCardHtml(e, referenceYear)).join("")}`;
              })
              .join("");

      const labelLines = SECTION_LABEL_LINES[section.label];
      const labelHtml = labelLines
        ? labelLines.map((line) => `<span style="display:block;">${escapeHtml(line)}</span>`).join("")
        : escapeHtml(section.label);
      return `<div style="margin:36px 0 0;">
      <h2 style="margin:0 0 8px;color:${BRAND_MAGENTA};font-family:${LATO_STACK};font-weight:900;font-size:44px;line-height:0.95;letter-spacing:0.01em;">${labelHtml}</h2>
      ${bodyHtml}
      ${moreLinkHtml(section.moreLink)}
      </div>`;
    })
    .join("");

  // One short paragraph since 2026-10-18 (Daniel: the AI wrote too much),
  // still split on blank lines in case the model adds one.
  const introHtml = intro
    ? intro
        .split(/\n\s*\n/)
        .map((p) => p.trim())
        .filter(Boolean)
        .map((p) => `<p style="margin:24px 0 0;font-size:17px;color:${TEXT_PRIMARY};line-height:1.55;">${escapeHtml(p)}</p>`)
        .join("")
    : "";

  const pills = [week ? headerPill(fmtWeekLine(week.start, week.end)) : null, regionName ? headerPill(shortRegionName(regionName)) : null].filter(Boolean);
  const pillsHtml = pills.length
    ? `<p style="margin:12px 0 0;color:${TEXT_PRIMARY};font-family:${LATO_STACK};font-weight:900;font-size:16px;line-height:2;">${pills.join(" en ")}</p>`
    : "";

  // Header like the site's own (2026-10-18): the CALDE/ARTE. wordmark, the
  // slogan under it, then the weekend and the región as the site's pills.
  // Sage page background, full-bleed magenta footer.
  return `<!doctype html>
<html lang="es-CL">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link href="https://fonts.googleapis.com/css2?family=Lato:wght@900&display=swap" rel="stylesheet" />
  </head>
  <body style="margin:0;padding:0;background:${SURFACE_SAGE};">
    <div style="font-family:Helvetica,Arial,sans-serif;max-width:600px;margin:0 auto;background:${SURFACE_SAGE};">
    <div style="padding:28px 20px 0;">
      <a href="${SITE_URL}" style="display:block;text-decoration:none;color:${BRAND_MAGENTA};font-family:${LATO_STACK};font-weight:900;font-size:56px;line-height:0.92;letter-spacing:0.01em;">
        <span style="display:block;">CALDE</span>
        <span style="display:block;">ARTE.</span>
      </a>
      <p style="margin:16px 0 0;color:${TEXT_PRIMARY};font-family:${LATO_STACK};font-weight:900;font-size:22px;line-height:1.1;">${SLOGAN}</p>
      ${pillsHtml}
      ${introHtml}
    </div>
    <div style="padding:0 20px 8px;">
      ${sectionsHtml}
    </div>
    <div style="padding:0 20px;">
      <!-- Contact prompt — same invitation the curatoría page makes. mailto:
           because the site's contact drawer has no URL to deep-link into. -->
      <p style="margin:48px 0 12px;font-size:16px;color:${TEXT_PRIMARY};line-height:1.55;">
        ¿Sientes que nos perdimos una exposición, o que clasificamos algo mal? ¿Estás por compartir tu propia obra con el mundo?
        <a href="mailto:contacto@caldearte.com" style="color:${BRAND_MAGENTA};font-weight:700;text-decoration:underline;">Escríbenos a contacto@caldearte.com</a>.
      </p>
      <p style="margin:0 0 12px;font-size:16px;color:${TEXT_PRIMARY};line-height:1.55;">
        Síguenos en Instagram y no te pierdas las entrevistas que le hacemos a algunos artistas en sus propias inauguraciones —
        <a href="${INSTAGRAM_URL}" style="color:${BRAND_MAGENTA};font-weight:700;text-decoration:underline;">@caldearte.oficial</a>.
      </p>
    </div>
    <div style="background:${BRAND_MAGENTA};color:${SURFACE_SAGE};padding:32px 20px;margin-top:40px;">
      <p style="margin:0;font-family:${LATO_STACK};font-weight:900;font-size:28px;letter-spacing:0.01em;color:${SURFACE_SAGE};">CALDEARTE.</p>
      <p style="margin:4px 0 16px;font-family:${LATO_STACK};font-weight:900;font-size:15px;color:${SURFACE_SAGE};">${SLOGAN}</p>
      <p style="margin:0 0 12px;font-size:12px;line-height:1.6;color:${SURFACE_SAGE};">
        Este es el boletín de Caldearte, un calendario de arte curado por inteligencia humana potenciada por IA. Te lo enviamos cada jueves porque te suscribiste para recibir las inauguraciones de jueves a domingo en tu región.
      </p>
      <a href="${unsubscribeUrl(unsubscribeToken)}" style="color:${SURFACE_SAGE};font-size:12px;text-decoration:underline;">Darse de baja</a>
    </div>
    </div>
  </body>
</html>`;
}

// Ancillary, same posture as sendEscalationEmail: a failed/skipped send
// never breaks the run — a missing RESEND_API_KEY just means that
// subscriber doesn't get this week's digest, logged loudly since it's the
// only way anyone notices.
export async function sendDigestEmail(
  email: string,
  unsubscribeToken: string,
  sections: DigestSection[],
  intro: string | null = null,
  week?: { start: string; end: string },
  regionName: string | null = null,
  dayNotes: Record<string, string> = {},
): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.warn("sendDigestEmail: RESEND_API_KEY not set — skipping digest email.");
    return;
  }
  const resend = new Resend(apiKey);
  const { error } = await resend.emails.send({
    from: "Caldearte <contacto@caldearte.com>",
    to: email,
    subject: buildDigestSubject(sections, week, regionName),
    text: buildDigestBody(sections, unsubscribeToken, intro, week, regionName, dayNotes),
    html: buildDigestHtmlBody(sections, unsubscribeToken, intro, week, regionName, dayNotes),
    headers: {
      "List-Unsubscribe": `<${unsubscribeUrl(unsubscribeToken)}>`,
    },
  });

  if (error) {
    console.error(`[notify] digest email send failed for ${email}`, error);
  }
}

// Weekly (Tuesday) security audit — see security-audit/run.ts for the
// scan itself. This file only builds/sends the summary email, same
// pattern as the other sendXRunSummaryEmail functions above.
export interface SecurityAuditSummary {
  startedAt: Date;
  filesScanned: number;
  secrets: { file: string; line: number; pattern: string; excerpt: string }[];
  pii: { file: string; line: number; kind: "email" | "phone"; value: string }[];
  dependencies: { name: string; severity: "moderate" | "high" | "critical"; via: string; url: string | null }[];
  githubFeatures: {
    secretScanningEnabled: boolean | null;
    openSecretScanningAlerts: number | null;
    dependabotAlertsEnabled: boolean | null;
    openDependabotAlerts: number | null;
  };
}

function securityAuditHasFindings(summary: SecurityAuditSummary): boolean {
  return (
    summary.secrets.length > 0 ||
    summary.pii.length > 0 ||
    summary.dependencies.length > 0 ||
    summary.githubFeatures.secretScanningEnabled === false ||
    summary.githubFeatures.dependabotAlertsEnabled === false
  );
}

export function buildSecurityAuditSubject(summary: SecurityAuditSummary): string {
  return securityAuditHasFindings(summary)
    ? "⚠️ Caldearte — auditoría de seguridad: hay puntos que revisar"
    : "✅ Caldearte — auditoría de seguridad: todo despejado";
}

export function buildSecurityAuditBody(summary: SecurityAuditSummary): string {
  const { secrets, pii, dependencies, githubFeatures } = summary;
  const lines = [
    `Auditoría semanal de seguridad — ${summary.startedAt.toISOString()}`,
    `${summary.filesScanned} archivo(s) del repo escaneados.`,
    "",
  ];

  if (!securityAuditHasFindings(summary)) {
    lines.push("Sin hallazgos esta semana.");
    return lines.join("\n");
  }

  if (secrets.length > 0) {
    lines.push(`SECRETOS EXPUESTOS (${secrets.length})`);
    for (const s of secrets) lines.push(`- ${s.file}:${s.line} [${s.pattern}] ${s.excerpt}`);
    lines.push("");
  }

  if (pii.length > 0) {
    lines.push(`DATOS PERSONALES NO ESPERADOS (${pii.length})`);
    for (const p of pii) lines.push(`- ${p.file}:${p.line} [${p.kind}] ${p.value}`);
    lines.push("");
  }

  if (dependencies.length > 0) {
    lines.push(`VULNERABILIDADES DE DEPENDENCIAS (${dependencies.length})`);
    for (const d of dependencies) lines.push(`- [${d.severity}] ${d.name}: ${d.via}${d.url ? ` (${d.url})` : ""}`);
    lines.push("");
  }

  lines.push("GITHUB SECURITY (nativo)");
  lines.push(
    githubFeatures.secretScanningEnabled === false
      ? "- Secret scanning: DESACTIVADO — actívalo en Settings > Code security (gratis en repos públicos)."
      : githubFeatures.secretScanningEnabled === true
        ? `- Secret scanning: activo, ${githubFeatures.openSecretScanningAlerts} alerta(s) abierta(s).`
        : "- Secret scanning: no se pudo determinar el estado.",
  );
  lines.push(
    githubFeatures.dependabotAlertsEnabled === false
      ? "- Dependabot alerts: DESACTIVADO — actívalo en Settings > Code security (gratis en repos públicos)."
      : githubFeatures.dependabotAlertsEnabled === true
        ? `- Dependabot alerts: activo, ${githubFeatures.openDependabotAlerts} alerta(s) abierta(s).`
        : "- Dependabot alerts: no se pudo determinar el estado.",
  );

  return lines.join("\n");
}

export function buildSecurityAuditHtmlBody(summary: SecurityAuditSummary): string {
  const { secrets, pii, dependencies, githubFeatures } = summary;
  const hasFindings = securityAuditHasFindings(summary);

  const section = (title: string, rows: string[]) =>
    rows.length === 0
      ? ""
      : `<h2 style="font-size:14px;text-transform:uppercase;letter-spacing:0.04em;color:#888;margin:24px 0 10px;border-bottom:1px solid #e2e0da;padding-bottom:6px;">${title}</h2>
    <ul style="margin:0;padding-left:18px;font-size:13px;">${rows.map((r) => `<li>${r}</li>`).join("")}</ul>`;

  return `<div style="font-family:-apple-system,Helvetica,Arial,sans-serif;max-width:720px;margin:0 auto;color:#1a1a1a;">
    <h1 style="font-size:18px;margin:0 0 4px;">${hasFindings ? "⚠️" : "✅"} Caldearte — auditoría de seguridad</h1>
    <p style="font-size:13px;color:#666;margin:0 0 20px;">${escapeHtml(summary.startedAt.toISOString())} &middot; ${summary.filesScanned} archivo(s) escaneados</p>

    ${!hasFindings ? "<p>Sin hallazgos esta semana.</p>" : ""}

    ${section(
      `Secretos expuestos (${secrets.length})`,
      secrets.map((s) => `<code>${escapeHtml(s.file)}:${s.line}</code> [${escapeHtml(s.pattern)}] ${escapeHtml(s.excerpt)}`),
    )}

    ${section(
      `Datos personales no esperados (${pii.length})`,
      pii.map((p) => `<code>${escapeHtml(p.file)}:${p.line}</code> [${p.kind}] ${escapeHtml(p.value)}`),
    )}

    ${section(
      `Vulnerabilidades de dependencias (${dependencies.length})`,
      dependencies.map(
        (d) =>
          `[${d.severity}] <b>${escapeHtml(d.name)}</b>: ${escapeHtml(d.via)}${d.url ? ` — <a href="${escapeHtml(d.url)}">detalle</a>` : ""}`,
      ),
    )}

    <h2 style="font-size:14px;text-transform:uppercase;letter-spacing:0.04em;color:#888;margin:24px 0 10px;border-bottom:1px solid #e2e0da;padding-bottom:6px;">GitHub security (nativo)</h2>
    <p style="font-size:13px;">
      ${
        githubFeatures.secretScanningEnabled === false
          ? "Secret scanning: <b>desactivado</b> — actívalo en Settings &gt; Code security (gratis en repos públicos)."
          : githubFeatures.secretScanningEnabled === true
            ? `Secret scanning: activo, ${githubFeatures.openSecretScanningAlerts} alerta(s) abierta(s).`
            : "Secret scanning: no se pudo determinar el estado."
      }<br>
      ${
        githubFeatures.dependabotAlertsEnabled === false
          ? "Dependabot alerts: <b>desactivado</b> — actívalo en Settings &gt; Code security (gratis en repos públicos)."
          : githubFeatures.dependabotAlertsEnabled === true
            ? `Dependabot alerts: activo, ${githubFeatures.openDependabotAlerts} alerta(s) abierta(s).`
            : "Dependabot alerts: no se pudo determinar el estado."
      }
    </p>
  </div>`;
}

// Ancillary, same defensive posture as the other sendXRunSummaryEmail
// functions: a failed/skipped send never breaks the audit run itself.
export async function sendSecurityAuditEmail(summary: SecurityAuditSummary): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.warn("sendSecurityAuditEmail: RESEND_API_KEY not set — skipping security audit email.");
    return;
  }

  const resend = new Resend(apiKey);
  const { error } = await resend.emails.send({
    from: "Caldearte <contacto@caldearte.com>",
    to: RUN_SUMMARY_RECIPIENT,
    subject: buildSecurityAuditSubject(summary),
    text: buildSecurityAuditBody(summary),
    html: buildSecurityAuditHtmlBody(summary),
  });

  if (error) {
    console.error("[notify] security audit email send failed", error);
  }
}
