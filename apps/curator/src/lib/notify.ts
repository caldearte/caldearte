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

// Cross-source curation conflict escalation (2026-07-30) — see
// docs/curation-policy.md's "Cross-source conflict escalation" section.
// Both `existing`/`newCandidate` are pre-formatted display data (title,
// source link, full reasoning), not raw DB rows — run.ts assembles these
// from whichever table each side actually came from before calling this.
export interface EscalationSide {
  title: string;
  sourceUrl: string;
  reasoning: string;
}

// `functionBaseUrl` is threaded through as a plain parameter (not read
// from process.env inside these builders) so they stay pure and testable
// — sendEscalationEmail below is the only place that actually reads
// SUPABASE_URL, and it reads it fresh on every call rather than caching
// it at module-load time.
function escalationDecisionUrl(functionBaseUrl: string, token: string, action: "accept" | "reject"): string {
  return `${functionBaseUrl}?token=${encodeURIComponent(token)}&action=${action}`;
}

export function buildEscalationSubject(existing: EscalationSide, newCandidate: EscalationSide): string {
  return `⚠️ Conflicto de curatoría: "${existing.title}" vs "${newCandidate.title}"`;
}

export function buildEscalationBody(
  existing: EscalationSide,
  newCandidate: EscalationSide,
  functionBaseUrl: string,
  acceptToken: string,
  rejectToken: string,
): string {
  return [
    "Dos fuentes distintas describen lo que parece ser el mismo evento real, con decisiones de curatoría opuestas.",
    "",
    "-- Versión ya existente --",
    `${existing.title}`,
    `Fuente: ${existing.sourceUrl}`,
    `Razonamiento: ${existing.reasoning}`,
    "",
    "-- Versión nueva de esta corrida --",
    `${newCandidate.title}`,
    `Fuente: ${newCandidate.sourceUrl}`,
    `Razonamiento: ${newCandidate.reasoning}`,
    "",
    "Ninguna se aplicó todavía — la decisión anterior se mantiene tal cual hasta que elijas una opción:",
    "",
    `Usar la versión NUEVA: ${escalationDecisionUrl(functionBaseUrl, acceptToken, "accept")}`,
    `Mantener la versión ANTERIOR: ${escalationDecisionUrl(functionBaseUrl, rejectToken, "reject")}`,
  ].join("\n");
}

export function buildEscalationHtmlBody(
  existing: EscalationSide,
  newCandidate: EscalationSide,
  functionBaseUrl: string,
  acceptToken: string,
  rejectToken: string,
): string {
  const sideHtml = (label: string, side: EscalationSide) => `
    <h2 style="font-size:14px;text-transform:uppercase;letter-spacing:0.04em;color:#888;margin:24px 0 10px;border-bottom:1px solid #e2e0da;padding-bottom:6px;">${label}</h2>
    <p style="margin:0 0 4px;font-weight:600;">${escapeHtml(side.title)}</p>
    <p style="margin:0 0 4px;"><a href="${escapeHtml(side.sourceUrl)}" style="color:inherit;">${escapeHtml(side.sourceUrl)}</a></p>
    <p style="margin:0;color:#555;font-size:13px;">${escapeHtml(side.reasoning)}</p>`;

  return `<div style="font-family:sans-serif;max-width:640px;">
    <p>Dos fuentes distintas describen lo que parece ser el mismo evento real, con decisiones de curatoría opuestas. Ninguna se aplicó todavía — la versión anterior se mantiene tal cual hasta que elijas una opción.</p>
    ${sideHtml("Versión ya existente", existing)}
    ${sideHtml("Versión nueva de esta corrida", newCandidate)}
    <p style="margin:28px 0 0;">
      <a href="${escalationDecisionUrl(functionBaseUrl, acceptToken, "accept")}" style="display:inline-block;background:#1a7f37;color:#fff;padding:10px 18px;border-radius:6px;text-decoration:none;font-weight:600;margin-right:12px;">Usar la versión nueva</a>
      <a href="${escalationDecisionUrl(functionBaseUrl, rejectToken, "reject")}" style="display:inline-block;background:#555;color:#fff;padding:10px 18px;border-radius:6px;text-decoration:none;font-weight:600;">Mantener la anterior</a>
    </p>
  </div>`;
}

