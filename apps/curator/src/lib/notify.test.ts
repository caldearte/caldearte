import { test } from "node:test";
import assert from "node:assert/strict";
import {
  flagBudgetExceeded,
  sendRunSummaryEmail,
  buildSubject,
  buildBody,
  buildHtmlBody,
  sendHeadlessRunSummaryEmail,
  buildHeadlessSubject,
  buildHeadlessBody,
  buildHeadlessHtmlBody,
  sendEscalationEmail,
  buildEscalationSubject,
  buildEscalationBody,
  buildEscalationHtmlBody,
  sendDigestEmail,
  buildDigestSubject,
  buildDigestBody,
  buildDigestHtmlBody,
  type RunSummary,
  type HeadlessRunSummary,
  type EscalationSide,
  type DigestSection,
} from "./notify.js";

test("flagBudgetExceeded: no-ops when GITHUB_TOKEN/GITHUB_REPOSITORY are unset", async () => {
  const originalToken = process.env.GITHUB_TOKEN;
  const originalRepo = process.env.GITHUB_REPOSITORY;
  delete process.env.GITHUB_TOKEN;
  delete process.env.GITHUB_REPOSITORY;

  try {
    // Should resolve without throwing and without making any network call.
    await flagBudgetExceeded({ spend: 12.5, budget: 10 });
  } finally {
    if (originalToken !== undefined) process.env.GITHUB_TOKEN = originalToken;
    if (originalRepo !== undefined) process.env.GITHUB_REPOSITORY = originalRepo;
  }

  assert.ok(true);
});

const fixtureSummary: RunSummary = {
  startedAt: new Date(2026, 6, 18, 6, 0, 0),
  units: { total: 2, failed: ["Puente Alto"] },
  comunas: ["Santiago", "Puente Alto"],
  brightSources: { due: 5, total: 12 },
  candidates: {
    total: 10,
    approvedByCuration: 6,
    rejectedByCuration: 4,
    insertedCount: 5,
    byMediumType: { tradicional: 8, intervencion_no_tradicional: 2 },
    sensitivityTagged: 1,
  },
  eventGroups: [
    {
      label: "Santiago",
      candidates: [
        {
          title: "Expo real en el GAM",
          status: "approved",
          location: "Santiago",
          placeName: "GAM",
          runStartDate: "2026-08-01",
          runEndDate: "2026-08-30",
          curationReasoning: "Exposición de arte visual en espacio legítimo.",
          sourceUrl: "https://x.cl/expo-real",
          outcome: "inserted",
        },
        {
          title: "Taller de cerámica",
          status: "rejected",
          location: "Santiago",
          placeName: null,
          runStartDate: null,
          runEndDate: null,
          curationReasoning: "Es un taller, no una exposición — fuera de alcance.",
          sourceUrl: "https://x.cl/taller",
          outcome: null,
        },
      ],
    },
  ],
  cost: {
    anthropicUsd: 0.118,
    tavilyCredits: 12,
    tavilyUsd: 0.096,
    totalUsd: 0.214,
    monthToDateUsd: 4.32,
    monthlyBudgetUsd: 50,
  },
};

test("sendRunSummaryEmail: no-ops with a warning when RESEND_API_KEY is unset", async () => {
  const original = process.env.RESEND_API_KEY;
  delete process.env.RESEND_API_KEY;

  try {
    // Should resolve without throwing and without making any network call.
    await sendRunSummaryEmail(fixtureSummary);
  } finally {
    if (original !== undefined) process.env.RESEND_API_KEY = original;
  }

  assert.ok(true);
});

test("buildSubject includes the comuna count", () => {
  assert.equal(buildSubject(fixtureSummary), "Caldearte — resumen de Event Discovery (18/07/2026, 2 comunas)");
});

test("buildBody includes the key figures: comunas, failed units, event counts, and cost breakdown", () => {
  const body = buildBody(fixtureSummary);
  assert.match(body, /Santiago, Puente Alto/);
  assert.match(body, /1: Puente Alto/);
  assert.match(body, /Total candidatos: 10/);
  assert.match(body, /Aprobados por curatoría: 6/);
  assert.match(body, /Rechazados por curatoría: 4/);
  assert.match(body, /Insertados en el calendario: 5/);
  assert.match(body, /Con tag de sensibilidad: 1/);
  assert.match(body, /tradicional: 8/);
  assert.match(body, /intervencion_no_tradicional: 2/);
  assert.match(body, /Anthropic \(Haiku\): \$0\.1180/);
  assert.match(body, /Tavily \(12 créditos × \$0\.008\): \$0\.0960/);
  assert.match(body, /Total: \$0\.2140/);
  assert.match(body, /\$4\.32 de \$50\.00/);
});

