import { test } from "node:test";
import assert from "node:assert/strict";
import { waitUntilContainerReady, publishInstagramCarousel, type InstagramClientConfig } from "./instagram.js";

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

test("waitUntilContainerReady returns immediately when the container is already FINISHED", async () => {
  let calls = 0;
  const stub = (async () => {
    calls++;
    return jsonResponse({ status_code: "FINISHED" });
  }) as typeof fetch;
  await withStubFetch(stub, () => waitUntilContainerReady(CONFIG, "container123", 0));
  assert.equal(calls, 1);
});

test("waitUntilContainerReady polls until FINISHED — real bug found 2026-08-23 publishing a real 10-image carousel: media_publish failed because the container was still IN_PROGRESS", async () => {
  let calls = 0;
  const stub = (async () => {
    calls++;
    return jsonResponse({ status_code: calls < 3 ? "IN_PROGRESS" : "FINISHED" });
  }) as typeof fetch;
  await withStubFetch(stub, () => waitUntilContainerReady(CONFIG, "container123", 0));
  assert.equal(calls, 3);
});

test("waitUntilContainerReady throws on ERROR status instead of polling forever", async () => {
  const stub = (async () => jsonResponse({ status_code: "ERROR" })) as typeof fetch;
  await assert.rejects(() => withStubFetch(stub, () => waitUntilContainerReady(CONFIG, "container123", 0)), /status_code: ERROR/);
});

test("waitUntilContainerReady throws on EXPIRED status", async () => {
  const stub = (async () => jsonResponse({ status_code: "EXPIRED" })) as typeof fetch;
  await assert.rejects(() => withStubFetch(stub, () => waitUntilContainerReady(CONFIG, "container123", 0)), /status_code: EXPIRED/);
});

test("waitUntilContainerReady surfaces a Graph API error response instead of reading status_code from it", async () => {
  const stub = (async () => jsonResponse({ error: { message: "Invalid OAuth access token" } }, false)) as typeof fetch;
  await assert.rejects(
    () => withStubFetch(stub, () => waitUntilContainerReady(CONFIG, "container123", 0)),
    /Invalid OAuth access token/,
  );
});

test("publishInstagramCarousel waits for the container to be ready before calling media_publish", async () => {
  const calledPaths: string[] = [];
  let statusCalls = 0;
  const stub = (async (input: RequestInfo | URL) => {
    const url = new URL(input as string);
    calledPaths.push(url.pathname);
    if (url.pathname.endsWith("/media_publish")) return jsonResponse({ id: "published-media-id" });
    if (url.pathname.endsWith("/media")) return jsonResponse({ id: `creation-${calledPaths.length}` });
    // GET status check on the container id
    statusCalls++;
    return jsonResponse({ status_code: statusCalls < 2 ? "IN_PROGRESS" : "FINISHED" });
  }) as typeof fetch;

  const publishedId = await withStubFetch(stub, () =>
    publishInstagramCarousel(CONFIG, ["https://example.com/1.jpg", "https://example.com/2.jpg"], "caption", 0),
  );

  assert.equal(publishedId, "published-media-id");
  assert.equal(statusCalls, 2);
  assert.equal(calledPaths.at(-1), `/v21.0/${CONFIG.igBusinessAccountId}/media_publish`);
});
