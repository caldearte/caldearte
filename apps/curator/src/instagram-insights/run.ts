// Weekly Instagram engagement refresh (docs/roadmap.md, Fase 4) — real
// question that motivated this, 2026-08-24: is Monday's deliberate
// "inauguraciones" repeat (same content as Sunday's, by design — see
// selection.ts's own doc comment) worth it, or too soon after Sunday to
// add real reach? Answering that needs real numbers over time, so this
// pipeline (a) snapshots the account's followers_count/media_count once
// per run, and (b) refreshes reach/saved/like_count/comments_count for
// every instagram_posts row from the last REFRESH_WINDOW_DAYS — not just
// brand-new posts, since Instagram's own engagement numbers keep
// climbing for days after a post goes up, so a post only measured once
// right after publishing would always look artificially low.
import { getSupabaseClient } from "../lib/supabase-client.js";
import { fetchAccountSnapshot, fetchMediaMetrics } from "../lib/instagram-insights.js";
import type { InstagramClientConfig } from "../social-publish/instagram.js";

const REFRESH_WINDOW_DAYS = 60;

export interface InstagramInsightsRunDeps {
  instagramConfig?: InstagramClientConfig;
  fetchAccountSnapshotFn?: typeof fetchAccountSnapshot;
  fetchMediaMetricsFn?: typeof fetchMediaMetrics;
  now?: Date;
}

export async function run(deps: InstagramInsightsRunDeps = {}): Promise<void> {
  const now = deps.now ?? new Date();
  const igBusinessAccountId = deps.instagramConfig?.igBusinessAccountId ?? process.env.INSTAGRAM_BUSINESS_ACCOUNT_ID;
  const accessToken = deps.instagramConfig?.accessToken ?? process.env.INSTAGRAM_ACCESS_TOKEN;
  if (!igBusinessAccountId || !accessToken) {
    console.error("[instagram-insights] INSTAGRAM_BUSINESS_ACCOUNT_ID/INSTAGRAM_ACCESS_TOKEN not set — skipping");
    return;
  }
  const instagramConfig: InstagramClientConfig = { igBusinessAccountId, accessToken };
  const fetchAccountSnapshotFn = deps.fetchAccountSnapshotFn ?? fetchAccountSnapshot;
  const fetchMediaMetricsFn = deps.fetchMediaMetricsFn ?? fetchMediaMetrics;
  const supabase = getSupabaseClient();

  try {
    const snapshot = await fetchAccountSnapshotFn(instagramConfig);
    const { error } = await supabase
      .from("instagram_account_snapshots")
      .upsert(
        { snapshot_date: now.toISOString().slice(0, 10), followers_count: snapshot.followersCount, media_count: snapshot.mediaCount },
        { onConflict: "snapshot_date" },
      );
    if (error) console.error(`[instagram-insights] failed to upsert account snapshot: ${error.message}`);
    else console.log(`[instagram-insights] account snapshot: ${snapshot.followersCount} followers, ${snapshot.mediaCount} posts`);
  } catch (err) {
    console.error(`[instagram-insights] failed to fetch account snapshot: ${(err as Error).message}`);
  }

  const cutoff = new Date(now.getTime() - REFRESH_WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const { data: posts, error: postsError } = await supabase
    .from("instagram_posts")
    .select("id, media_id")
    .gte("published_at", cutoff);
  if (postsError) {
    console.error(`[instagram-insights] failed to load instagram_posts: ${postsError.message}`);
    return;
  }
  if (!posts || posts.length === 0) {
    console.log("[instagram-insights] no posts in the refresh window — nothing to do");
    return;
  }

  let refreshed = 0;
  for (const post of posts) {
    const metrics = await fetchMediaMetricsFn(instagramConfig, post.media_id);
    const { error } = await supabase
      .from("instagram_posts")
      .update({
        reach: metrics.reach,
        saved: metrics.saved,
        like_count: metrics.likeCount,
        comments_count: metrics.commentsCount,
        metrics_updated_at: now.toISOString(),
      })
      .eq("id", post.id);
    if (error) console.error(`[instagram-insights] failed to update metrics for ${post.media_id}: ${error.message}`);
    else refreshed++;
  }

  console.log(`[instagram-insights] refreshed metrics for ${refreshed}/${posts.length} post(s)`);
}
