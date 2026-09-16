import type { ApifyInstagramPost } from "./apify-instagram.js";
import { getSupabaseClient } from "./supabase-client.js";

// One edge = a fetched post shared between a registered account and an
// Instagram username we don't follow. See the migration
// (instagram_collab_edges) for why the graph is persisted at all: the
// handles that recur across different registered venues are the venue
// candidates the registry is missing, and Apify's datasets expire before
// that recurrence is visible. Built from EVERY fetched post, including
// the ones resolveAccountForPost drops — a post whose author and
// co-authors are all unregistered simply yields no edge.
export interface InstagramCollabEdge {
  postUrl: string;
  postedAt: string | null;
  registeredAccount: string;
  handle: string;
  handleRole: "author" | "coauthor";
}

export function collabEdgesForPosts(
  posts: ReadonlyArray<Pick<ApifyInstagramPost, "url" | "timestamp" | "ownerUsername" | "coauthorUsernames">>,
  registeredUsernames: ReadonlySet<string>,
): InstagramCollabEdge[] {
  const edges: InstagramCollabEdge[] = [];
  const seen = new Set<string>();
  for (const post of posts) {
    const author = post.ownerUsername.trim().toLowerCase();
    const parties = [...new Set([author, ...post.coauthorUsernames.map((u) => u.toLowerCase())])].filter((u) => u.length > 0);
    const registered = parties.filter((u) => registeredUsernames.has(u));
    const unregistered = parties.filter((u) => !registeredUsernames.has(u));
    if (registered.length === 0 || unregistered.length === 0) continue;
    const postedAt = post.timestamp.length > 0 ? post.timestamp : null;
    for (const registeredAccount of registered) {
      for (const handle of unregistered) {
        const key = `${post.url} ${registeredAccount} ${handle}`;
        if (seen.has(key)) continue;
        seen.add(key);
        edges.push({ postUrl: post.url, postedAt, registeredAccount, handle, handleRole: handle === author ? "author" : "coauthor" });
      }
    }
  }
  return edges;
}

// Append-only; the table's natural key makes a re-fetched post a no-op
// instead of a duplicate. A failure here is logged and never fails the
// run — the graph is a side channel, not part of curation.
export async function recordInstagramCollabEdges(edges: InstagramCollabEdge[]): Promise<void> {
  if (edges.length === 0) return;
  const client = getSupabaseClient();
  const { error } = await client.from("instagram_collab_edges").upsert(
    edges.map((e) => ({
      post_url: e.postUrl,
      posted_at: e.postedAt,
      registered_account: e.registeredAccount,
      handle: e.handle,
      handle_role: e.handleRole,
    })),
    { onConflict: "post_url,registered_account,handle", ignoreDuplicates: true },
  );
  if (error) {
    console.error(`[instagram-discovery] failed to record ${edges.length} collab edge(s): ${error.message}`);
    return;
  }
  console.log(`[instagram-discovery] ${edges.length} collab edge(s) recorded (${new Set(edges.map((e) => e.handle)).size} unregistered handle(s))`);
}
