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
  sendDigestEmail,
  buildDigestSubject,
  buildDigestBody,
  buildDigestHtmlBody,
  buildEventGroupsHtml,
  buildEventGroupsText,
  escapeHtml,
  type RunSummary,
  type HeadlessRunSummary,
  type DigestSection,
  type EventGroup,
} from "./notify.js";

test("escapeHtml: returns an empty string for null/undefined instead of throwing", () => {
  assert.equal(escapeHtml(null), "");
  assert.equal(escapeHtml(undefined), "");
  assert.equal(escapeHtml("<b>&\"x\"</b>"), "&lt;b&gt;&amp;&quot;x&quot;&lt;/b&gt;");
});

test("buildEventGroupsHtml/Text: a candidate with a null location (real production crash 2026-08-30, an Instagram bright source with no fixedLocation and an unplaceable caption) doesn't throw", () => {
  const groups: EventGroup[] = [
    {
      label: "https://instagram.com/example",
      candidates: [
        {
          title: "Muestra sin ubicación",
          status: "approved",
          location: null as unknown as string,
          placeName: null,
          runStartDate: null,
          runEndDate: null,
          curationReasoning: "ok",
          sourceUrl: null,
          outcome: "inserted",
        },
      ],
    },
  ];

  assert.doesNotThrow(() => buildEventGroupsHtml(groups));
  assert.doesNotThrow(() => buildEventGroupsText(groups));
});

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


const fixtureDigestSections: DigestSection[] = [
  {
    label: "Inauguraciones de jueves a domingo",
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
    compact: true,
    moreLink: { label: "Y fuera de Santiago, 1 exposición más a lo largo de Chile", url: "https://www.caldearte.com" },
  },
];

test("buildDigestSubject leads with the number of openings Thursday to Sunday and the subscriber's región — 2026-10-18", () => {
  assert.equal(
    buildDigestSubject(fixtureDigestSections, { start: "2026-10-22", end: "2026-10-25" }, "Región Metropolitana de Santiago"),
    "1 inauguración de jueves a domingo en Santiago — Caldearte, 22 al 25 de octubre 2026",
  );
});

test("buildDigestSubject pluralizes openings and still works without región or dates", () => {
  const opening = fixtureDigestSections[0];
  const twoOpenings: DigestSection = { ...opening, events: [...opening.events, { ...opening.events[0], id: "otra" }] };
  assert.equal(buildDigestSubject([twoOpenings]), "2 inauguraciones de jueves a domingo — Caldearte");
});

test("buildDigestSubject with no openings falls back to a plain weekend line", () => {
  const noOpenings = fixtureDigestSections.filter((s) => s.label !== "Inauguraciones de jueves a domingo");
  assert.equal(
    buildDigestSubject(noOpenings, { start: "2026-10-22", end: "2026-10-25" }, "Valparaíso"),
    "Arte de jueves a domingo en Valparaíso — Caldearte, 22 al 25 de octubre 2026",
  );
});

// Pinned so date-format assertions ("3 de agosto" vs. "3 de agosto de
// 2026") don't depend on the wall-clock year the suite happens to run in.
const WEEK = { start: "2026-08-03", end: "2026-08-09" };

test("buildDigestBody lists the openings grouped by day, links to caldearte.com's own event page, gives a compact section one line with its link, and includes the unsubscribe link", () => {
  const body = buildDigestBody(fixtureDigestSections, "unsub-token", null, WEEK);
  assert.match(body, /^EL ARTE MÁS CERCA\n3 al 9 de agosto 2026/);
  assert.match(body, /Inauguraciones de jueves a domingo/);
  assert.match(body, /\[Lunes 3\]/);
  assert.match(body, /Estrella distante — MAC Quinta Normal/);
  assert.match(body, /Inauguración: 3 de agosto · \d{1,2}(:\d{2})? hr/);
  assert.match(body, /https:\/\/www\.caldearte\.com\/eventos\/event-estrella-distante/);
  assert.match(body, /-- En otras regiones --\nY fuera de Santiago, 1 exposición más a lo largo de Chile: https:\/\/www\.caldearte\.com/);
  assert.doesNotMatch(body, /SalaFEM2026/, "a compact section lists no events");
  assert.match(body, /newsletter\/baja\?token=unsub-token/);
});

test("buildDigestHtmlBody renders the openings as cards linking to caldearte.com, a compact section as one linked line, the branded header, and the unsubscribe link", () => {
  const html = buildDigestHtmlBody(fixtureDigestSections, "unsub-token", null, WEEK);
  assert.match(html, />CALDE</);
  assert.match(html, />ARTE\.</);
  assert.match(html, /INAUGU[\s\S]*?RACIONES\./);
  assert.match(html, />Lunes 3</);
  assert.match(html, /href="https:\/\/www\.caldearte\.com\/eventos\/event-estrella-distante"/);
  assert.match(html, /src="https:\/\/example\.com\/estrella\.jpg"/);
  assert.match(html, /<a href="https:\/\/www\.caldearte\.com"[^>]*>Y fuera de Santiago, 1 exposición más a lo largo de Chile<\/a>/);
  assert.doesNotMatch(html, /SalaFEM2026/);
  assert.match(html, /newsletter\/baja\?token=unsub-token/);
});

