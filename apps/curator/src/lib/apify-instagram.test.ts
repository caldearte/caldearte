import { test } from "node:test";
import assert from "node:assert/strict";
import { parseApifyInstagramPosts, usernameFromProfileUrl } from "./apify-instagram.js";

// Best-guess shape for apify/instagram-post-scraper's basicData output —
// see apify-instagram.ts's own doc comment: not confirmed field-by-field
// against a real run yet, verify this fixture against the first real test
// run before trusting it further.
const SAMPLE_ITEM = {
  url: "https://www.instagram.com/p/ABC123/",
  caption: "Inauguración de la exposición \"Mareas\" — 20 de agosto, 19:00hrs",
  timestamp: "2026-08-07T15:00:00.000Z",
  displayUrl: "https://scontent.cdninstagram.com/v/abc.jpg",
  ownerUsername: "casaculturalyanulaque",
};

test("parseApifyInstagramPosts extracts the fields toBrightSourceItem needs", () => {
  const [post] = parseApifyInstagramPosts([SAMPLE_ITEM]);
  assert.equal(post.url, SAMPLE_ITEM.url);
  assert.equal(post.caption, SAMPLE_ITEM.caption);
  assert.equal(post.timestamp, SAMPLE_ITEM.timestamp);
  assert.equal(post.displayUrl, SAMPLE_ITEM.displayUrl);
  assert.equal(post.ownerUsername, SAMPLE_ITEM.ownerUsername);
});

test("parseApifyInstagramPosts handles a missing caption/displayUrl gracefully", () => {
  const [post] = parseApifyInstagramPosts([{ url: "https://www.instagram.com/p/XYZ/", ownerUsername: "someacct" }]);
  assert.equal(post.caption, null);
  assert.equal(post.displayUrl, null);
});

test("parseApifyInstagramPosts drops an item with no url — never usable as a candidate's sourceUrl", () => {
  const posts = parseApifyInstagramPosts([{ caption: "sin url", ownerUsername: "someacct" }]);
  assert.equal(posts.length, 0);
});

test("parseApifyInstagramPosts drops a non-object entry instead of throwing", () => {
  const posts = parseApifyInstagramPosts([null, "unexpected", 42, SAMPLE_ITEM]);
  assert.equal(posts.length, 1);
  assert.equal(posts[0].url, SAMPLE_ITEM.url);
});

test("parseApifyInstagramPosts handles an empty dataset", () => {
  assert.deepEqual(parseApifyInstagramPosts([]), []);
});

// inputUrl is a real documented output field of apify/instagram-post-scraper
// (the profile the actor was asked to scrape) — checked 2026-09-13 after
// 196/645 posts in one run were dropped as "unexpected owner" because
// collab posts report the co-author as ownerUsername.
test("parseApifyInstagramPosts parses inputUsername from the item's inputUrl", () => {
  const [post] = parseApifyInstagramPosts([{ ...SAMPLE_ITEM, inputUrl: "https://www.instagram.com/CasaCulturalYanulaque/" }]);
  assert.equal(post.inputUsername, "casaculturalyanulaque");
});

test("parseApifyInstagramPosts leaves inputUsername null without a usable inputUrl", () => {
  assert.equal(parseApifyInstagramPosts([SAMPLE_ITEM])[0].inputUsername, null);
  assert.equal(parseApifyInstagramPosts([{ ...SAMPLE_ITEM, inputUrl: "https://www.instagram.com/p/ABC123/" }])[0].inputUsername, null);
  assert.equal(parseApifyInstagramPosts([{ ...SAMPLE_ITEM, inputUrl: 42 }])[0].inputUsername, null);
});

test("usernameFromProfileUrl handles the shapes the actor actually emits", () => {
  assert.equal(usernameFromProfileUrl("https://www.instagram.com/galeriabarriosbajos/"), "galeriabarriosbajos");
  assert.equal(usernameFromProfileUrl("https://instagram.com/replica.galeria"), "replica.galeria");
  assert.equal(usernameFromProfileUrl("https://www.instagram.com/mac_uchile/?hl=es"), "mac_uchile");
  assert.equal(usernameFromProfileUrl("https://www.instagram.com/reel/XYZ/"), null);
  assert.equal(usernameFromProfileUrl(""), null);
});