// Ancillary — a failed/skipped send must never break the run. Unlike the
// run-summary emails, a missing RESEND_API_KEY here means the conflict
// still gets logged (run.ts's own console.log) but nobody gets notified —
// worth surfacing loudly since this is the only way a human finds out.
export async function sendEscalationEmail(
  existing: EscalationSide,
  newCandidate: EscalationSide,
  acceptToken: string,
  rejectToken: string,
): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.warn("sendEscalationEmail: RESEND_API_KEY not set — skipping escalation email (conflict is still logged and recorded in curation_escalations).");
    return;
  }
  const supabaseUrl = process.env.SUPABASE_URL;
  if (!supabaseUrl) {
    console.warn("sendEscalationEmail: SUPABASE_URL not set — skipping escalation email (can't build the decision links).");
    return;
  }
  const functionBaseUrl = `${supabaseUrl.replace(".supabase.co", ".functions.supabase.co")}/curation-escalation-decide`;

  const resend = new Resend(apiKey);
  const { error } = await resend.emails.send({
    from: "Caldearte <contacto@caldearte.com>",
    to: RUN_SUMMARY_RECIPIENT,
    subject: buildEscalationSubject(existing, newCandidate),
    text: buildEscalationBody(existing, newCandidate, functionBaseUrl, acceptToken, rejectToken),
    html: buildEscalationHtmlBody(existing, newCandidate, functionBaseUrl, acceptToken, rejectToken),
  });

  if (error) {
    console.error("[notify] escalation email send failed", error);
  }
}

// Newsletter — weekly digest, one email per confirmed subscriber. Section
// content (which events go where) is decided by
// apps/curator/src/newsletter/run.ts's buildDigestSections — this file
// only formats whatever sections it's handed and never omits a non-empty
// one, matching the product decision that empty sections are dropped
// upstream, not hidden here.
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
}

