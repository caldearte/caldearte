import { test } from "node:test";
import assert from "node:assert/strict";
import { run } from "./run.js";

const hasLocalSupabase = Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);

test("run(): missing Instagram credentials skips without throwing", async () => {
  const originalUrl = process.env.SUPABASE_URL;
  const originalKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  // Deliberately no instagramConfig and no env vars — must return before
  // ever touching Supabase, so no real credentials are needed for this
  // one case even outside the Supabase-gated suite below.
  delete process.env.INSTAGRAM_BUSINESS_ACCOUNT_ID;
  delete process.env.INSTAGRAM_ACCESS_TOKEN;
  try {
    await run({});
  } finally {
    if (originalUrl) process.env.SUPABASE_URL = originalUrl;
    if (originalKey) process.env.SUPABASE_SERVICE_ROLE_KEY = originalKey;
  }
});

test(
  "instagram-insights run integration (requires local Supabase)",
  { skip: !hasLocalSupabase && "SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY not set" },
  async (t) => {
    const { getSupabaseClient } = await import("../lib/supabase-client.js");
    const client = getSupabaseClient();
    const NOW = new Date("2026-08-24T12:00:00.000Z");

    await t.test("snapshots the account and refreshes metrics for posts in the refresh window", async () => {
      await client.from("instagram_account_snapshots").delete().eq("snapshot_date", "2026-08-24");
      const { error: insertError } = await client
        .from("instagram_posts")
        .insert({ media_id: "__test_media_recent__", post_type: "inauguracion", week_start: "2026-08-17", published_at: "2026-08-23T12:00:00.000Z" });
      if (insertError) throw new Error(`Failed to seed instagram_posts: ${insertError.message}`);

      try {
        await run({
          now: NOW,
          instagramConfig: { igBusinessAccountId: "fake-account", accessToken: "fake-token" },
          fetchAccountSnapshotFn: async () => ({ followersCount: 321, mediaCount: 42 }),
          fetchMediaMetricsFn: async () => ({ reach: 900, saved: 15, likeCount: 60, commentsCount: 4 }),
        });

        const { data: snapshotRows } = await client.from("instagram_account_snapshots").select("*").eq("snapshot_date", "2026-08-24");
        assert.equal(snapshotRows?.length, 1);
        assert.equal(snapshotRows?.[0].followers_count, 321);
        assert.equal(snapshotRows?.[0].media_count, 42);

        const { data: postRows } = await client.from("instagram_posts").select("*").eq("media_id", "__test_media_recent__");
        assert.equal(postRows?.length, 1);
        assert.equal(postRows?.[0].reach, 900);
        assert.equal(postRows?.[0].saved, 15);
        assert.equal(postRows?.[0].like_count, 60);
        assert.equal(postRows?.[0].comments_count, 4);
        assert.ok(postRows?.[0].metrics_updated_at, "metrics_updated_at should be set after a refresh");
      } finally {
        await client.from("instagram_posts").delete().eq("media_id", "__test_media_recent__");
        await client.from("instagram_account_snapshots").delete().eq("snapshot_date", "2026-08-24");
      }
    });

    await t.test("a post older than the refresh window is left untouched", async () => {
      const { error: insertError } = await client
        .from("instagram_posts")
        .insert({ media_id: "__test_media_old__", post_type: "destacada", week_start: "2026-01-05", published_at: "2026-01-10T12:00:00.000Z" });
      if (insertError) throw new Error(`Failed to seed instagram_posts: ${insertError.message}`);

      try {
        let fetchCalled = false;
        await run({
          now: NOW,
          instagramConfig: { igBusinessAccountId: "fake-account", accessToken: "fake-token" },
          fetchAccountSnapshotFn: async () => ({ followersCount: 1, mediaCount: 1 }),
          fetchMediaMetricsFn: async (_config, mediaId) => {
            if (mediaId === "__test_media_old__") fetchCalled = true;
            return { reach: 1, saved: 1, likeCount: 1, commentsCount: 1 };
          },
        });

        assert.equal(fetchCalled, false, "a post outside the refresh window must never be fetched");
        const { data: postRows } = await client.from("instagram_posts").select("reach").eq("media_id", "__test_media_old__");
        assert.equal(postRows?.[0].reach, null);
      } finally {
        await client.from("instagram_posts").delete().eq("media_id", "__test_media_old__");
        await client.from("instagram_account_snapshots").delete().eq("snapshot_date", "2026-08-24");
      }
    });
  },
);