test("buildBody handles the no-failures, no-bright-sources-due edge case cleanly", () => {
  const body = buildBody({
    ...fixtureSummary,
    units: { total: 1, failed: [] },
    brightSources: { due: 0, total: 12 },
  });
  assert.match(body, /UNIDADES FALLIDAS\n\(ninguna\)/);
  assert.match(body, /0 de 12 debidas/);
});

test("buildBody's text fallback lists both approved and rejected candidates, grouped by source", () => {
  const body = buildBody(fixtureSummary);
  assert.match(body, /-- Santiago \(2\) --/);
  assert.match(body, /\[APROBADO \(NUEVO\)\] Expo real en el GAM/);
  assert.match(body, /\[RECHAZADO\] Taller de cerámica/);
  assert.match(body, /Es un taller, no una exposición — fuera de alcance\./);
});

// Real bug found via a user-requested audit (2026-08-10): a run report
// showed "25 aprobados · 0 insertados" and the per-row badge gave no hint
// which of the 25 were actually new vs. re-approvals of events already on
// the site — every row just said "✅ Aprobado" regardless. Now the badge
// (and its plain-text equivalent) reflects the real per-candidate outcome.
test("buildBody's text fallback distinguishes a duplicate-skipped approval from a genuinely new one — the exact confusion a real user report surfaced", () => {
  const body = buildBody({
    ...fixtureSummary,
    eventGroups: [
      {
        label: "artes.uchile.cl",
        candidates: [
          { ...fixtureSummary.eventGroups[0].candidates[0], title: "Ya existía", outcome: "duplicate_skipped" },
        ],
      },
    ],
  });
  assert.match(body, /\[APROBADO \(YA EXISTÍA\)\] Ya existía/);
  assert.doesNotMatch(body, /\[APROBADO \(NUEVO\)\] Ya existía/);
});

test("buildHtmlBody renders a table with both approved and rejected candidates, source link, and reasoning", () => {
  const html = buildHtmlBody(fixtureSummary);
  assert.match(html, /Santiago \(2\)/);
  assert.match(html, /✅ Aprobado/);
  assert.match(html, /❌ Rechazado/);
  assert.match(html, /<a href="https:\/\/x\.cl\/expo-real"[^>]*>Expo real en el GAM<\/a>/);
  assert.match(html, /Taller de cerámica/);
  assert.match(html, /Es un taller, no una exposición — fuera de alcance\./);
  assert.match(html, /GAM/);
});

test("buildHtmlBody omits empty groups and degrades cleanly with zero eventGroups", () => {
  const html = buildHtmlBody({ ...fixtureSummary, eventGroups: [{ label: "Empty Comuna", candidates: [] }] });
  assert.doesNotMatch(html, /Empty Comuna/);

  const emptyHtml = buildHtmlBody({ ...fixtureSummary, eventGroups: [] });
  assert.doesNotMatch(emptyHtml, /<table/);
});

const fixtureHeadlessSummary: HeadlessRunSummary = {
  startedAt: new Date(2026, 6, 20, 7, 0, 0),
  sourcesFetched: ["https://mavi.uc.cl/exposiciones-actuales/"],
  candidates: {
    total: 3,
    approvedByCuration: 2,
    rejectedByCuration: 1,
    insertedCount: 2,
    byMediumType: { tradicional: 3 },
    sensitivityTagged: 0,
  },
  eventGroups: [
    {
      label: "https://mavi.uc.cl/exposiciones-actuales/",
      candidates: [
        {
          title: "Muestra en el MAVI",
          status: "approved",
          location: "Santiago",
          placeName: "Museo de Artes Visuales MAVI UC",
          runStartDate: "2026-07-01",
          runEndDate: "2026-09-01",
          curationReasoning: "Exposición de arte visual en museo legítimo.",
          sourceUrl: "https://mavi.uc.cl/exposiciones/muestra",
        },
      ],
    },
  ],
  cost: { anthropicUsd: 0.02, tavilyCredits: 0, tavilyUsd: 0, totalUsd: 0.02, monthToDateUsd: 4.34, monthlyBudgetUsd: 50 },
};

