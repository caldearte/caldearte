import { test } from "node:test";
import assert from "node:assert/strict";
import { parseApifyInstagramPosts } from "./apify-instagram.js";
import { postStatsRows } from "./instagram-post-stats.js";

// Real item shape from the 2026-09-18 dataset.
const ITEM = {
  url: "https://www.instagram.com/p/DdZRfbIBNai/",
  caption: "Este lunes 21 de septiembre se estrena un nuevo capítulo",
  timestamp: "2026-09-17T16:19:02.000Z",
  displayUrl: "https://scontent.cdninstagram.com/x.jpg",
  ownerUsername: "bnchile",
  ownerFullName: "Biblioteca Nacional de Chile",
  likesCount: 14,
  commentsCount: 0,
  type: "Image",
  hashtags: ["cultura", 42],
};

test("parseApifyInstagramPosts keeps engagement, format and hashtags", () => {
  const [post] = parseApifyInstagramPosts([ITEM]);
  assert.equal(post.ownerFullName, "Biblioteca Nacional de Chile");
  assert.equal(post.likesCount, 14);
  assert.equal(post.commentsCount, 0);
  assert.equal(post.mediaType, "Image");
  assert.deepEqual(post.hashtags, ["cultura"]);
  const [bare] = parseApifyInstagramPosts([{ url: ITEM.url, ownerUsername: "x" }]);
  assert.equal(bare.likesCount, null);
  assert.deepEqual(bare.hashtags, []);
});

test("postStatsRows builds one row per post URL with the attributed account", () => {
  const posts = parseApifyInstagramPosts([ITEM, ITEM, { ...ITEM, url: "https://www.instagram.com/p/OTHER/", ownerUsername: "nobody", likesCount: 3 }]);
  const rows = postStatsRows(posts, (p) => (p.ownerUsername === "bnchile" ? "bnchile" : null));
  assert.equal(rows.length, 2);
  assert.deepEqual(rows[0], {
    post_url: ITEM.url,
    source_account: "bnchile",
    owner_username: "bnchile",
    owner_full_name: "Biblioteca Nacional de Chile",
    posted_at: ITEM.timestamp,
    likes_count: 14,
    comments_count: 0,
    media_type: "Image",
    hashtags: ["cultura"],
  });
  assert.equal(rows[1].source_account, null);
  assert.equal(rows[1].likes_count, 3);
});
