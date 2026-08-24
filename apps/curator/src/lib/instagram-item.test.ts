import { test } from "node:test";
import assert from "node:assert/strict";
import { toBrightSourceItem, isCaptionWorthCurating } from "./instagram-item.js";
import type { ApifyInstagramPost } from "./apify-instagram.js";
import type { InstagramAccountConfig } from "./instagram-accounts.js";

const ACCOUNT: InstagramAccountConfig = {
  username: "casaculturalyanulaque",
  note: "cuenta de prueba",
  addedAt: "2026-08-12",
};

const POST: ApifyInstagramPost = {
  url: "https://www.instagram.com/p/ABC123/",
  caption: 'Inauguración de la exposición "Mareas"\n20 de agosto, 19:00hrs, entrada liberada.',
  timestamp: "2026-08-07T15:00:00.000Z",
  displayUrl: "https://scontent.cdninstagram.com/v/abc.jpg",
  ownerUsername: "casaculturalyanulaque",
};

test("toBrightSourceItem derives the title from the caption's first line when there's no quoted title", () => {
  const item = toBrightSourceItem({ ...POST, caption: "Inauguración de la exposición Mareas\n20 de agosto, 19:00hrs." }, ACCOUNT);
  assert.equal(item.title, "Inauguración de la exposición Mareas");
});

test("toBrightSourceItem prefers a quoted title over the full first line — real bug found 2026-08-23 auditing production: the first line is almost always a full invitation sentence, not the exhibition name, and the real name is usually quoted somewhere in it", () => {
  const item = toBrightSourceItem(POST, ACCOUNT);
  assert.equal(item.title, "Mareas");
});

test("toBrightSourceItem extracts a quoted title using guillemets («»)", () => {
  const item = toBrightSourceItem(
    { ...POST, caption: "D21 invita a la inauguración de la muestra «Afecto Extraterrestre» del artista Javier González Pesce." },
    ACCOUNT,
  );
  assert.equal(item.title, "Afecto Extraterrestre");
});

test("toBrightSourceItem extracts a quoted title using curly double quotes anywhere in the caption, not just the first line", () => {
  const item = toBrightSourceItem(
    {
      ...POST,
      caption:
        'Los invitamos este 20 de Agosto a las 19:00 hrs, a la Performace “VILO: el peso del fragmento” del artista Sebastián Mahaluf.',
    },
    ACCOUNT,
  );
  assert.equal(item.title, "VILO: el peso del fragmento");
});

test("toBrightSourceItem falls back to the first substantive line when no quoted title exists — accepted imperfection, some captions state the real title unquoted", () => {
  const item = toBrightSourceItem({ ...POST, caption: "Conoce la obra Sempiterno de José Pérez en Museo Taller." }, ACCOUNT);
  assert.equal(item.title, "Conoce la obra Sempiterno de José Pérez en Museo Taller.");
});

test("toBrightSourceItem passes the FULL caption through as both description and rawDateText — Haiku interprets the date itself", () => {
  const item = toBrightSourceItem(POST, ACCOUNT);
  assert.equal(item.description, POST.caption);
  assert.equal(item.rawDateText, POST.caption);
  assert.equal(item.structuredStartDate, null);
  assert.equal(item.structuredEndDate, null);
});

test("toBrightSourceItem carries sourceUrl/imageUrl straight through", () => {
  const item = toBrightSourceItem(POST, ACCOUNT);
  assert.equal(item.sourceUrl, POST.url);
  assert.equal(item.imageUrl, POST.displayUrl);
});

test("toBrightSourceItem falls back to the account username as title when the caption is empty", () => {
  const item = toBrightSourceItem({ ...POST, caption: null }, ACCOUNT);
  assert.equal(item.title, ACCOUNT.username);
  assert.equal(item.description, null);
  assert.equal(item.rawDateText, "");
});

test("toBrightSourceItem truncates a very long first line to 120 chars", () => {
  const longCaption = "x".repeat(200);
  const item = toBrightSourceItem({ ...POST, caption: longCaption }, ACCOUNT);
  assert.equal(item.title.length, 120);
});

