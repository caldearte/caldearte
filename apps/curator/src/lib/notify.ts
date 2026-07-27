import { Resend } from "resend";

const GITHUB_API = "https://api.github.com";
const BUDGET_ALERT_LABEL = "budget-alert";

// Same recipient/domain pattern as apps/web's contact route
// (apps/web/src/app/api/contact/route.ts) — caldearte.com is already a
// verified Resend sending domain as of the production launch.
const RUN_SUMMARY_RECIPIENT = "daniel@probablespa.cl";

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
export interface CandidateSummary {
  title: string;
  status: "approved" | "rejected";
  location: string;
  placeName: string | null;
  runStartDate: string | null;
  runEndDate: string | null;
  curationReasoning: string;
  sourceUrl: string | null;
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

function fmtUsd(n: number): string {
  return `$${n.toFixed(4)}`;
}

function fmtDateRange(c: CandidateSummary): string {
  if (c.runStartDate && c.runEndDate) return `${c.runStartDate} – ${c.runEndDate}`;
  if (c.runStartDate) return `desde ${c.runStartDate}`;
  return "—";
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// Plain-text fallback for the per-source event tables — every email is
// sent with both `text` and `html` (Resend requires at least one; both are
// set so text-only clients still get the full event list, not just a
// pointer to the HTML version).
function buildEventGroupsText(eventGroups: EventGroup[]): string[] {
  if (eventGroups.length === 0) return [];

  const lines: string[] = [];
  for (const group of eventGroups) {
    if (group.candidates.length === 0) continue;
    lines.push(`-- ${group.label} (${group.candidates.length}) --`);
    for (const c of group.candidates) {
      const icon = c.status === "approved" ? "OK" : "RECHAZADO";
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
function buildEventGroupsHtml(eventGroups: EventGroup[]): string {
  const nonEmptyGroups = eventGroups.filter((g) => g.candidates.length > 0);
  if (nonEmptyGroups.length === 0) return "";

  const tables = nonEmptyGroups
    .map((group) => {
      const rows = group.candidates
        .map((c) => {
          const statusCell =
            c.status === "approved"
              ? `<td style="color:#1a7f37;font-weight:600;white-space:nowrap;">✅ Aprobado</td>`
              : `<td style="color:#b3261e;font-weight:600;white-space:nowrap;">❌ Rechazado</td>`;
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