export interface DigestSection {
  label: string;
  events: DigestEvent[];
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

function fmtDigestDate(e: DigestEvent): string {
  if (e.openingDatetime) {
    const dateStr = e.openingDatetime.slice(0, 10);
    return e.openingTimeConfirmed ? `Inauguración: ${dateStr} · ${fmtHourSantiago(e.openingDatetime)}` : `Inauguración: ${dateStr}`;
  }
  if (e.runEndDate) return `Hasta el ${e.runEndDate}`;
  return "";
}

function eventUrl(id: string): string {
  return `https://www.caldearte.com/eventos/${id}`;
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

// Groups a section's events by comuna (place_name's own comuna, via
// DigestEvent.comunaName) — real feedback from the first send: a flat
// list across a whole región reads as noise, comuna sub-groups make it
// scannable. "Otras comunas" catches the rare event with no resolved
// region_id (see docs/data-model.md). Insertion-order-stable within each
// comuna, comuna groups themselves sorted alphabetically for a
// deterministic, scannable read.
function groupByComuna(events: DigestEvent[]): Array<[string, DigestEvent[]]> {
  const groups = new Map<string, DigestEvent[]>();
  for (const e of events) {
    const key = e.comunaName ?? "Otras comunas";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(e);
  }
  return Array.from(groups.entries()).sort(([a], [b]) => a.localeCompare(b));
}

export function buildDigestSubject(sections: DigestSection[]): string {
  const totalEvents = sections.reduce((sum, s) => sum + s.events.length, 0);
  return `Caldearte — tu semana en arte (${totalEvents} expo${totalEvents === 1 ? "" : "s"})`;
}

export function buildDigestBody(sections: DigestSection[], unsubscribeToken: string): string {
  const lines: string[] = [];
  for (const section of sections) {
    lines.push(`-- ${section.label} --`);
    for (const [comuna, events] of groupByComuna(section.events)) {
      lines.push(`[${comuna}]`);
      for (const e of events) {
        const date = fmtDigestDate(e);
        lines.push(`${e.title} — ${e.placeName}${date ? ` — ${date}` : ""}`);
        lines.push(`  ${eventUrl(e.id)}`);
      }
    }
    lines.push("");
  }
  lines.push(`Darse de baja: ${unsubscribeUrl(unsubscribeToken)}`);
  return lines.join("\n");
}

// Horizontal thumbnail card — a <table> layout rather than flex/grid,
// since email clients (Gmail, Outlook chief among them) don't reliably
// support either; <table> is the one layout primitive that survives every
// major client's HTML sanitizer.
function eventCardHtml(e: DigestEvent): string {
  const date = fmtDigestDate(e);
  const thumb = e.imageUrl
    ? `<img src="${escapeHtml(e.imageUrl)}" width="72" height="72" alt="" style="display:block;width:72px;height:72px;border-radius:8px;object-fit:cover;" />`
    : `<div style="width:72px;height:72px;border-radius:8px;background:#eee;"></div>`;
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 14px;">
    <tr>
      <td width="72" valign="top" style="padding-right:12px;">
        <a href="${eventUrl(e.id)}">${thumb}</a>
      </td>
      <td valign="top">
        <a href="${eventUrl(e.id)}" style="color:#1c1c1c;text-decoration:none;font-weight:700;font-size:14px;">${escapeHtml(e.title)}</a><br/>
        <span style="color:#555;font-size:13px;">${escapeHtml(e.placeName)}</span><br/>
        ${date ? `<span style="color:#888;font-size:12px;">${escapeHtml(date)}</span>` : ""}
      </td>
    </tr>
  </table>`;
}

export function buildDigestHtmlBody(sections: DigestSection[], unsubscribeToken: string): string {
  const sectionsHtml = sections
    .map((section) => {
      const comunaGroupsHtml = groupByComuna(section.events)
        .map(
          ([comuna, events]) =>
            `<p style="margin:16px 0 8px;font-size:12px;font-weight:700;color:#1c1c1c;">${escapeHtml(comuna)}</p>${events.map(eventCardHtml).join("")}`,
        )
        .join("");
      return `<h2 style="font-size:14px;text-transform:uppercase;letter-spacing:0.04em;color:#888;margin:24px 0 0;border-bottom:1px solid #e2e0da;padding-bottom:6px;">${escapeHtml(section.label)}</h2>
      ${comunaGroupsHtml}`;
    })
    .join("");

  return `<div style="font-family:'Helvetica Neue',Arial,sans-serif;max-width:640px;margin:0 auto;">
    <div style="background:#1c1c1c;padding:24px 28px;border-radius:12px 12px 0 0;">
      <p style="margin:0;color:#fff;font-size:20px;font-weight:800;letter-spacing:0.02em;">CALDEARTE</p>
    </div>
    <div style="background:#fdf6e3;padding:24px 28px 8px;">
      ${sectionsHtml}
      <p style="margin:28px 0 0;font-size:12px;color:#888;"><a href="${unsubscribeUrl(unsubscribeToken)}" style="color:#888;">Darse de baja</a></p>
    </div>
  </div>`;
}

// Ancillary, same posture as sendEscalationEmail: a failed/skipped send
// never breaks the run — a missing RESEND_API_KEY just means that
// subscriber doesn't get this week's digest, logged loudly since it's the
// only way anyone notices.
export async function sendDigestEmail(email: string, unsubscribeToken: string, sections: DigestSection[]): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.warn("sendDigestEmail: RESEND_API_KEY not set — skipping digest email.");
    return;
  }
  const resend = new Resend(apiKey);
  const { error } = await resend.emails.send({
    from: "Caldearte <contacto@caldearte.com>",
    to: email,
    subject: buildDigestSubject(sections),
    text: buildDigestBody(sections, unsubscribeToken),
    html: buildDigestHtmlBody(sections, unsubscribeToken),
    headers: {
      "List-Unsubscribe": `<${unsubscribeUrl(unsubscribeToken)}>`,
    },
  });

  if (error) {
    console.error(`[notify] digest email send failed for ${email}`, error);
  }
}