test("toBrightSourceItem skips a decoration-only first line (real bug, institutodearte.pucv: every caption opens with a lone '•', collapsing all titles to the same string and causing a false dedup collision between two different real exhibitions)", () => {
  const item = toBrightSourceItem(
    { ...POST, caption: "•\nHiperia\nInauguración lunes 10 de agosto." },
    ACCOUNT,
  );
  assert.equal(item.title, "Hiperia");
});

test("toBrightSourceItem falls back to the account username when EVERY line is decoration-only", () => {
  const item = toBrightSourceItem({ ...POST, caption: "•\n---\n***" }, ACCOUNT);
  assert.equal(item.title, ACCOUNT.username);
});

test("toBrightSourceItem always sets sourceAccount to the account's username — real gap found 2026-08-15: a post's own permalink never embeds which account posted it, so this is the only place that information exists at all", () => {
  const item = toBrightSourceItem(POST, ACCOUNT);
  assert.equal(item.sourceAccount, ACCOUNT.username);
});

test("toBrightSourceItem leaves location/placeName null when the account has no fixedLocation — Haiku infers it", () => {
  const item = toBrightSourceItem(POST, ACCOUNT);
  assert.equal(item.location, null);
  assert.equal(item.placeName, null);
});

// Not baked directly into item.location/placeName anymore — real bug
// found 2026-08-16 (Factoría Santa Rosa posting about a touring show
// actually in Valparaíso): an account's fixedLocation is an assumption,
// not certain per-item data, so it flows through defaultLocation instead,
// letting discover.ts's mergeBrightSourceCandidate override it when
// Haiku's own in-text extraction clearly disagrees.
test("toBrightSourceItem passes the account's fixedLocation as defaultLocation, not directly as location/placeName", () => {
  const fixedAccount: InstagramAccountConfig = {
    ...ACCOUNT,
    fixedLocation: { location: "Santiago", placeName: "Casa Cultural Yanulaque" },
  };
  const item = toBrightSourceItem(POST, fixedAccount);
  assert.equal(item.location, null);
  assert.equal(item.placeName, null);
  assert.deepEqual(item.defaultLocation, { location: "Santiago", placeName: "Casa Cultural Yanulaque" });
});

// Real gap found 2026-08-14 (factor__f's real "se despide" closing post,
// confirmed end date + no opening date in the text) — same backfill
// mechanism as noticias.udec.cl, fed from the post's own timestamp.
test("toBrightSourceItem maps publishedDate from the post's own timestamp (date part only)", () => {
  const item = toBrightSourceItem(POST, ACCOUNT);
  assert.equal(item.publishedDate, "2026-08-07");
});

test("isCaptionWorthCurating rejects a null caption", () => {
  assert.equal(isCaptionWorthCurating(null), false);
});

test("isCaptionWorthCurating rejects a caption too thin to describe a real event — real rejection reason found in production: 'solo un handle de redes sociales sin información de evento'", () => {
  assert.equal(isCaptionWorthCurating("@algunacuenta"), false);
  assert.equal(isCaptionWorthCurating(""), false);
});

test("isCaptionWorthCurating rejects an unambiguous book-launch announcement", () => {
  assert.equal(isCaptionWorthCurating("Este jueves lanzamiento de libro sobre archivo del artista, con conversación abierta al público"), false);
  assert.equal(isCaptionWorthCurating("Los invitamos a la presentación de la publicación que reúne 10 años de trabajo curatorial"), false);
});

test("isCaptionWorthCurating accepts a real, substantial exhibition caption", () => {
  assert.equal(
    isCaptionWorthCurating("Inauguración de la exposición 'Rama torcida' de Juan Pérez, viernes 20 de agosto 19:00 hrs en el MAC Quinta Normal"),
    true,
  );
});

test("isCaptionWorthCurating does not false-positive on 'taller' inside an otherwise valid, substantial caption — too risky to keyword-filter blind (real venue names include it, e.g. @wall.galeriataller)", () => {
  assert.equal(
    isCaptionWorthCurating("Inauguración en Galería Taller Wall este sábado, exposición colectiva de artes visuales, entrada liberada"),
    true,
  );
});
