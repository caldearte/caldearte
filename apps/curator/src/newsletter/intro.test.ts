import { test } from "node:test";
import assert from "node:assert/strict";
import { buildDaysInput, generateDigestTexts, parseDigestTexts, type MessagesClient } from "./intro.js";
import type { DigestSection } from "../lib/notify.js";

const hasLocalSupabase = Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);

const fixtureSections: DigestSection[] = [
  {
    label: "Inauguraciones de jueves a domingo",
    events: [
      {
        id: "e1",
        title: "Estrella distante",
        placeName: "MAC Quinta Normal",
        comunaName: "Quinta Normal",
        openingDatetime: "2026-08-05T20:00:00.000Z",
        openingTimeConfirmed: true,
        runEndDate: "2026-09-01",
        imageUrl: null,
        isOpeningThisWeek: true,
      },
      {
        id: "e4",
        title: "Sín-tesis",
        placeName: "Galería NAC",
        comunaName: "Providencia",
        openingDatetime: "2026-08-07T23:00:00.000Z",
        openingTimeConfirmed: true,
        runEndDate: null,
        imageUrl: null,
        isOpeningThisWeek: true,
      },
    ],
  },
  {
    label: "Expos para visitar de jueves a domingo",
    events: [
      {
        id: "e3",
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
  {
    label: "En otras regiones",
    events: [
      {
        id: "e2",
        title: "Evento de otra región — nunca debería llegar al prompt",
        placeName: "Sala X",
        comunaName: null,
        openingDatetime: null,
        openingTimeConfirmed: true,
        runEndDate: null,
        imageUrl: null,
        isOpeningThisWeek: false,
      },
    ],
  },
];

function stubClient(text: string): MessagesClient {
  return {
    messages: {
      create: async () => ({
        content: [{ type: "text", text }],
        usage: { input_tokens: 100, output_tokens: 20, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 },
      }),
    },
  };
}

test("buildDaysInput: openings grouped under their Santiago date, what's already running in its own block, the real total stated, and nothing from other regiones", () => {
  const input = buildDaysInput(fixtureSections, 36);
  assert.ok(input);
  assert.deepEqual(input.dates, ["2026-08-05", "2026-08-07"]);
  assert.match(input.content, /^Número real de exposiciones activas de jueves a domingo en la región: 36\./);
  assert.match(input.content, /2026-08-05 \(miércoles 5\):\n- Estrella distante \(MAC Quinta Normal, Quinta Normal\)/);
  // 23:00 UTC on the 7th is still the 7th in Santiago (19:00)
  assert.match(input.content, /2026-08-07 \(viernes 7\):\n- Sín-tesis \(Galería NAC, Providencia\)/);
  assert.match(input.content, /Ya en exhibición \(no inauguran\):\n- En el Tiempo a Distancia/);
  assert.doesNotMatch(input.content, /otra región/);
  assert.doesNotMatch(input.content, /2026-09-01|2026-08-20/, "no closing dates reach the model");
});

test("buildDaysInput: nothing opening and nothing running → null, never calls the model", async () => {
  assert.equal(buildDaysInput([], 0), null);
  assert.deepEqual(await generateDigestTexts([], 0, {}), { intro: null, days: {} });
});

test("parseDigestTexts: keeps the intro and only the requested dates, tolerates text around the JSON, drops a text past 60 words", () => {
  const long = Array.from({ length: 61 }, () => "palabra").join(" ");
  const raw = `Aquí va:\n{"intro": " Panorama. ", "dias": {"2026-08-05": "Abre Estrella distante.", "2026-08-07": "${long}", "2026-08-09": "Inventado."}}`;
  assert.deepEqual(parseDigestTexts(raw, ["2026-08-05", "2026-08-07"]), { intro: "Panorama.", days: { "2026-08-05": "Abre Estrella distante." } });
});

test("parseDigestTexts: anything that isn't JSON → null", () => {
  assert.equal(parseDigestTexts("Esta semana hay arte.", ["2026-08-05"]), null);
  assert.equal(parseDigestTexts('{"intro": "x", ', ["2026-08-05"]), null);
});

test(
  "generateDigestTexts: returns the parsed intro and day paragraphs and records usage under the newsletter_intro purpose",
  { skip: !hasLocalSupabase },
  async () => {
    const { getCurrentMonthSpend } = await import("../lib/usage-tracking.js");
    const spendBefore = await getCurrentMonthSpend();
    const texts = await generateDigestTexts(fixtureSections, 2, {
      messagesClient: stubClient('{"intro": "Dos aperturas.", "dias": {"2026-08-05": "Abre Estrella distante en el MAC.", "2026-08-07": "Sín-tesis en Galería NAC."}}'),
    });
    assert.deepEqual(texts, { intro: "Dos aperturas.", days: { "2026-08-05": "Abre Estrella distante en el MAC.", "2026-08-07": "Sín-tesis en Galería NAC." } });
    assert.ok((await getCurrentMonthSpend()) > spendBefore, "expected recordUsage to add a newsletter_intro row with nonzero cost");
  },
);

test(
  "generateDigestTexts: degrades to no texts (not a thrown error) when the model call fails or answers without JSON",
  { skip: !hasLocalSupabase },
  async () => {
    const failing: MessagesClient = {
      messages: {
        create: async () => {
          throw new Error("simulated API failure");
        },
      },
    };
    assert.deepEqual(await generateDigestTexts(fixtureSections, 2, { messagesClient: failing }), { intro: null, days: {} });
    assert.deepEqual(await generateDigestTexts(fixtureSections, 2, { messagesClient: stubClient("Sin JSON.") }), { intro: null, days: {} });
  },
);
