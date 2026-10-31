import { test } from "node:test";
import assert from "node:assert/strict";
import { buildDailyDigestSubject, buildDailyDigestBody, buildDailyDigestHtmlBody, safetyNetVetoesOf, type DailyDigestSummary } from "./daily-digest.js";

const baseCost: DailyDigestSummary["cost"] = {
  anthropicTodayUsd: 0.1,
  safetyNetTodayUsd: 0.02,
  safetyNetMonthUsd: 0.45,
  apifyTodayGrossUsd: 0.2,
  apifyTodayFreeUsd: 0.2,
  apifyTodayRealUsd: 0,
  anthropicMonthUsd: 3.45,
  apifyCycleGrossUsd: 4.21,
  apifyCycleFreeUsd: 4.21,
  apifyCycleRealUsd: 0,
  apifyCycleStartDate: "2026-08-13",
  monthlyBudgetUsd: 15,
};

const approvedCandidate = {
  title: "Muestra real",
  status: "approved" as const,
  location: "Santiago",
  placeName: "Galería X",
  runStartDate: "2026-08-27",
  runEndDate: "2026-09-10",
  curationReasoning: "ok",
  sourceUrl: "https://example.com/1",
  outcome: "inserted" as const,
};

const rejectedCandidate = {
  ...approvedCandidate,
  title: "Descartado",
  status: "rejected" as const,
  outcome: null,
};

function summaryWith(runs: DailyDigestSummary["runs"], newEvents: DailyDigestSummary["newEvents"] = []): DailyDigestSummary {
  return { date: "2026-08-26", runs, cost: baseCost, newEvents };
}

const newEvent: DailyDigestSummary["newEvents"][number] = {
  id: "11111111-2222-3333-4444-555555555555",
  title: "Geometría desde el sur",
  placeName: "Galería NAC",
  comunaName: "Santiago",
  openingDatetime: "2026-08-28T22:00:00.000Z",
  openingTimeConfirmed: true,
  runEndDate: "2026-09-20",
  imageUrl: "https://example.supabase.co/storage/v1/object/public/event-images/x.jpg",
  isOpeningThisWeek: true,
};

const vetoedCandidate = {
  ...approvedCandidate,
  title: "Primer Pasacalle Literario",
  status: "rejected" as const,
  outcome: null,
  imageUrl: "https://scontent.cdninstagram.com/v/veto.jpg",
  curationReasoning:
    "[VETO red de seguridad minimax/minimax-m3] Pasacalle y lectura de poesía: evento literario sin exposición visual. — Haiku había aprobado: Intervención artística en el espacio público.",
};

test("buildDailyDigestSubject reports the real date and how many pipelines ran, and counts only genuinely NEW (inserted) events", () => {
  const summary = summaryWith([
    {
      entrypoint: "instagram",
      startedAt: new Date("2026-08-26T08:17:00.000Z"),
      candidates: { total: 2, approvedByCuration: 1, rejectedByCuration: 1 },
      eventGroups: [{ label: "cuenta_x", candidates: [approvedCandidate, rejectedCandidate] }],
      costUsd: 0.05,
    },
    {
      entrypoint: "google_alerts",
      startedAt: new Date("2026-08-26T09:22:00.000Z"),
      candidates: { total: 0, approvedByCuration: 0, rejectedByCuration: 0 },
      eventGroups: [],
      costUsd: 0,
    },
  ]);

  const subject = buildDailyDigestSubject(summary);
  assert.match(subject, /26\/08\/2026/);
  assert.match(subject, /2 fuente\(s\)/);
  assert.match(subject, /1 evento\(s\) nuevo\(s\)/, "only the 'inserted' outcome counts as genuinely new, not the rejected one");
});

test("buildDailyDigestSubject reports zero new events when nothing was inserted (e.g. all duplicates or rejections)", () => {
  const summary = summaryWith([
    {
      entrypoint: "headless",
      startedAt: new Date("2026-08-26T07:12:00.000Z"),
      candidates: { total: 1, approvedByCuration: 0, rejectedByCuration: 1 },
      eventGroups: [{ label: "fuente_y", candidates: [rejectedCandidate] }],
      costUsd: 0,
    },
  ]);

  assert.match(buildDailyDigestSubject(summary), /0 evento\(s\) nuevo\(s\)/);
});

