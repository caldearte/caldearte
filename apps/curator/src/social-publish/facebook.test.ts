import { test } from "node:test";
import assert from "node:assert/strict";
import { uploadUnpublishedPhoto, createMultiPhotoPost, publishFacebookPost, verifyFacebookPage, type FacebookClientConfig } from "./facebook.js";

const CONFIG: FacebookClientConfig = { pageId: "123456789", accessToken: "EAAtest" };

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

test("verifyFacebookPage returns the page name on success", async () => {
  const stub = (async () => jsonResponse({ name: "Caldearte", id: CONFIG.pageId })) as typeof fetch;
  const result = await withStubFetch(stub, () => verifyFacebookPage(CONFIG));
  assert.equal(result.name, "Caldearte");
});

test("verifyFacebookPage surfaces a Graph API error instead of reading a name from it", async () => {
  const stub = (async () => jsonResponse({ error: { message: "Invalid OAuth access token" } }, false)) as typeof fetch;
  await assert.rejects(() => withStubFetch(stub, () => verifyFacebookPage(CONFIG)), /Invalid OAuth access token/);
});

test("uploadUnpublishedPhoto posts the image url unpublished and returns its id", async () => {
  const stub = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(input as string);
    assert.equal(url.pathname, `/v21.0/${CONFIG.pageId}/photos`);
    assert.equal(init?.method, "POST");
    assert.equal(url.searchParams.get("url"), "https://example.com/1.jpg");
    assert.equal(url.searchParams.get("published"), "false");
    return jsonResponse({ id: "photo-1" });
  }) as typeof fetch;
  const id = await withStubFetch(stub, () => uploadUnpublishedPhoto(CONFIG, "https://example.com/1.jpg"));
  assert.equal(id, "photo-1");
});

test("uploadUnpublishedPhoto surfaces a Graph API error", async () => {
  const stub = (async () => jsonResponse({ error: { message: "Invalid parameter", code: 100 } }, false)) as typeof fetch;
  await assert.rejects(() => withStubFetch(stub, () => uploadUnpublishedPhoto(CONFIG, "https://example.com/1.jpg")), /Invalid parameter/);
});

test("createMultiPhotoPost attaches every photo id to one feed post", async () => {
  const stub = (async (input: RequestInfo | URL) => {
    const url = new URL(input as string);
    assert.equal(url.pathname, `/v21.0/${CONFIG.pageId}/feed`);
    assert.equal(url.searchParams.get("message"), "caption de prueba");
    assert.deepEqual(JSON.parse(url.searchParams.get("attached_media")!), [{ media_fbid: "photo-1" }, { media_fbid: "photo-2" }]);
    return jsonResponse({ id: "post-1" });
  }) as typeof fetch;
  const id = await withStubFetch(stub, () => createMultiPhotoPost(CONFIG, ["photo-1", "photo-2"], "caption de prueba"));
  assert.equal(id, "post-1");
});

test("publishFacebookPost uploads every image then creates one post referencing all of them", async () => {
  const uploadedUrls: string[] = [];
  const stub = (async (input: RequestInfo | URL) => {
    const url = new URL(input as string);
    if (url.pathname.endsWith("/photos")) {
      const imageUrl = url.searchParams.get("url")!;
      uploadedUrls.push(imageUrl);
      return jsonResponse({ id: `photo-${uploadedUrls.length}` });
    }
    assert.equal(url.pathname, `/v21.0/${CONFIG.pageId}/feed`);
    assert.deepEqual(JSON.parse(url.searchParams.get("attached_media")!), [{ media_fbid: "photo-1" }, { media_fbid: "photo-2" }]);
    return jsonResponse({ id: "post-1" });
  }) as typeof fetch;

  const postId = await withStubFetch(stub, () =>
    publishFacebookPost(CONFIG, ["https://example.com/1.jpg", "https://example.com/2.jpg"], "caption de prueba"),
  );
  assert.equal(postId, "post-1");
  assert.deepEqual(uploadedUrls.sort(), ["https://example.com/1.jpg", "https://example.com/2.jpg"]);
});

test("publishFacebookPost surfaces an upload error without creating a post", async () => {
  let feedCalls = 0;
  const stub = (async (input: RequestInfo | URL) => {
    const url = new URL(input as string);
    if (url.pathname.endsWith("/photos")) return jsonResponse({ error: { message: "Media download failed", code: 100 } }, false);
    feedCalls++;
    return jsonResponse({ id: "post-1" });
  }) as typeof fetch;

  await assert.rejects(
    () => withStubFetch(stub, () => publishFacebookPost(CONFIG, ["https://example.com/1.jpg"], "caption")),
    /Media download failed/,
  );
  assert.equal(feedCalls, 0, "should not create a feed post if a photo upload failed");
});
