// Read-only Instagram Graph API calls for engagement tracking
// (instagram-insights/run.ts) — separate from social-publish/instagram.ts
// (the write-side publish flow) since this never touches publishing, but
// reuses its InstagramClientConfig/host, same account/token.
import type { InstagramClientConfig } from "../social-publish/instagram.js";

const GRAPH_API_BASE = "https://graph.instagram.com/v21.0";

export interface AccountSnapshot {
  followersCount: number;
  mediaCount: number;
}

export async function fetchAccountSnapshot(config: InstagramClientConfig): Promise<AccountSnapshot> {
  const url = new URL(`${GRAPH_API_BASE}/${config.igBusinessAccountId}`);
  url.searchParams.set("fields", "followers_count,media_count");
  url.searchParams.set("access_token", config.accessToken);
  const res = await fetch(url);
  const body = await res.json();
  if (!res.ok) throw new Error(`Instagram Graph API error fetching account snapshot: ${JSON.stringify(body)}`);
  return { followersCount: body.followers_count, mediaCount: body.media_count };
}

export interface MediaMetrics {
  reach: number | null;
  saved: number | null;
  likeCount: number | null;
  commentsCount: number | null;
}

const EMPTY_METRICS: MediaMetrics = { reach: null, saved: null, likeCount: null, commentsCount: null };

// Two separate real Graph API concepts, both needed for the full
// picture: like_count/comments_count live on the media object itself
// (like verifyInstagramAccount's plain field fetch), while reach/saved
// are Instagram-specific "insights" requiring the dedicated /insights
// endpoint. Never throws — a metric this media type/API version doesn't
// support, or a container-level media the endpoint rejects, must not
// fail the whole weekly refresh over one post; logs and returns
// whatever was actually recoverable (all-null in the worst case) rather
// than losing every other post's real data in the same run.
export async function fetchMediaMetrics(config: InstagramClientConfig, mediaId: string): Promise<MediaMetrics> {
  const metrics: MediaMetrics = { ...EMPTY_METRICS };

  try {
    const fieldsUrl = new URL(`${GRAPH_API_BASE}/${mediaId}`);
    fieldsUrl.searchParams.set("fields", "like_count,comments_count");
    fieldsUrl.searchParams.set("access_token", config.accessToken);
    const fieldsRes = await fetch(fieldsUrl);
    const fieldsBody = await fieldsRes.json();
    if (fieldsRes.ok) {
      metrics.likeCount = typeof fieldsBody.like_count === "number" ? fieldsBody.like_count : null;
      metrics.commentsCount = typeof fieldsBody.comments_count === "number" ? fieldsBody.comments_count : null;
    } else {
      console.error(`[instagram-insights] like_count/comments_count fetch failed for ${mediaId}: ${JSON.stringify(fieldsBody)}`);
    }
  } catch (err) {
    console.error(`[instagram-insights] like_count/comments_count fetch threw for ${mediaId}: ${(err as Error).message}`);
  }

  try {
    const insightsUrl = new URL(`${GRAPH_API_BASE}/${mediaId}/insights`);
    insightsUrl.searchParams.set("metric", "reach,saved");
    insightsUrl.searchParams.set("access_token", config.accessToken);
    const insightsRes = await fetch(insightsUrl);
    const insightsBody = await insightsRes.json();
    if (insightsRes.ok) {
      for (const entry of (insightsBody.data ?? []) as { name: string; values: { value: number }[] }[]) {
        const value = entry.values?.[0]?.value;
        if (typeof value !== "number") continue;
        if (entry.name === "reach") metrics.reach = value;
        if (entry.name === "saved") metrics.saved = value;
      }
    } else {
      console.error(`[instagram-insights] reach/saved insights fetch failed for ${mediaId}: ${JSON.stringify(insightsBody)}`);
    }
  } catch (err) {
    console.error(`[instagram-insights] reach/saved insights fetch threw for ${mediaId}: ${(err as Error).message}`);
  }

  return metrics;
}
