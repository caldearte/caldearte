import { test } from "node:test";
import assert from "node:assert/strict";
import { parseApifyInstagramPosts, parseApifyInstagramPostsWithStats, usernameFromProfileUrl, isInstagramPostUrl, coauthorUsernamesOf } from "./apify-instagram.js";

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

// Real shape from the 2026-09-15 run: coauthorProducers is a list of
// {id, is_verified, profile_pic_url, username} on collab posts, absent
// otherwise. Usernames are lowercased so they match the registry the same
// way ownerUsername does.
test("parseApifyInstagramPosts extracts co-author usernames from coauthorProducers", () => {
  const [post] = parseApifyInstagramPosts([{
    ...SAMPLE_ITEM,
    ownerUsername: "munisanfelipe",
    coauthorProducers: [
      { id: "1", is_verified: false, profile_pic_url: "https://x/y.jpg", username: "turismomunisanfe" },
      { id: "2", is_verified: false, profile_pic_url: "https://x/z.jpg", username: "CulturaMuniSanFelipe" },
    ],
  }]);
  assert.deepEqual(post.coauthorUsernames, ["turismomunisanfe", "culturamunisanfelipe"]);
});

test("coauthorUsernamesOf is empty for a missing or malformed field", () => {
  assert.deepEqual(coauthorUsernamesOf(undefined), []);
  assert.deepEqual(coauthorUsernamesOf("nope"), []);
  assert.deepEqual(coauthorUsernamesOf([{ id: "1" }, null, { username: 42 }, { username: " ok " }]), ["ok"]);
  assert.deepEqual(parseApifyInstagramPosts([SAMPLE_ITEM])[0].coauthorUsernames, []);
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

// Real production finding, first daily run 2026-09-14: the actor pushes
// one non-post item per requested profile with nothing new in the window
// (no owner, no caption, inputUrl set). Attributed by inputUrl they looked
// like 111 "collab" posts and 113 "thin captions" in one run, and reset
// every account's dormancy streak. A post is a post only if its URL is one.
test("parseApifyInstagramPostsWithStats drops items whose url is not a post URL and counts them as placeholders", () => {
  const { posts, placeholders } = parseApifyInstagramPostsWithStats([
    SAMPLE_ITEM,
    { inputUrl: "https://www.instagram.com/quiet_account/", url: "https://www.instagram.com/quiet_account/", ownerUsername: "", caption: null },
    { inputUrl: "https://www.instagram.com/gone_account/", url: "", error: "not_found" },
    { url: "https://www.instagram.com/reel/XYZ123/", ownerUsername: "someacct", caption: "un reel" },
  ]);
  assert.equal(posts.length, 2);
  assert.equal(placeholders, 2);
  assert.deepEqual(posts.map((p) => p.url), [SAMPLE_ITEM.url, "https://www.instagram.com/reel/XYZ123/"]);
});

test("isInstagramPostUrl: post/reel/tv shortcode URLs yes, profile/explore/empty no", () => {
  assert.equal(isInstagramPostUrl("https://www.instagram.com/p/DdJ0l85jtf4/"), true);
  assert.equal(isInstagramPostUrl("https://instagram.com/reel/Abc-_12/?utm=x"), true);
  assert.equal(isInstagramPostUrl("https://www.instagram.com/tv/Abc12/"), true);
  assert.equal(isInstagramPostUrl("https://www.instagram.com/casaculturalyanulaque/"), false);
  assert.equal(isInstagramPostUrl("https://www.instagram.com/explore/tags/arte/"), false);
  assert.equal(isInstagramPostUrl(""), false);
});
