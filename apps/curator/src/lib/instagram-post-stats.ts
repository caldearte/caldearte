import type { ApifyInstagramPost } from "./apify-instagram.js";
import { getSupabaseClient } from "./supabase-client.js";

// Engagement of the source posts we fetch, persisted per post — see the
// instagram_source_post_stats migration for what it's for. Written for
// every fetched post, attributed or not, so a venue's traction is visible
// even for posts curation never saw. Best-effort: a failure is logged and
// never fails the run.
export interface InstagramPostStatsRow {
  post_url: string;
  source_account: string | null;
  owner_username: string;
  owner_full_name: string | null;
  posted_at: string | null;
  likes_count: number | null;
  comments_count: number | null;
  media_type: string | null;
  hashtags: string[];
}

export function postStatsRows(
  posts: ReadonlyArray<ApifyInstagramPost>,
  sourceAccountFor: (post: ApifyInstagramPost) => string | null,
): InstagramPostStatsRow[] {
  const byUrl = new Map<string, InstagramPostStatsRow>();
  for (const post of posts) {
    if (!post.url) continue;
    byUrl.set(post.url, {
      post_url: post.url,
      source_account: sourceAccountFor(post),
      owner_username: post.ownerUsername,
      owner_full_name: post.ownerFullName,
      posted_at: post.timestamp.length > 0 ? post.timestamp : null,
      likes_count: post.likesCount,
      comments_count: post.commentsCount,
      media_type: post.mediaType,
      hashtags: post.hashtags,
    });
  }
  return [...byUrl.values()];
}

export async function recordInstagramPostStats(rows: InstagramPostStatsRow[]): Promise<void> {
  if (rows.length === 0) return;
  const client = getSupabaseClient();
  const { error } = await client.from("instagram_source_post_stats").upsert(
    rows.map((r) => ({ ...r, fetched_at: new Date().toISOString() })),
    { onConflict: "post_url" },
  );
  if (error) {
    console.error(`[instagram-discovery] failed to record stats for ${rows.length} post(s): ${error.message}`);
    return;
  }
  console.log(`[instagram-discovery] engagement recorded for ${rows.length} fetched post(s)`);
}
