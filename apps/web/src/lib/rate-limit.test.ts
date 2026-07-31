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

// Integration test against local Supabase (needs `check_rate_limit`, from
// migration 20260731160000). Run `supabase start`, then export
// NEXT_PUBLIC_SUPABASE_URL/NEXT_PUBLIC_SUPABASE_ANON_KEY pointing at it
// before running this suite — real .env.local points at production, which
// doesn't have this migration yet (held for review), so these must be set
// explicitly rather than picked up automatically.
const hasLocalSupabaseEnv = Boolean(process.env.LOCAL_SUPABASE_URL && process.env.LOCAL_SUPABASE_ANON_KEY);

test(
  "isWithinRateLimit: allows calls under the max, blocks once the max is exceeded within the window",
  { skip: !hasLocalSupabaseEnv },
  async () => {
    const originalUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const originalKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    process.env.NEXT_PUBLIC_SUPABASE_URL = process.env.LOCAL_SUPABASE_URL;
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = process.env.LOCAL_SUPABASE_ANON_KEY;

    try {
      const { isWithinRateLimit } = await import("./rate-limit.js");
      const bucketKey = `test:${crypto.randomUUID()}`; // fresh key so this test never collides with a prior run

      const results: boolean[] = [];
      for (let i = 0; i < 4; i++) {
        results.push(await isWithinRateLimit(bucketKey, 3, 3600));
      }

      assert.deepEqual(results, [true, true, true, false]);
    } finally {
      process.env.NEXT_PUBLIC_SUPABASE_URL = originalUrl;
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = originalKey;
    }
  },
);