test("buildDigestHtmlBody: the CALDE/ARTE. header is a link to the homepage, in the brand magenta and the Lato logo font, without an underline so it reads as a logo", () => {
  const html = buildDigestHtmlBody(fixtureDigestSections, "unsub-token");
  const wordmarkLink = html.match(/<a href="https:\/\/www\.caldearte\.com" style="([^"]*)">[\s\S]*?<\/a>/);
  assert.ok(wordmarkLink, "expected a homepage link wrapping the wordmark");
  assert.match(wordmarkLink![1], /color:#ff00fb/);
  assert.match(wordmarkLink![1], /text-decoration:none/);
  assert.match(wordmarkLink![1], /font-family:'Lato',Helvetica,Arial,sans-serif;font-weight:900/);
  assert.match(wordmarkLink![0], /CALDE[\s\S]*?ARTE\./);
});

test("buildDigestHtmlBody: the header carries the site's slogan EL ARTE MÁS CERCA (not the old GUIA INDEPENDIENTE DE ARTE.), then the weekend and the región as the site's pills, only when given — 2026-10-18", () => {
  const html = buildDigestHtmlBody(fixtureDigestSections, "unsub-token", null, { start: "2026-10-22", end: "2026-10-25" }, "Región Metropolitana de Santiago");
  assert.match(html, />EL ARTE MÁS CERCA</);
  assert.doesNotMatch(html, /GUIA INDEPENDIENTE/);
  assert.match(html, /<span[^>]*border-radius:12px[^>]*>Jue 22 al dom 25 oct<\/span> en <span[^>]*>Santiago<\/span>/);

  const withNeither = buildDigestHtmlBody(fixtureDigestSections, "unsub-token");
  assert.match(withNeither, />EL ARTE MÁS CERCA</);
  assert.doesNotMatch(withNeither, /al dom/);
});

test("buildDigestBody and buildDigestHtmlBody render a section's emptyMessage instead of a card list when it has no events", () => {
  const sections: DigestSection[] = [
    {
      label: "Inauguraciones de jueves a domingo",
      events: [],
      emptyMessage: "No hemos encontrado ninguna inauguración para esta semana aún. Si sabes de una, avísanos.",
    },
  ];
  const body = buildDigestBody(sections, "unsub-token");
  assert.match(body, /No hemos encontrado ninguna inauguración para esta semana aún\. Si sabes de una, avísanos\./);

  const html = buildDigestHtmlBody(sections, "unsub-token");
  assert.match(html, /No hemos encontrado ninguna inauguración para esta semana aún\. Si sabes de una, avísanos\./);
});

test("buildDigestBody and buildDigestHtmlBody: a compact section with nothing to link shows its emptyMessage as plain text", () => {
  const sections: DigestSection[] = [
    { label: "Visitas guiadas de jueves a domingo", events: [], compact: true, emptyMessage: "Ninguna visita guiada programada de jueves a domingo." },
  ];
  assert.match(buildDigestBody(sections, "unsub-token"), /-- Visitas guiadas de jueves a domingo --\nNinguna visita guiada programada de jueves a domingo\./);
  const html = buildDigestHtmlBody(sections, "unsub-token");
  assert.match(html, /<p[^>]*>Ninguna visita guiada programada de jueves a domingo\.<\/p>/);
  assert.doesNotMatch(html, /<h2/);
});

test("buildDigestHtmlBody: a card section's moreLink renders as a magenta button under its cards", () => {
  const sections: DigestSection[] = [{ ...fixtureDigestSections[0], moreLink: { label: "Ver todas", url: "https://www.caldearte.com" } }];
  const html = buildDigestHtmlBody(sections, "unsub-token");
  assert.match(html, /<a href="https:\/\/www\.caldearte\.com" style="display:inline-block;background:#ff00fb;color:#fff;border-radius:999px;[^"]*">Ver todas<\/a>/);
  assert.match(buildDigestBody(sections, "unsub-token"), /Ver todas: https:\/\/www\.caldearte\.com/);
});

