import { test } from "node:test";
import assert from "node:assert/strict";
import { waitUntilContainerReady, publishInstagramCarousel, createCarouselItem, publishCarousel, type InstagramClientConfig } from "./instagram.js";

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

test("createCarouselItem retries a transient code-9004 media-download error instead of failing immediately — real bug found 2026-08-23: the same image URL had published fine one minute earlier in the same run", async () => {
  let calls = 0;
  const stub = (async () => {
    calls++;
    if (calls < 3) return jsonResponse({ error: { message: "Media download has failed.", code: 9004, error_subcode: 2207052 } }, false);
    return jsonResponse({ id: "creation-1" });
  }) as typeof fetch;
  const id = await withStubFetch(stub, () => createCarouselItem(CONFIG, "https://example.com/1.jpg", 0));
  assert.equal(id, "creation-1");
  assert.equal(calls, 3);
});

test("createCarouselItem gives up after 3 attempts of a persistent code-9004 error", async () => {
  let calls = 0;
  const stub = (async () => {
    calls++;
    return jsonResponse({ error: { message: "Media download has failed.", code: 9004 } }, false);
  }) as typeof fetch;
  await assert.rejects(() => withStubFetch(stub, () => createCarouselItem(CONFIG, "https://example.com/1.jpg", 0)), /code":9004/);
  assert.equal(calls, 3);
});

test("createCarouselItem does not retry a non-transient error (e.g. bad token)", async () => {
  let calls = 0;
  const stub = (async () => {
    calls++;
    return jsonResponse({ error: { message: "Invalid OAuth access token", code: 190 } }, false);
  }) as typeof fetch;
  await assert.rejects(() => withStubFetch(stub, () => createCarouselItem(CONFIG, "https://example.com/1.jpg", 0)), /Invalid OAuth access token/);
  assert.equal(calls, 1);
});

test("publishCarousel recovers from a code-4 throttle error by finding the just-published carousel — real bug found 2026-08-23: media_publish threw 'Application request limit reached' but the post was actually live on the real account minutes later", async () => {
  const stub = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(input as string);
    if (init?.method === "POST") {
      return jsonResponse({ error: { message: "Application request limit reached", code: 4, error_subcode: 2207051 } }, false);
    }
    // GET recent media — the recovery check
    assert.equal(url.pathname, `/v21.0/${CONFIG.igBusinessAccountId}/media`);
    return jsonResponse({
      data: [
        { id: "already-published-id", caption: "esta es la caption", timestamp: new Date().toISOString(), media_type: "CAROUSEL_ALBUM" },
        { id: "unrelated-older-post", caption: "otra caption", timestamp: new Date(Date.now() - 999_000).toISOString(), media_type: "IMAGE" },
      ],
    });
  }) as typeof fetch;

  const id = await withStubFetch(stub, () => publishCarousel(CONFIG, "container-123", "esta es la caption"));
  assert.equal(id, "already-published-id");
});

test("publishCarousel does not recover if no matching recent carousel is found — surfaces the real error instead of guessing", async () => {
  const stub = (async (input: RequestInfo | URL, init?: RequestInit) => {
    if (init?.method === "POST") {
      return jsonResponse({ error: { message: "Application request limit reached", code: 4 } }, false);
    }
    return jsonResponse({ data: [] });
  }) as typeof fetch;

  await assert.rejects(
    () => withStubFetch(stub, () => publishCarousel(CONFIG, "container-123", "esta es la caption")),
    /Application request limit reached/,
  );
});

test("publishCarousel does not attempt recovery for a non-throttle error", async () => {
  let getCalls = 0;
  const stub = (async (input: RequestInfo | URL, init?: RequestInit) => {
    if (init?.method === "POST") {
      return jsonResponse({ error: { message: "Invalid OAuth access token", code: 190 } }, false);
    }
    getCalls++;
    return jsonResponse({ data: [] });
  }) as typeof fetch;

  await assert.rejects(
    () => withStubFetch(stub, () => publishCarousel(CONFIG, "container-123", "esta es la caption")),
    /Invalid OAuth access token/,
  );
  assert.equal(getCalls, 0, "should not even check recent media for a non-throttle error");
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