test("buildDailyDigestBody lists every pipeline that ran today with its own counts, plus a consolidated cost section", () => {
  const summary = summaryWith([
    {
      entrypoint: "instagram",
      startedAt: new Date("2026-08-26T08:17:00.000Z"),
      candidates: { total: 2, approvedByCuration: 1, rejectedByCuration: 1 },
      eventGroups: [{ label: "cuenta_x", candidates: [approvedCandidate, rejectedCandidate] }],
      costUsd: 0.05,
    },
  ]);

  const body = buildDailyDigestBody(summary);
  assert.match(body, /Instagram/);
  assert.match(body, /2 candidatos · 1 rechazados · 1 aprobados/);
  assert.match(body, /COSTO/);
  assert.match(body, /\$15\.00/, "monthly budget ceiling must appear");
  // 2026-10-30: the full per-candidate list is gone — too long to use.
  assert.doesNotMatch(body, /DETALLE POR EVENTO/);
  assert.doesNotMatch(body, /Descartado/, "a plain rejection is no longer listed one by one");
});

test("new events render as linked newsletter cards with their image, openings first", () => {
  const summary = summaryWith([], [newEvent]);
  const html = buildDailyDigestHtmlBody(summary);
  assert.match(html, /Nuevos en el sitio \(1\)/);
  assert.match(html, /<a href="https:\/\/www\.caldearte\.com\/eventos\/11111111-2222-3333-4444-555555555555"/, "each card links to the event's page");
  assert.match(html, /<img src="https:\/\/example\.supabase\.co\/storage\/v1\/object\/public\/event-images\/x\.jpg"/);
  assert.match(html, /GEOMETRÍA DESDE EL SUR|Geometría desde el sur/);
  assert.match(html, /SANTIAGO · VIE 28 AGO · 18 HR/, "an upcoming opening shows its day and hour in the pill, like the newsletter");

  const body = buildDailyDigestBody(summary);
  assert.match(body, /NUEVOS EN EL SITIO \(1\)/);
  assert.match(body, /https:\/\/www\.caldearte\.com\/eventos\/11111111-2222-3333-4444-555555555555/);
});

test("the new-events section says so plainly when nothing was added", () => {
  assert.match(buildDailyDigestHtmlBody(summaryWith([])), /Nuevos en el sitio \(0\)[\s\S]*ninguno hoy/);
});

test("safety-net vetoes come last, as cards without a link, with MiniMax's reason and Haiku's original one", () => {
  const summary = summaryWith(
    [
      {
        entrypoint: "instagram",
        startedAt: new Date("2026-08-26T08:17:00.000Z"),
        candidates: { total: 3, approvedByCuration: 1, rejectedByCuration: 2 },
        eventGroups: [{ label: "cuenta_x", candidates: [approvedCandidate, rejectedCandidate, vetoedCandidate] }],
        costUsd: 0.05,
      },
    ],
    [newEvent],
  );

  const vetoes = safetyNetVetoesOf(summary.runs);
  assert.equal(vetoes.length, 1, "only the vetoed candidate, not a plain Haiku rejection");
  assert.equal(vetoes[0].reason, "Pasacalle y lectura de poesía: evento literario sin exposición visual.");
  assert.equal(vetoes[0].haikuReason, "Intervención artística en el espacio público.");

  const html = buildDailyDigestHtmlBody(summary);
  const vetoSection = html.slice(html.indexOf("Quitados por MiniMax"));
  assert.ok(html.indexOf("Quitados por MiniMax") > html.indexOf("Nuevos en el sitio"), "vetoes go after the new events");
  assert.match(vetoSection, /Primer Pasacalle Literario/);
  assert.match(vetoSection, /<img src="https:\/\/scontent\.cdninstagram\.com\/v\/veto\.jpg"/);
  assert.match(vetoSection, /Por qué:<\/b> Pasacalle y lectura de poesía/);
  assert.match(vetoSection, /Haiku lo había aprobado: Intervención artística/);
  assert.doesNotMatch(vetoSection, /<a href/, "a vetoed candidate never reached the site, so its card has no link");

  const body = buildDailyDigestBody(summary);
  assert.match(body, /QUITADOS POR MINIMAX \(RED DE SEGURIDAD\) \(1\)/);
  assert.match(body, /Por qué: Pasacalle y lectura de poesía/);
});

test("the veto section is left out entirely on a day with no vetoes", () => {
  assert.doesNotMatch(buildDailyDigestHtmlBody(summaryWith([])), /Quitados por/);
  assert.doesNotMatch(buildDailyDigestBody(summaryWith([])), /QUITADOS POR/);
});

test("buildDailyDigestBody's cost section separates Apify's real (billed) cost from what the free tier already covered", () => {
  const summary = summaryWith([]);
  const body = buildDailyDigestBody(summary);
  assert.match(body, /\$0\.2000 cubierto por el crédito del plan/);
  assert.match(body, /\$0\.0000 real de \$0\.2000 bruto/);
});