test("buildDigestBody omits the hour for an opening whose time isn't confirmed, and the card's pill says HORA POR CONF.", () => {
  const sections: DigestSection[] = [
    {
      label: "Inauguraciones de jueves a domingo",
      events: [
        {
          id: "event-sin-hora",
          title: "Sín-tesis",
          placeName: "Galería NAC",
          comunaName: "Providencia",
          openingDatetime: "2026-08-05T16:00:00.000Z",
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
  const html = buildDigestHtmlBody(sections, "unsub-token", null, WEEK);
  assert.match(html, />PROVIDENCIA · MIÉ 5 AGO · HORA POR CONF\.</);
});

test("eventCardHtml: one row per event at every screen size — 96×120 thumbnail (or a dark placeholder), magenta title, magenta COMUNA · DÍA · HORA pill and venue, like the site's AgendaCard, all one link — 2026-10-18 (was a stacked full-width photo on phones)", () => {
  const html = buildDigestHtmlBody(fixtureDigestSections, "unsub-token", null, WEEK);
  assert.match(
    html,
    /<a href="https:\/\/www\.caldearte\.com\/eventos\/event-estrella-distante"[^>]*>[\s\S]*?width:96px;height:120px[\s\S]*?Estrella distante[\s\S]*?QUINTA NORMAL · LUN 3 AGO · \d{1,2}(:\d{2})? HR[\s\S]*?MAC Quinta Normal[\s\S]*?<\/a>/,
  );
  assert.doesNotMatch(html, /@media/, "no stacking breakpoint anymore");

  const noImage: DigestSection[] = [{ ...fixtureDigestSections[0], events: [{ ...fixtureDigestSections[0].events[0], imageUrl: null }] }];
  assert.match(buildDigestHtmlBody(noImage, "unsub-token"), /<div style="width:96px;height:120px;background:#3a3a3a;/);
});

test("fmtDigestDate / card pill: an event whose opening was weeks ago (still running, isOpeningThisWeek: false) reads as running until its end, never 'Inauguración:' — real bug found 2026-07-31 where a past opening date read as if it were opening soon", () => {
  const sections: DigestSection[] = [
    {
      label: "Inauguraciones de jueves a domingo",
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
  assert.doesNotMatch(body, /Inauguración:/);
  assert.match(body, /Hasta el 20 de agosto/);
  assert.match(body, /\[Santiago\]/, "no opening this weekend → grouped by comuna, not by day");

  const html = buildDigestHtmlBody(sections, "unsub-token", null, WEEK);
  assert.match(html, />SANTIAGO · HASTA EL 20 AGO</);
});

test("fmtDigestDate: dates render as 'día de mes', with the year appended only when it differs from the digest's own send year", () => {
  const section = (id: string, runEndDate: string): DigestSection[] => [
    {
      label: "Inauguraciones de jueves a domingo",
      events: [
        { id, title: "Muestra", placeName: "Sala X", comunaName: "Santiago", openingDatetime: null, openingTimeConfirmed: true, runEndDate, imageUrl: null, isOpeningThisWeek: false },
      ],
    },
  ];
  const bodySameYear = buildDigestBody(section("e-same-year", "2026-08-20"), "unsub-token", null, WEEK);
  assert.match(bodySameYear, /Hasta el 20 de agosto$/m);
  assert.doesNotMatch(bodySameYear, /de 2026/);

  assert.match(buildDigestBody(section("e-next-year", "2027-01-15"), "unsub-token", null, WEEK), /Hasta el 15 de enero de 2027$/m);
  assert.match(buildDigestHtmlBody(section("e-next-year", "2027-01-15"), "unsub-token", null, WEEK), />SANTIAGO · HASTA EL 15 ENE '27</);
});

test("buildDigestBody includes the AI-generated intro right after the header lines when present", () => {
  const body = buildDigestBody(fixtureDigestSections, "unsub-token", "Este finde destaca una inauguración en el MAC.");
  assert.match(body, /^EL ARTE MÁS CERCA\n\nEste finde destaca una inauguración en el MAC\./);
});

test("buildDigestHtmlBody includes the AI-generated intro when present, and omits it when null", () => {
  const withIntro = buildDigestHtmlBody(fixtureDigestSections, "unsub-token", "Este finde destaca una inauguración en el MAC.");
  assert.match(withIntro, /Este finde destaca una inauguración en el MAC\./);

  const withoutIntro = buildDigestHtmlBody(fixtureDigestSections, "unsub-token", null);
  assert.doesNotMatch(withoutIntro, /Este finde destaca/);
});

test("buildDigestHtmlBody: the openings label renders as hand-broken stacked magenta lines, and an unmapped label falls back to plain text at the same size", () => {
  const html = buildDigestHtmlBody(fixtureDigestSections, "unsub-token");
  assert.match(html, /<h2[^>]*font-size:44px[^>]*><span style="display:block;">INAUGU<\/span><span style="display:block;">RACIONES\.<\/span><\/h2>/);

  const unmappedHtml = buildDigestHtmlBody([{ label: "Sección sin mapear", events: [], emptyMessage: "vacía" }], "unsub-token");
  assert.match(unmappedHtml, /<h2[^>]*font-size:44px[^>]*>Sección sin mapear<\/h2>/);
});

test("buildDigestHtmlBody: the footer invites readers to flag a missed/misclassified event or share their own work, linking to contacto@caldearte.com, and repeats the slogan", () => {
  const html = buildDigestHtmlBody(fixtureDigestSections, "unsub-token");
  assert.match(html, /¿Sientes que nos perdimos una exposición, o que clasificamos algo mal\?/);
  assert.match(html, /¿Estás por compartir tu propia obra con el mundo\?/);
  assert.match(html, /<a href="mailto:contacto@caldearte\.com"[^>]*>Escríbenos a contacto@caldearte\.com<\/a>/);
  assert.equal(html.match(/EL ARTE MÁS CERCA/g)?.length, 2);
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
