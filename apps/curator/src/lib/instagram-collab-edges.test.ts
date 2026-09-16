import { test } from "node:test";
import assert from "node:assert/strict";
import { collabEdgesForPosts } from "./instagram-collab-edges.js";

const REGISTRY = new Set(["ccserhumano", "culturacoyhaique"]);
const base = { url: "https://www.instagram.com/p/DdRgrUzEWEK/", timestamp: "2026-09-14T15:00:00.000Z" };

// Real shape from 2026-09-15: culturas_atacama's post co-authored with
// museoregionaldeatacama, cajacrisol_arte and ccserhumano (registered).
test("collabEdgesForPosts links every unregistered party to every registered one, with the author's side marked", () => {
  const edges = collabEdgesForPosts(
    [{ ...base, ownerUsername: "culturas_atacama", coauthorUsernames: ["museoregionaldeatacama", "cajacrisol_arte", "ccserhumano"] }],
    REGISTRY,
  );
  assert.deepEqual(
    edges.map((e) => [e.registeredAccount, e.handle, e.handleRole]),
    [
      ["ccserhumano", "culturas_atacama", "author"],
      ["ccserhumano", "museoregionaldeatacama", "coauthor"],
      ["ccserhumano", "cajacrisol_arte", "coauthor"],
    ],
  );
  assert.equal(edges[0].postUrl, base.url);
  assert.equal(edges[0].postedAt, base.timestamp);
});

test("collabEdgesForPosts yields nothing for a post with no registered party or no unregistered party", () => {
  assert.deepEqual(collabEdgesForPosts([{ ...base, ownerUsername: "la_erre", coauthorUsernames: ["mercadoparislondres"] }], REGISTRY), []);
  assert.deepEqual(collabEdgesForPosts([{ ...base, ownerUsername: "ccserhumano", coauthorUsernames: [] }], REGISTRY), []);
  assert.deepEqual(collabEdgesForPosts([{ ...base, ownerUsername: "ccserhumano", coauthorUsernames: ["culturacoyhaique"] }], REGISTRY), []);
});

test("collabEdgesForPosts dedupes the same post fetched twice and normalises case", () => {
  const post = { ...base, ownerUsername: "CulturaCoyhaique", coauthorUsernames: ["LaFoco_Coyhaique", "lafoco_coyhaique"] };
  const edges = collabEdgesForPosts([post, post], REGISTRY);
  assert.deepEqual(edges.map((e) => [e.registeredAccount, e.handle, e.handleRole]), [["culturacoyhaique", "lafoco_coyhaique", "coauthor"]]);
});

test("collabEdgesForPosts leaves postedAt null when the actor gave no timestamp", () => {
  const [edge] = collabEdgesForPosts([{ ...base, timestamp: "", ownerUsername: "x", coauthorUsernames: ["ccserhumano"] }], REGISTRY);
  assert.equal(edge.postedAt, null);
});
