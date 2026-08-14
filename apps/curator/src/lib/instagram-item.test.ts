import { test } from "node:test";
import assert from "node:assert/strict";
import { toBrightSourceItem } from "./instagram-item.js";
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

test("toBrightSourceItem derives the title from the caption's first line", () => {
  const item = toBrightSourceItem(POST, ACCOUNT);
  assert.equal(item.title, 'Inauguración de la exposición "Mareas"');
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

test("toBrightSourceItem leaves location/placeName null when the account has no fixedLocation — Haiku infers it", () => {
  const item = toBrightSourceItem(POST, ACCOUNT);
  assert.equal(item.location, null);
  assert.equal(item.placeName, null);
});

test("toBrightSourceItem uses the account's fixedLocation when set, same precedence as known-sources.ts", () => {
  const fixedAccount: InstagramAccountConfig = {
    ...ACCOUNT,
    fixedLocation: { location: "Santiago", placeName: "Casa Cultural Yanulaque" },
  };
  const item = toBrightSourceItem(POST, fixedAccount);
  assert.equal(item.location, "Santiago");
  assert.equal(item.placeName, "Casa Cultural Yanulaque");
});

// Real gap found 2026-08-14 (factor__f's real "se despide" closing post,
// confirmed end date + no opening date in the text) — same backfill
// mechanism as noticias.udec.cl, fed from the post's own timestamp.
test("toBrightSourceItem maps publishedDate from the post's own timestamp (date part only)", () => {
  const item = toBrightSourceItem(POST, ACCOUNT);
  assert.equal(item.publishedDate, "2026-08-07");
});
