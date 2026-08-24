import { test } from "node:test";
import assert from "node:assert/strict";
import { fetchAccountSnapshot, fetchMediaMetrics } from "./instagram-insights.js";
import type { InstagramClientConfig } from "../social-publish/instagram.js";

const CONFIG: InstagramClientConfig = { igBusinessAccountId: "17841432827710890", accessToken: "IGAAtest" };

function jsonResponse(body: unknown, ok = true): Response {
  return { ok, json: async () => body } as Response;
}

async function withStubFetch<T>(stub: typeof fetch, fn: () => Promise<T>): Promise<T> {
  const original = globalThis.fetch;
  globalThis.fetch = stub;
  try {
    return await fn();
  } finally {
    globalThis.fetch = original;
  }
}

test("fetchAccountSnapshot maps followers_count/media_count", async () => {
  const stub = (async () => jsonResponse({ followers_count: 1234, media_count: 56 })) as typeof fetch;
  const snapshot = await withStubFetch(stub, () => fetchAccountSnapshot(CONFIG));
  assert.deepEqual(snapshot, { followersCount: 1234, mediaCount: 56 });
});

test("fetchAccountSnapshot throws on a real Graph API error", async () => {
  const stub = (async () => jsonResponse({ error: { message: "Invalid token" } }, false)) as typeof fetch;
  await assert.rejects(() => withStubFetch(stub, () => fetchAccountSnapshot(CONFIG)), /Invalid token/);
});

test("fetchMediaMetrics combines like_count/comments_count (media fields) with reach/saved (insights endpoint)", async () => {
  const stub = (async (input: RequestInfo | URL) => {
    const url = new URL(input as string);
    if (url.pathname.endsWith("/insights")) {
      return jsonResponse({ data: [{ name: "reach", values: [{ value: 500 }] }, { name: "saved", values: [{ value: 12 }] }] });
    }
    return jsonResponse({ like_count: 40, comments_count: 3 });
  }) as typeof fetch;

  const metrics = await withStubFetch(stub, () => fetchMediaMetrics(CONFIG, "media123"));
  assert.deepEqual(metrics, { reach: 500, saved: 12, likeCount: 40, commentsCount: 3 });
});

test("fetchMediaMetrics never throws — a failed insights call still returns whatever the media-fields call recovered", async () => {
  const stub = (async (input: RequestInfo | URL) => {
    const url = new URL(input as string);
    if (url.pathname.endsWith("/insights")) {
      return jsonResponse({ error: { message: "Media type does not support insights" } }, false);
    }
    return jsonResponse({ like_count: 40, comments_count: 3 });
  }) as typeof fetch;

  const metrics = await withStubFetch(stub, () => fetchMediaMetrics(CONFIG, "media123"));
  assert.deepEqual(metrics, { reach: null, saved: null, likeCount: 40, commentsCount: 3 });
});

test("fetchMediaMetrics returns all-null, never throws, when both calls fail", async () => {
  const stub = (async () => jsonResponse({ error: { message: "nope" } }, false)) as typeof fetch;
  const metrics = await withStubFetch(stub, () => fetchMediaMetrics(CONFIG, "media123"));
  assert.deepEqual(metrics, { reach: null, saved: null, likeCount: null, commentsCount: null });
});

test("fetchMediaMetrics survives a thrown network error on either call", async () => {
  const stub = (async () => {
    throw new Error("network down");
  }) as typeof fetch;
  const metrics = await withStubFetch(stub, () => fetchMediaMetrics(CONFIG, "media123"));
  assert.deepEqual(metrics, { reach: null, saved: null, likeCount: null, commentsCount: null });
});
