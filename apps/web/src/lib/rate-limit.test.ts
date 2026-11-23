import { test } from "node:test";
import assert from "node:assert/strict";

test("clientIp: falls back to a shared bucket when there's no x-real-ip header (e.g. local dev, no Vercel proxy)", async () => {
  const { clientIp } = await import("./rate-limit.js");
  const req = new Request("https://example.com");
  assert.equal(clientIp(req), "unknown");
});

test("clientIp: reads Vercel's x-real-ip header when present", async () => {
  const { clientIp } = await import("./rate-limit.js");
  const req = new Request("https://example.com", { headers: { "x-real-ip": "203.0.113.7" } });
  assert.equal(clientIp(req), "203.0.113.7");
});

// isWithinRateLimit talks to the rate-limit Edge Function (see
// supabase/functions/rate-limit); fetch is stubbed so these run offline.
async function withStubbedFetch(
  respond: (url: string, init: RequestInit) => Response | Promise<Response>,
  run: (calls: { url: string; init: RequestInit }[]) => Promise<void>,
  env: Record<string, string | undefined> = { NEXT_PUBLIC_SUPABASE_URL: "https://proj.supabase.co", ADMIN_ACTIONS_SECRET: "s3cret" },
) {
  const originalFetch = globalThis.fetch;
  const originalEnv = { url: process.env.NEXT_PUBLIC_SUPABASE_URL, secret: process.env.ADMIN_ACTIONS_SECRET };
  const calls: { url: string; init: RequestInit }[] = [];
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(input), init: init ?? {} });
    return respond(String(input), init ?? {});
  }) as typeof fetch;
  for (const [k, v] of Object.entries(env)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  try {
    await run(calls);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalEnv.url === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    else process.env.NEXT_PUBLIC_SUPABASE_URL = originalEnv.url;
    if (originalEnv.secret === undefined) delete process.env.ADMIN_ACTIONS_SECRET;
    else process.env.ADMIN_ACTIONS_SECRET = originalEnv.secret;
  }
}

test("isWithinRateLimit: posts the bucket to the rate-limit function with the shared secret and returns its answer", async () => {
  const { isWithinRateLimit } = await import("./rate-limit.js");
  await withStubbedFetch(
    () => Response.json({ allowed: false }),
    async (calls) => {
      assert.equal(await isWithinRateLimit("contact:203.0.113.7", 5, 3600), false);
      assert.equal(calls.length, 1);
      assert.equal(calls[0].url, "https://proj.supabase.co/functions/v1/rate-limit");
      assert.equal((calls[0].init.headers as Record<string, string>)["x-admin-secret"], "s3cret");
      assert.deepEqual(JSON.parse(String(calls[0].init.body)), { bucketKey: "contact:203.0.113.7", maxCount: 5, windowSeconds: 3600 });
    },
  );
  await withStubbedFetch(
    () => Response.json({ allowed: true }),
    async () => assert.equal(await isWithinRateLimit("contact:x", 5, 3600), true),
  );
});

test("isWithinRateLimit: fails open when the function errors, answers garbage, or is unreachable", async () => {
  const { isWithinRateLimit } = await import("./rate-limit.js");
  await withStubbedFetch(
    () => Response.json({ error: "error" }, { status: 500 }),
    async () => assert.equal(await isWithinRateLimit("contact:x", 5, 3600), true),
  );
  await withStubbedFetch(
    () => new Response("not json", { status: 200 }),
    async () => assert.equal(await isWithinRateLimit("contact:x", 5, 3600), true),
  );
  await withStubbedFetch(
    () => {
      throw new Error("network down");
    },
    async () => assert.equal(await isWithinRateLimit("contact:x", 5, 3600), true),
  );
});

test("isWithinRateLimit: fails open without calling anything when the secret isn't configured", async () => {
  const { isWithinRateLimit } = await import("./rate-limit.js");
  await withStubbedFetch(
    () => Response.json({ allowed: false }),
    async (calls) => {
      assert.equal(await isWithinRateLimit("contact:x", 5, 3600), true);
      assert.equal(calls.length, 0);
    },
    { NEXT_PUBLIC_SUPABASE_URL: "https://proj.supabase.co", ADMIN_ACTIONS_SECRET: undefined },
  );
});