// Daniel, 2026-09-17: the safety-net model's spend was invisible in
// the digest. It gets its own line (never folded into "Anthropic") and
// counts toward the same monthly ceiling.
test("the cost section shows the safety-net model on its own line and in both totals", () => {
  const summary = summaryWith([]);
  const body = buildDailyDigestBody(summary);
  assert.match(body, /Hoy: \$0\.1200 real \(Anthropic \$0\.1000 \+ MiniMax \(red de seguridad\) \$0\.0200/);
  assert.match(body, /Mes a la fecha: \$3\.90 de \$15\.00/);
  assert.match(body, /  MiniMax \(red de seguridad\): \$0\.45 \(mes calendario\)/);
  const html = buildDailyDigestHtmlBody(summary);
  assert.match(html, /MiniMax \(red de seguridad\): \$0\.0200/);
  assert.match(html, /MiniMax \(red de seguridad\): \$0\.45 \(mes calendario\)/);
});

test("buildDailyDigestHtmlBody renders a row per pipeline with its inserted count", () => {
  const summary = summaryWith([
    {
      entrypoint: "event_discovery",
      startedAt: new Date("2026-08-26T06:07:00.000Z"),
      candidates: { total: 1, approvedByCuration: 1, rejectedByCuration: 0 },
      eventGroups: [{ label: "https://fuente.cl", candidates: [approvedCandidate] }],
      costUsd: 0.03,
    },
  ]);

  const html = buildDailyDigestHtmlBody(summary);
  assert.match(html, /Web \(comuna \+ agregadores\)/);
  assert.match(html, /Insertados/);
  assert.match(html, /<td[^>]*font-weight:600;">1<\/td>/, "the per-source row must show how many candidates were actually inserted");
  assert.match(buildDailyDigestBody(summary), /0 rechazados · 1 aprobados · 1 insertados/);
  assert.doesNotMatch(html, /<script/i);
});

test("buildDailyDigestBody/HtmlBody surface a visible warning when a pipeline's own fetch failed outright (real gap found 2026-08-30: an Apify hard-limit error read as '0 candidates, ran fine' everywhere downstream)", () => {
  const summary = summaryWith([
    {
      entrypoint: "instagram",
      startedAt: new Date("2026-08-30T08:17:00.000Z"),
      candidates: { total: 0, approvedByCuration: 0, rejectedByCuration: 0 },
      eventGroups: [],
      costUsd: 0,
      fetchError: "Monthly usage hard limit exceeded",
    },
  ]);

  const body = buildDailyDigestBody(summary);
  assert.match(body, /BLOQUEADO/);
  assert.match(body, /Monthly usage hard limit exceeded/);

  const html = buildDailyDigestHtmlBody(summary);
  assert.match(html, /BLOQUEADO/);
  assert.match(html, /Monthly usage hard limit exceeded/);
});

test("buildDailyDigestBody/HtmlBody omit the fetch-error warning when nothing failed", () => {
  const summary = summaryWith([
    {
      entrypoint: "instagram",
      startedAt: new Date("2026-08-30T08:17:00.000Z"),
      candidates: { total: 0, approvedByCuration: 0, rejectedByCuration: 0 },
      eventGroups: [],
      costUsd: 0,
    },
  ]);

  assert.doesNotMatch(buildDailyDigestBody(summary), /BLOQUEADO/);
  assert.doesNotMatch(buildDailyDigestHtmlBody(summary), /BLOQUEADO/);
});

test("buildDailyDigestBody/HtmlBody: Apify status line shows remaining credit under the plan's included credit", () => {
  const body = buildDailyDigestBody(summaryWith([]));
  assert.match(body, /\$14\.79 disponibles de \$19 en el ciclo actual/, "APIFY_FREE_TIER_USD 19 - apifyCycleGrossUsd 4.21 = 14.79 remaining");
  // Cycle opened 13/08 -> renews 13/09, NOT "next month" generically.
  assert.match(body, /se renueva el 13\/09\/2026/);
  assert.doesNotMatch(body, /CRÉDITO DEL PLAN AGOTADO/);

  const html = buildDailyDigestHtmlBody(summaryWith([]));
  assert.match(html, /\$14\.79 disponibles/);
  assert.doesNotMatch(html, /CRÉDITO DEL PLAN AGOTADO/);
});

test("buildDailyDigestBody/HtmlBody: Apify status line flags the included credit as used up once gross spend reaches it (excess is billed, not blocked)", () => {
  const overLimitCost: DailyDigestSummary["cost"] = { ...baseCost, apifyCycleGrossUsd: 19.02 };
  const summary: DailyDigestSummary = { date: "2026-08-30", runs: [], cost: overLimitCost, newEvents: [] };

  const body = buildDailyDigestBody(summary);
  assert.match(body, /CRÉDITO DEL PLAN AGOTADO \(\$19\.02 de \$19\) — el excedente se factura en la próxima factura \(13\/09\/2026\)/);

  const html = buildDailyDigestHtmlBody(summary);
  assert.match(html, /CRÉDITO DEL PLAN AGOTADO/);
  assert.match(html, /color:#b3261e/, "the over-limit status must render in the warning color, not the default gray");
});