test("sendHeadlessRunSummaryEmail: no-ops with a warning when RESEND_API_KEY is unset", async () => {
  const original = process.env.RESEND_API_KEY;
  delete process.env.RESEND_API_KEY;

  try {
    await sendHeadlessRunSummaryEmail(fixtureHeadlessSummary);
  } finally {
    if (original !== undefined) process.env.RESEND_API_KEY = original;
  }

  assert.ok(true);
});

test("buildHeadlessSubject includes the source count", () => {
  assert.equal(
    buildHeadlessSubject(fixtureHeadlessSummary),
    "Caldearte — resumen de fuentes brillantes (headless) (20/07/2026, 1 fuente(s))",
  );
});

test("buildHeadlessBody includes the sources fetched, event counts, and cost breakdown — no comunas/failed-units sections, unlike buildBody", () => {
  const body = buildHeadlessBody(fixtureHeadlessSummary);
  assert.match(body, /FUENTES CONSULTADAS \(1\)/);
  assert.match(body, /https:\/\/mavi\.uc\.cl\/exposiciones-actuales\//);
  assert.match(body, /Total candidatos: 3/);
  assert.match(body, /Insertados en el calendario: 2/);
  assert.match(body, /Anthropic \(Haiku\): \$0\.0200/);
  assert.match(body, /\$4\.34 de \$50\.00/);
  assert.doesNotMatch(body, /COMUNAS/);
  assert.doesNotMatch(body, /UNIDADES FALLIDAS/);
});

test("buildHeadlessBody handles no sources due cleanly", () => {
  const body = buildHeadlessBody({ ...fixtureHeadlessSummary, sourcesFetched: [] });
  assert.match(body, /FUENTES CONSULTADAS \(0\)\n\(ninguna debida esta corrida\)/);
});

test("buildHeadlessHtmlBody renders the MAVI event table with source link and venue", () => {
  const html = buildHeadlessHtmlBody(fixtureHeadlessSummary);
  assert.match(html, /mavi\.uc\.cl\/exposiciones-actuales\/ \(1\)/);
  assert.match(html, /✅ Aprobado/);
  assert.match(html, /Muestra en el MAVI/);
  assert.match(html, /Museo de Artes Visuales MAVI UC/);
});

const fixtureExisting: EscalationSide = {
  title: "Existen otros mundos, pero están en este",
  sourceUrl: "https://www.arteinformado.com/agenda/f/existen-otros-mundos-pero-estan-en-este-243857",
  reasoning: "Exposición de arte visual en MAC. Vigente durante julio 2026. Ubicación clara, imagen disponible.",
};

const fixtureNewCandidate: EscalationSide = {
  title: "Muestra \"Existen otros mundos, pero están en este\"",
  sourceUrl: "https://uchile.cl/agenda/239614/muestra-existen-otros-mundos-pero-estan-en-este-en-mac-quinta-normal",
  reasoning: "Muestra de pintura que incluye figuras con temática religiosa/mítica explícita. Cae bajo eje de exclusión por religión.",
};

test("sendEscalationEmail: no-ops with a warning when RESEND_API_KEY is unset", async () => {
  const original = process.env.RESEND_API_KEY;
  delete process.env.RESEND_API_KEY;

  try {
    await sendEscalationEmail(fixtureExisting, fixtureNewCandidate, "accept-token", "reject-token");
  } finally {
    if (original !== undefined) process.env.RESEND_API_KEY = original;
  }

  assert.ok(true);
});

test("sendEscalationEmail: no-ops with a warning when SUPABASE_URL is unset — can't build decision links", async () => {
  const originalKey = process.env.RESEND_API_KEY;
  const originalUrl = process.env.SUPABASE_URL;
  process.env.RESEND_API_KEY = "test-key";
  delete process.env.SUPABASE_URL;

  try {
    await sendEscalationEmail(fixtureExisting, fixtureNewCandidate, "accept-token", "reject-token");
  } finally {
    if (originalKey !== undefined) process.env.RESEND_API_KEY = originalKey;
    else delete process.env.RESEND_API_KEY;
    if (originalUrl !== undefined) process.env.SUPABASE_URL = originalUrl;
  }

  assert.ok(true);
});

test("buildEscalationSubject includes both titles", () => {
  assert.equal(
    buildEscalationSubject(fixtureExisting, fixtureNewCandidate),
    '⚠️ Conflicto de curatoría: "Existen otros mundos, pero están en este" vs "Muestra "Existen otros mundos, pero están en este""',
  );
});

const fixtureFunctionBaseUrl = "https://xyzproject.functions.supabase.co/curation-escalation-decide";

test("buildEscalationBody includes both versions' title, source, and reasoning, plus both decision links", () => {
  const body = buildEscalationBody(fixtureExisting, fixtureNewCandidate, fixtureFunctionBaseUrl, "accept-token", "reject-token");
  assert.match(body, /Versión ya existente/);
  assert.match(body, /arteinformado\.com/);
  assert.match(body, /Ubicación clara, imagen disponible/);
  assert.match(body, /Versión nueva de esta corrida/);
  assert.match(body, /uchile\.cl/);
  assert.match(body, /eje de exclusión por religión/);
  assert.match(body, /token=accept-token&action=accept/);
  assert.match(body, /token=reject-token&action=reject/);
});

test("buildEscalationHtmlBody renders both versions with source links and both action buttons", () => {
  const html = buildEscalationHtmlBody(fixtureExisting, fixtureNewCandidate, fixtureFunctionBaseUrl, "accept-token", "reject-token");
  assert.match(html, /Versión ya existente/);
  assert.match(html, /Versión nueva de esta corrida/);
  assert.match(html, /href="https:\/\/www\.arteinformado\.com/);
  assert.match(html, /href="https:\/\/uchile\.cl/);
  assert.match(html, /token=accept-token&action=accept/);
  assert.match(html, /token=reject-token&action=reject/);
});

const fixtureDigestSections: DigestSection[] = [
  {
    label: "Inauguraciones de esta semana",
    events: [
      {
        id: "event-estrella-distante",
        title: "Estrella distante",
        placeName: "MAC Quinta Normal",
        comunaName: "Quinta Normal",
        openingDatetime: "2026-08-03T20:00:00.000Z",
        openingTimeConfirmed: true,
        runEndDate: "2026-09-01",
        imageUrl: "https://example.com/estrella.jpg",
        isOpeningThisWeek: true,
      },
    ],
  },
  {
    label: "En otras regiones",
    events: [
      {
        id: "event-salafem",
        title: "SalaFEM2026",
        placeName: "Sala FEM",
        comunaName: null,
        openingDatetime: null,
        openingTimeConfirmed: true,
        runEndDate: "2026-08-15",
        imageUrl: null,
        isOpeningThisWeek: false,
      },
    ],
  },
];

test("buildDigestSubject counts every event across all sections", () => {
  assert.equal(buildDigestSubject(fixtureDigestSections), "Caldearte — tu semana en arte (2 expos)");
});

test("buildDigestSubject uses singular for exactly one event", () => {
  assert.equal(buildDigestSubject([fixtureDigestSections[0]]), "Caldearte — tu semana en arte (1 expo)");
});

test("buildDigestSubject includes the week's date range when provided, making the subject unique week to week — real feedback: Gmail threads emails with an identical subject sent close together", () => {
  assert.equal(
    buildDigestSubject(fixtureDigestSections, { start: "2026-07-27", end: "2026-08-02" }),
    "Caldearte — tu semana en arte, 27 de julio al 2 de agosto 2026 (2 expos)",
  );
});

// Pinned so date-format assertions ("3 de agosto" vs. "3 de agosto de
// 2026") don't depend on the wall-clock year the suite happens to run in.
const WEEK = { start: "2026-08-03", end: "2026-08-09" };

test("buildDigestBody lists every section's events grouped by comuna, links to caldearte.com's own event page, and includes the unsubscribe link", () => {
  const body = buildDigestBody(fixtureDigestSections, "unsub-token", null, WEEK);
  assert.match(body, /Inauguraciones de esta semana/);
  assert.match(body, /\[Quinta Normal\]/);
  assert.match(body, /Estrella distante — MAC Quinta Normal/);
  assert.match(body, /Inauguración: 3 de agosto · \d{1,2}(:\d{2})? hr/);
  assert.match(body, /https:\/\/www\.caldearte\.com\/eventos\/event-estrella-distante/);
  assert.match(body, /En otras regiones/);
  assert.match(body, /\[Otras comunas\]/);
  assert.match(body, /SalaFEM2026 — Sala FEM/);
  assert.match(body, /newsletter\/baja\?token=unsub-token/);
});

test("buildDigestHtmlBody renders every section grouped by comuna as thumbnail cards linking to caldearte.com, includes the branded header, and the unsubscribe link", () => {
  const html = buildDigestHtmlBody(fixtureDigestSections, "unsub-token");
  assert.match(html, />CALDE</);
  assert.match(html, />ARTE\.</);
  assert.match(html, /INAUGU[\s\S]*?RACIONES\./);
  assert.match(html, />Quinta Normal</);
  assert.match(html, /href="https:\/\/www\.caldearte\.com\/eventos\/event-estrella-distante"/);
  assert.match(html, /src="https:\/\/example\.com\/estrella\.jpg"/);
  assert.match(html, /SalaFEM2026/);
  assert.match(html, /newsletter\/baja\?token=unsub-token/);
});

test("buildDigestHtmlBody: the CALDE/ARTE. header is a link to the homepage, styled in the real brand magenta and without an underline so it reads as a logo, not a link — Rediseño 2.0.0 pass, 2026-08-07/08 (was white-on-black, predating the real site's own two-line bold-magenta wordmark)", () => {
  const html = buildDigestHtmlBody(fixtureDigestSections, "unsub-token");
  const wordmarkLink = html.match(/<a href="https:\/\/www\.caldearte\.com" style="([^"]*)">[\s\S]*?<\/a>/);
  assert.ok(wordmarkLink, "expected a homepage link wrapping the wordmark");
  assert.match(wordmarkLink![1], /color:#ff00fb/);
  assert.match(wordmarkLink![1], /text-decoration:none/);
  assert.match(wordmarkLink![0], /CALDE[\s\S]*?ARTE\./);
});

test("buildDigestBody and buildDigestHtmlBody render a section's emptyMessage instead of a card list when it has no events", () => {
  const sections: DigestSection[] = [
    {
      label: "Inauguraciones de esta semana",
      events: [],
      emptyMessage: "No hemos encontrado ninguna inauguración para esta semana aún. Si sabes de una, avísanos.",
    },
  ];
  const body = buildDigestBody(sections, "unsub-token");
  assert.match(body, /No hemos encontrado ninguna inauguración para esta semana aún\. Si sabes de una, avísanos\./);

  const html = buildDigestHtmlBody(sections, "unsub-token");
  assert.match(html, /No hemos encontrado ninguna inauguración para esta semana aún\. Si sabes de una, avísanos\./);
});

test("buildDigestBody and buildDigestHtmlBody render a section's moreLink alongside its events", () => {
  const sections: DigestSection[] = [
    {
      ...fixtureDigestSections[1],
      moreLink: { label: "Si deseas puedes explorar las 75 exposiciones activas esta semana a lo largo de Chile", url: "https://www.caldearte.com" },
    },
  ];
  const body = buildDigestBody(sections, "unsub-token");
  assert.match(body, /Si deseas puedes explorar las 75 exposiciones activas esta semana a lo largo de Chile: https:\/\/www\.caldearte\.com/);

  const html = buildDigestHtmlBody(sections, "unsub-token");
  assert.match(html, /<a href="https:\/\/www\.caldearte\.com"[^>]*>Si deseas puedes explorar las 75 exposiciones activas esta semana a lo largo de Chile<\/a>/);
});

test("buildDigestBody omits the hour for an opening whose time isn't confirmed", () => {
  const sections: DigestSection[] = [
    {
      label: "Inauguraciones de esta semana",
      events: [
        {
          id: "event-sin-hora",
          title: "Sín-tesis",
          placeName: "Galería NAC",
          comunaName: "Providencia",
          openingDatetime: "2026-08-05T00:00:00.000Z",
          openingTimeConfirmed: false,
          runEndDate: null,
          imageUrl: null,
          isOpeningThisWeek: true,
        },
      ],
    },
  ];
  const body = buildDigestBody(sections, "unsub-token", null, WEEK);
  assert.match(body, /Sín-tesis — Galería NAC — Inauguración: 5 de agosto$/m);
});

test("fmtDigestDate: an event whose opening was weeks ago (still running, isOpeningThisWeek: false) renders 'Hasta el <fecha>', never 'Inauguración:' — real bug found 2026-07-31 where a past opening date read as if it were opening soon", () => {
  const sections: DigestSection[] = [
    {
      label: "Expos para visitar esta semana",
      events: [
        {
          id: "event-ya-abierto",
          title: "En el Tiempo a Distancia",
          placeName: "D21 Proyectos de Arte",
          comunaName: "Santiago",
          openingDatetime: "2026-07-02T19:00:00.000Z",
          openingTimeConfirmed: true,
          runEndDate: "2026-08-20",
          imageUrl: null,
          isOpeningThisWeek: false,
        },
      ],
    },
  ];
  const body = buildDigestBody(sections, "unsub-token", null, WEEK);
  assert.doesNotMatch(body, /Inauguración/);
  assert.match(body, /Hasta el 20 de agosto/);

  const html = buildDigestHtmlBody(sections, "unsub-token", null, WEEK);
  assert.doesNotMatch(html, /Inauguración/);
  assert.match(html, /Hasta el 20 de agosto/);
});

test("fmtDigestDate: dates render as 'día de mes', with the year appended only when it differs from the digest's own send year", () => {
  const sameYear: DigestSection[] = [
    {
      label: "Expos para visitar esta semana",
      events: [
        {
          id: "e-same-year",
          title: "Cierra este año",
          placeName: "Sala X",
          comunaName: "Santiago",
          openingDatetime: null,
          openingTimeConfirmed: true,
          runEndDate: "2026-08-20",
          imageUrl: null,
          isOpeningThisWeek: false,
        },
      ],
    },
  ];
  const bodySameYear = buildDigestBody(sameYear, "unsub-token", null, WEEK);
  assert.match(bodySameYear, /Hasta el 20 de agosto$/m);
  assert.doesNotMatch(bodySameYear, /de 2026/);

  const nextYear: DigestSection[] = [
    {
      label: "Expos para visitar esta semana",
      events: [
        {
          id: "e-next-year",
          title: "Cierra el próximo año",
          placeName: "Sala Y",
          comunaName: "Santiago",
          openingDatetime: null,
          openingTimeConfirmed: true,
          runEndDate: "2027-01-15",
          imageUrl: null,
          isOpeningThisWeek: false,
        },
      ],
    },
  ];
  const bodyNextYear = buildDigestBody(nextYear, "unsub-token", null, WEEK);
  assert.match(bodyNextYear, /Hasta el 15 de enero de 2027$/m);
});

test("buildDigestBody includes the AI-generated intro as the first line when present", () => {
  const body = buildDigestBody(fixtureDigestSections, "unsub-token", "Esta semana destaca una inauguración en el MAC.");
  assert.match(body, /^Esta semana destaca una inauguración en el MAC\./);
});

test("buildDigestHtmlBody includes the AI-generated intro when present, and omits it when null", () => {
  const withIntro = buildDigestHtmlBody(fixtureDigestSections, "unsub-token", "Esta semana destaca una inauguración en el MAC.");
  assert.match(withIntro, /Esta semana destaca una inauguración en el MAC\./);

  const withoutIntro = buildDigestHtmlBody(fixtureDigestSections, "unsub-token", null);
  assert.doesNotMatch(withoutIntro, /Esta semana destaca/);
});

test("buildDigestHtmlBody: the header always shows the fixed 'GUIA INDEPENDIENTE DE ARTE.' tagline, plus a right-aligned week line and región line only when those are provided — restacked 2026-08-08, user's own manual redesign pass", () => {
  const withWeekAndRegion = buildDigestHtmlBody(fixtureDigestSections, "unsub-token", null, { start: "2026-07-27", end: "2026-08-02" }, null, "Región Metropolitana de Santiago");
  assert.match(withWeekAndRegion, />GUIA INDEPENDIENTE DE ARTE\.</);
  assert.match(withWeekAndRegion, /SEMANA DEL 27 DE JULIO AL 2 DE AGOSTO/);
  assert.doesNotMatch(withWeekAndRegion, /DE AGOSTO 2026/);
  assert.match(withWeekAndRegion, />SANTIAGO</);

  const withNeither = buildDigestHtmlBody(fixtureDigestSections, "unsub-token");
  assert.match(withNeither, />GUIA INDEPENDIENTE DE ARTE\.</);
  assert.doesNotMatch(withNeither, /SEMANA DEL/);
});

test("buildDigestBody includes the week date range as its first line when provided", () => {
  const body = buildDigestBody(fixtureDigestSections, "unsub-token", null, { start: "2026-07-27", end: "2026-08-02" });
  assert.match(body, /^27 de julio al 2 de agosto 2026/);
});

test("eventCardHtml: the whole card is one link to caldearte.com's event page, with the date, title, and placeName — matching the real site's EventHorizontalListItem order (badge, title, venue), 2026-08-08", () => {
  const html = buildDigestHtmlBody(fixtureDigestSections, "unsub-token");
  assert.match(
    html,
    /<a href="https:\/\/www\.caldearte\.com\/eventos\/event-estrella-distante"[^>]*>[\s\S]*?Inauguración[\s\S]*?Estrella distante[\s\S]*?MAC Quinta Normal[\s\S]*?<\/a>/,
  );
});

test("buildDigestHtmlBody: under ~400px, event cards stack (photo full width on top, text full width below) via a <style> media query — the classed thumb/gap/text cells and their <style> rule are present, for both a real photo and the no-image placeholder — 2026-08-08", () => {
  const html = buildDigestHtmlBody(fixtureDigestSections, "unsub-token");
  assert.match(html, /@media \(max-width: 400px\) \{[\s\S]*?\.ev-thumb-td, \.ev-text-td \{ display: block !important; width: 100% !important; \}/);
  assert.match(html, /\.ev-gap-td \{ display: none !important; \}/);
  assert.match(html, /class="ev-thumb-td"/);
  assert.match(html, /class="ev-gap-td"/);
  assert.match(html, /class="ev-text-td"/);
  assert.match(html, /class="ev-thumb-img"/); // event-estrella-distante has a real imageUrl
  assert.match(html, /class="ev-thumb-ph"/); // event-salafem has imageUrl: null
});

test("eventCardHtml: shows an ÚLTIMOS DÍAS badge when the run ends within 7 days of the digest's own week.start, never otherwise", () => {
  const closingSoonEvent: DigestSection[] = [
    {
      label: "Expos para visitar esta semana",
      events: [
        {
          id: "event-closing-soon",
          title: "Cierra pronto",
          placeName: "Sala Z",
          comunaName: "Santiago",
          openingDatetime: null,
          openingTimeConfirmed: true,
          runEndDate: "2026-08-05",
          imageUrl: null,
          isOpeningThisWeek: false,
        },
      ],
    },
  ];
  const withBadge = buildDigestHtmlBody(closingSoonEvent, "unsub-token", null, WEEK);
  assert.match(withBadge, /ÚLTIMOS DÍAS/);

  const withoutWeek = buildDigestHtmlBody(closingSoonEvent, "unsub-token", null);
  assert.doesNotMatch(withoutWeek, /ÚLTIMOS DÍAS/);

  const farFromClosing = buildDigestHtmlBody(fixtureDigestSections, "unsub-token", null, WEEK);
  assert.doesNotMatch(farFromClosing, /ÚLTIMOS DÍAS/);
});

test("buildDigestBody and buildDigestHtmlBody render the otherRegionsIntro right under the 'En otras regiones' heading, and omit it (and its section) when absent — Rediseño 2.0.0 pass 2026-08-08", () => {
  const otherRegionsIntro = "En regiones, destaca una muestra sobre memoria y territorio en Concepción.";

  const body = buildDigestBody(fixtureDigestSections, "unsub-token", null, undefined, otherRegionsIntro);
  assert.match(body, /-- En otras regiones --\nEn regiones, destaca una muestra sobre memoria y territorio en Concepción\./);

  const html = buildDigestHtmlBody(fixtureDigestSections, "unsub-token", null, undefined, otherRegionsIntro);
  assert.match(html, /EN OTRAS REGIONES\.<\/p>\s*<p[^>]*>En regiones, destaca una muestra sobre memoria y territorio en Concepción\.<\/p>/);

  const withoutIntro = buildDigestHtmlBody(fixtureDigestSections, "unsub-token");
  assert.doesNotMatch(withoutIntro, /destaca una muestra/);
});

test("buildDigestHtmlBody: the 2 mapped section labels render as hand-broken stacked lines at 55px (85px read as too big, same as the CALDEARTE logo — scaled down same-day follow-up), 'En otras regiones' renders as a plain black headline instead, and an unmapped label falls back to plain text at the same size — 2026-08-08", () => {
  const html = buildDigestHtmlBody(fixtureDigestSections, "unsub-token");
  assert.match(
    html,
    /<h2[^>]*font-size:55px[^>]*><span style="display:block;">INAUGU<\/span><span style="display:block;">RACIONES\.<\/span><\/h2>/,
  );
  assert.match(html, /<p[^>]*font-size:40px[^>]*>EN OTRAS REGIONES\.<\/p>/);
  assert.doesNotMatch(html, /<h2[^>]*>[\s\S]*?EN[\s\S]*?OTRAS[\s\S]*?<\/h2>/);

  const unmappedLabelSections: DigestSection[] = [{ label: "Sección sin mapear", events: [], emptyMessage: "vacía" }];
  const unmappedHtml = buildDigestHtmlBody(unmappedLabelSections, "unsub-token");
  assert.match(unmappedHtml, /<h2[^>]*font-size:55px[^>]*>Sección sin mapear<\/h2>/);
});

test("buildDigestHtmlBody: the week line and región line render right-aligned in the real Lato logo font under the fixed tagline — 2026-08-08", () => {
  const html = buildDigestHtmlBody(fixtureDigestSections, "unsub-token", null, { start: "2026-07-27", end: "2026-08-02" }, null, "Región Metropolitana de Santiago");
  assert.match(
    html,
    /<p style="margin:50px 0 0;color:#3d373d;font-family:'Lato',Helvetica,Arial,sans-serif;font-weight:900;font-size:20px;line-height:0\.95;text-align:right;overflow-wrap:anywhere;">SEMANA DEL 27 DE JULIO AL 2 DE AGOSTO<\/p>/,
  );
  assert.match(
    html,
    /<p style="margin:6px 0 0;color:#3d373d;font-family:'Lato',Helvetica,Arial,sans-serif;font-weight:900;font-size:57px;line-height:0\.95;text-align:right;overflow-wrap:anywhere;">SANTIAGO<\/p>/,
  );
});

test("buildDigestHtmlBody: the CALDE/ARTE. wordmark renders bigger (85px) and in the real Lato logo font (not the Helvetica approximation), left-aligned above the tagline — 2026-08-08", () => {
  const html = buildDigestHtmlBody(fixtureDigestSections, "unsub-token");
  assert.match(html, /font-family:'Lato',Helvetica,Arial,sans-serif;font-weight:900;font-size:85px[^"]*">\s*<span style="display:block;">CALDE<\/span>/);
});

test("buildDigestHtmlBody: the footer invites readers to flag a missed/misclassified event or share their own work, linking to contacto@caldearte.com — 2026-08-08", () => {
  const html = buildDigestHtmlBody(fixtureDigestSections, "unsub-token");
  assert.match(html, /¿Sientes que nos perdimos una exposición, o que clasificamos algo mal\?/);
  assert.match(html, /¿Estás por compartir tu propia obra con el mundo\?/);
  assert.match(html, /<a href="mailto:contacto@caldearte\.com"[^>]*>Escríbenos a contacto@caldearte\.com<\/a>/);
});

test("sendDigestEmail: no-ops with a warning when RESEND_API_KEY is unset", async () => {
  const original = process.env.RESEND_API_KEY;
  delete process.env.RESEND_API_KEY;
  try {
    await sendDigestEmail("visitante@example.com", "unsub-token", fixtureDigestSections);
  } finally {
    if (original !== undefined) process.env.RESEND_API_KEY = original;
  }
  assert.ok(true);
});
